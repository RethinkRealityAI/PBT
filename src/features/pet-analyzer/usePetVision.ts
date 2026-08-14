import { useCallback, useEffect, useRef, useState } from 'react';
import {
  analyzePetPhoto,
  type PetVisionResult,
} from '../../services/petVisionService';
import { logEvent } from '../../lib/analytics';
import { useLanguage } from '../../app/providers/LanguageProvider';
import { translate } from '../../i18n/translate';

export type VisionStatus = 'idle' | 'analyzing' | 'done' | 'error';

/** Max accepted image bytes before analysis (5 MB) — keeps payloads sane. */
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

interface FileParts {
  base64: string;
  mimeType: string;
  /** object URL for preview; caller revokes on reset. */
  previewUrl: string;
}

function readFileParts(file: File): Promise<FileParts> {
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
        mimeType: file.type || 'image/jpeg',
        previewUrl: URL.createObjectURL(file),
      });
    };
    reader.readAsDataURL(file);
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
      parts = await readFileParts(file);
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
      const msg = err instanceof Error ? err.message : '';
      setError(
        translate(
          locale,
          msg.toLowerCase().includes('api key')
            ? 'analyzer.vision.error.notConfigured'
            : 'analyzer.vision.error.failed',
        ),
      );
      setStatus('error');
      return null;
    }
  }, [locale]);

  return { status, result, previewUrl, error, analyzeFile, reset };
}
