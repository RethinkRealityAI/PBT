import { useCallback, useRef, useState } from 'react';
import {
  analyzePetPhoto,
  type PetVisionResult,
} from '../../services/petVisionService';
import { logEvent } from '../../lib/analytics';

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
  const [status, setStatus] = useState<VisionStatus>('idle');
  const [result, setResult] = useState<PetVisionResult | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const previewRef = useRef<string | null>(null);

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

  const analyzeFile = useCallback(async (file: File) => {
    if (!file.type.startsWith('image/')) {
      setError('Please choose an image file.');
      setStatus('error');
      return null;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setError('That image is over 5 MB — try a smaller photo.');
      setStatus('error');
      return null;
    }

    setError(null);
    setStatus('analyzing');
    setResult(null);

    let parts: FileParts;
    try {
      parts = await readFileParts(file);
    } catch {
      setError('Could not read that image. Try another photo.');
      setStatus('error');
      return null;
    }

    // Swap preview URL (revoke the previous one to avoid leaks).
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    previewRef.current = parts.previewUrl;
    setPreviewUrl(parts.previewUrl);

    try {
      const r = await analyzePetPhoto(parts.base64, parts.mimeType);
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
      const msg = err instanceof Error ? err.message : '';
      setError(
        msg.toLowerCase().includes('api key')
          ? 'Vision is not configured — the Gemini API key is missing.'
          : 'Could not analyze the photo. Check your connection and try again.',
      );
      setStatus('error');
      return null;
    }
  }, []);

  return { status, result, previewUrl, error, analyzeFile, reset };
}
