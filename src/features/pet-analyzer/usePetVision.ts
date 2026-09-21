import { useCallback, useEffect, useRef, useState } from 'react';
import {
  analyzePetPhoto,
  type PetVisionResult,
} from '../../services/petVisionService';
import { AiApiError } from '../../services/aiApi';
import { AI_LIMITS } from '../../shared/ai/contract';
import { logEvent } from '../../lib/analytics';
import {
  downscaleImage,
  readFileParts,
  MAX_IMAGE_BYTES,
  type FileParts,
} from '../../lib/imagePrep';
import { useLanguage } from '../../app/providers/LanguageProvider';
import { translate } from '../../i18n/translate';

export type VisionStatus = 'idle' | 'analyzing' | 'done' | 'error';

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
