import { useCallback, useEffect, useRef, useState } from 'react';
import {
  analyzePetPhoto,
  type PetVisionResult,
} from '../../services/petVisionService';
import { AiApiError } from '../../services/aiApi';
import { AI_LIMITS } from '../../shared/ai/contract';
import { logEvent } from '../../lib/analytics';
import { useLanguage } from '../../app/providers/LanguageProvider';
import { translate } from '../../i18n/translate';

export type VisionStatus = 'idle' | 'analyzing' | 'done' | 'error';

/** Max accepted image bytes before analysis (5 MB) — keeps payloads sane. */
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/**
 * Downscale target. A phone camera shoots 12–48 MP; the model needs nothing
 * like that to judge breed, body condition or coat, and the `ai-vision`
 * function bounds the base64 payload (`AI_LIMITS.maxImageBase64Chars`). A
 * 1600 px longest edge at JPEG q0.85 is typically 200–600 kB — well under the
 * cap, and a much faster upload on mobile data.
 */
const MAX_EDGE_PX = 1600;
const JPEG_QUALITY = 0.85;

interface FileParts {
  base64: string;
  mimeType: string;
  /** object URL for preview; caller revokes on reset. */
  previewUrl: string;
}

/**
 * Re-encode the photo at ≤ MAX_EDGE_PX on its longest edge as JPEG.
 *
 * Returns null wherever the browser can't do it (no `createImageBitmap` /
 * 2D canvas — jsdom, very old WebViews) or the decode fails; the caller then
 * falls back to the raw file so the pre-existing path still works. Always
 * JPEG: transparent pixels are flattened onto white first so a PNG with an
 * alpha background doesn't come out black.
 */
async function downscaleImage(file: File): Promise<Blob | null> {
  if (typeof createImageBitmap !== 'function' || typeof document === 'undefined') return null;
  let bitmap: ImageBitmap;
  try {
    // Honour EXIF orientation where the option is supported (phone photos are
    // routinely stored rotated); fall back to a plain decode otherwise.
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' }).catch(() =>
      createImageBitmap(file),
    );
  } catch {
    return null;
  }
  try {
    const longest = Math.max(bitmap.width, bitmap.height);
    if (!longest) return null;
    const scale = Math.min(1, MAX_EDGE_PX / longest);
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(bitmap, 0, 0, width, height);

    const blob = await new Promise<Blob | null>((resolve) => {
      try {
        canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY);
      } catch {
        resolve(null);
      }
    });
    if (!blob || blob.size === 0) return null;
    // A small, already-optimised JPEG can re-encode LARGER than the source;
    // only take the re-encode when it actually shrank something.
    if (scale >= 1 && blob.size >= file.size) return null;
    return blob;
  } catch {
    return null;
  } finally {
    bitmap.close?.();
  }
}

/**
 * Read `source` (the downscaled blob, or the original file) as base64.
 * The preview URL is always minted from the ORIGINAL file so what the user
 * sees is exactly what they picked.
 */
function readFileParts(source: Blob, original: File): Promise<FileParts> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read the image file.'));
    reader.onload = () => {
      const result = reader.result as string;
      // Data URL: "data:image/jpeg;base64,XXXX" → strip the prefix.
      const comma = result.indexOf(',');
      const base64 = comma >= 0 ? result.slice(comma + 1) : result;
      resolve({
        base64,
        mimeType: source.type || original.type || 'image/jpeg',
        previewUrl: URL.createObjectURL(original),
      });
    };
    reader.readAsDataURL(source);
  });
}

export interface UsePetVision {
  status: VisionStatus;
  result: PetVisionResult | null;
  previewUrl: string | null;
  error: string | null;
  analyzeFile: (file: File) => Promise<PetVisionResult | null>;
  reset: () => void;
}

export function usePetVision(): UsePetVision {
  const { locale } = useLanguage();
  const [status, setStatus] = useState<VisionStatus>('idle');
  const [result, setResult] = useState<PetVisionResult | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const previewRef = useRef<string | null>(null);
  // Monotonic id so a slow analysis from an earlier pick can't overwrite the
  // result/preview of a later one (user picks photo A then B in quick succession).
  const reqIdRef = useRef(0);

  const reset = useCallback(() => {
    if (previewRef.current) {
      URL.revokeObjectURL(previewRef.current);
      previewRef.current = null;
    }
    setStatus('idle');
    setResult(null);
    setPreviewUrl(null);
    setError(null);
  }, []);

  // Revoke any outstanding preview object URL when the hook unmounts (e.g.
  // the user navigates away from the analyzer) so it doesn't leak.
  useEffect(
    () => () => {
      if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    },
    [],
  );

  const analyzeFile = useCallback(async (file: File) => {
    if (!file.type.startsWith('image/')) {
      setError(translate(locale, 'analyzer.vision.error.notImage'));
      setStatus('error');
      return null;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setError(translate(locale, 'analyzer.vision.error.tooLarge'));
      setStatus('error');
      return null;
    }

    const reqId = ++reqIdRef.current;
    const isCurrent = () => reqId === reqIdRef.current;

    setError(null);
    setStatus('analyzing');
    setResult(null);

    let parts: FileParts;
    try {
      // Shrink before encoding — the function bounds the payload and a
      // multi-megabyte base64 body is slow on mobile. Falls back to the raw
      // file where the browser can't re-encode.
      const source = (await downscaleImage(file)) ?? file;
      parts = await readFileParts(source, file);
    } catch {
      if (isCurrent()) {
        setError(translate(locale, 'analyzer.vision.error.unreadable'));
        setStatus('error');
      }
      return null;
    }

    // A newer pick superseded this one while we were reading the file — drop it.
    if (!isCurrent()) {
      URL.revokeObjectURL(parts.previewUrl);
      return null;
    }

    // Even after downscaling (or when the browser couldn't), the encoded
    // payload must fit what the function accepts.
    if (parts.base64.length > AI_LIMITS.maxImageBase64Chars) {
      URL.revokeObjectURL(parts.previewUrl);
      setError(translate(locale, 'analyzer.vision.error.tooLarge'));
      setStatus('error');
      return null;
    }

    // Swap preview URL (revoke the previous one to avoid leaks).
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    previewRef.current = parts.previewUrl;
    setPreviewUrl(parts.previewUrl);

    try {
      const r = await analyzePetPhoto(parts.base64, parts.mimeType, { locale });
      if (!isCurrent()) return null; // superseded mid-analysis — ignore stale result
      setResult(r);
      setStatus('done');
      logEvent({
        type: 'custom',
        screen: 'analyzer',
        target: 'vision_analyze',
        meta: {
          is_dog: r.isDog,
          breed: r.breed,
          bcs: r.bcs,
          derm: r.dermatitis.severity,
        },
      });
      return r;
    } catch (err) {
      console.error('[usePetVision] analyze failed', err);
      if (!isCurrent()) return null;
      // The function applies the same payload bound server-side; surface it
      // as the size message rather than a generic failure.
      const tooLarge = err instanceof AiApiError && err.code === 'payload_too_large';
      setError(
        translate(
          locale,
          tooLarge ? 'analyzer.vision.error.tooLarge' : 'analyzer.vision.error.failed',
        ),
      );
      setStatus('error');
      return null;
    }
  }, [locale]);

  return { status, result, previewUrl, error, analyzeFile, reset };
}
