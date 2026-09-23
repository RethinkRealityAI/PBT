import { useCallback, useEffect, useRef, useState } from 'react';
import { analyzeStoolPhoto } from '../../services/fecalScanService';
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
import type {
  FecalBreedSize,
  FecalScanResult,
  FecalScanRetrieval,
  FecalSpecies,
} from '../../shared/ai/fecalScan';

export type FecalScanStatus = 'idle' | 'analyzing' | 'done' | 'error';

export interface UseFecalScan {
  status: FecalScanStatus;
  result: FecalScanResult | null;
  /** What the scorer was grounded in — the RAG trail shown in the UI. */
  retrieval: FecalScanRetrieval | null;
  previewUrl: string | null;
  error: string | null;
  /** Which Royal Canin chart the photo is scored against. */
  species: FecalSpecies;
  setSpecies: (species: FecalSpecies) => void;
  /** Puppies only — chart score 3 is banded by breed size. */
  breedSize: FecalBreedSize;
  setBreedSize: (size: FecalBreedSize) => void;
  analyzeFile: (file: File) => Promise<FecalScanResult | null>;
  reset: () => void;
}

/**
 * Fecal Scan capture + scoring state machine.
 *
 * Mirrors `usePetVision` (same validation, same downscale pipeline, same
 * stale-request guard, same object-URL hygiene) and adds the two chart
 * selectors. Changing a selector clears any previous result: a score on
 * screen must never belong to a different chart than the one selected.
 */
export function useFecalScan(): UseFecalScan {
  const { locale } = useLanguage();
  const [status, setStatus] = useState<FecalScanStatus>('idle');
  const [result, setResult] = useState<FecalScanResult | null>(null);
  const [retrieval, setRetrieval] = useState<FecalScanRetrieval | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [species, setSpeciesState] = useState<FecalSpecies>('dog');
  const [breedSize, setBreedSizeState] = useState<FecalBreedSize>('small-medium');

  const previewRef = useRef<string | null>(null);
  // Monotonic id so a slow scan from an earlier pick can't overwrite the
  // result/preview of a later one (user picks photo A then B in quick succession).
  const reqIdRef = useRef(0);
  // Read inside the async body so a chart change mid-flight can't be applied
  // to a request that was already sent with the old chart.
  const speciesRef = useRef(species);
  const breedSizeRef = useRef(breedSize);
  speciesRef.current = species;
  breedSizeRef.current = breedSize;

  const clearPreview = useCallback(() => {
    if (previewRef.current) {
      URL.revokeObjectURL(previewRef.current);
      previewRef.current = null;
    }
  }, []);

  const reset = useCallback(() => {
    // Invalidate any in-flight scan so its result can't land after the reset.
    reqIdRef.current += 1;
    clearPreview();
    setStatus('idle');
    setResult(null);
    setRetrieval(null);
    setPreviewUrl(null);
    setError(null);
  }, [clearPreview]);

  const setSpecies = useCallback(
    (next: FecalSpecies) => {
      if (next === speciesRef.current) return;
      speciesRef.current = next;
      setSpeciesState(next);
      reset();
    },
    [reset],
  );

  const setBreedSize = useCallback(
    (next: FecalBreedSize) => {
      if (next === breedSizeRef.current) return;
      breedSizeRef.current = next;
      setBreedSizeState(next);
      reset();
    },
    [reset],
  );

  // Revoke any outstanding preview object URL when the hook unmounts (e.g.
  // the user navigates away from the screen) so it doesn't leak.
  useEffect(
    () => () => {
      if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    },
    [],
  );

  const analyzeFile = useCallback(
    async (file: File) => {
      // Claim a request id BEFORE validating: a rejected pick is still the
      // user's latest intent, so an earlier scan that is still in flight must
      // not land afterwards and replace this error with a stale result.
      const reqId = ++reqIdRef.current;
      const isCurrent = () => reqId === reqIdRef.current;

      if (!file.type.startsWith('image/')) {
        setError(translate(locale, 'fecalScan.error.notImage'));
        setResult(null);
        setRetrieval(null);
        setStatus('error');
        return null;
      }
      if (file.size > MAX_IMAGE_BYTES) {
        setError(translate(locale, 'fecalScan.error.tooLarge'));
        setResult(null);
        setRetrieval(null);
        setStatus('error');
        return null;
      }

      const scanSpecies = speciesRef.current;
      const scanBreedSize = breedSizeRef.current;

      setError(null);
      setStatus('analyzing');
      setResult(null);
      setRetrieval(null);

      let parts: FileParts;
      try {
        // Shrink before encoding — the function bounds the payload and a
        // multi-megabyte base64 body is slow on mobile. Falls back to the raw
        // file where the browser can't re-encode.
        const source = (await downscaleImage(file)) ?? file;
        parts = await readFileParts(source, file);
      } catch {
        if (isCurrent()) {
          setError(translate(locale, 'fecalScan.error.unreadable'));
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
        setError(translate(locale, 'fecalScan.error.tooLarge'));
        setStatus('error');
        return null;
      }

      // Swap preview URL (revoke the previous one to avoid leaks).
      clearPreview();
      previewRef.current = parts.previewUrl;
      setPreviewUrl(parts.previewUrl);

      try {
        const res = await analyzeStoolPhoto(parts.base64, parts.mimeType, {
          species: scanSpecies,
          // The chart only bands by breed size for puppies; sending it for a
          // dog or cat would be meaningless noise on the wire.
          breedSize: scanSpecies === 'puppy' ? scanBreedSize : undefined,
          locale,
        });
        if (!isCurrent()) return null; // superseded mid-scan — ignore stale result
        setResult(res.result);
        setRetrieval(res.retrieval);
        setStatus('done');
        logEvent({
          type: 'custom',
          screen: 'fecalScan',
          target: 'fecal_scan',
          // A rejected (non-stool) photo has no score — logging the
          // placeholder score/band would count it as a real reading.
          meta: res.result.isStool
            ? {
                species: scanSpecies,
                isStool: true,
                score: res.result.score,
                band: res.result.band,
                source: res.retrieval?.source ?? null,
              }
            : {
                species: scanSpecies,
                isStool: false,
                source: res.retrieval?.source ?? null,
              },
        });
        return res.result;
      } catch (err) {
        console.error('[useFecalScan] scan failed', err);
        if (!isCurrent()) return null;
        // The function applies the same payload bound server-side; surface it
        // as the size message rather than a generic failure.
        const tooLarge = err instanceof AiApiError && err.code === 'payload_too_large';
        setError(
          translate(
            locale,
            tooLarge ? 'fecalScan.error.tooLarge' : 'fecalScan.error.failed',
          ),
        );
        setStatus('error');
        return null;
      }
    },
    [clearPreview, locale],
  );

  return {
    status,
    result,
    retrieval,
    previewUrl,
    error,
    species,
    setSpecies,
    breedSize,
    setBreedSize,
    analyzeFile,
    reset,
  };
}
