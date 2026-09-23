import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { useFecalScan } from '../useFecalScan';
import type {
  FecalScanResult,
  FecalScanRetrieval,
} from '../../../shared/ai/fecalScan';

const analyzeStoolPhoto = vi.fn();
const logEvent = vi.fn();

vi.mock('../../../services/fecalScanService', () => ({
  analyzeStoolPhoto: (...args: unknown[]) => analyzeStoolPhoto(...args),
}));

vi.mock('../../../lib/analytics', () => ({
  logEvent: (...args: unknown[]) => logEvent(...args),
}));

vi.mock('../../../app/providers/LanguageProvider', () => ({
  useLanguage: () => ({ locale: 'en' }),
}));

function result(over: Partial<FecalScanResult> = {}): FecalScanResult {
  return {
    isStool: true,
    species: 'dog',
    score: 3.5,
    band: 'tooSoft',
    confidence: 0.82,
    rationale: 'Moist stool with no cracks.',
    observations: {
      form: 'distinct shape',
      moisture: 'moist',
      surface: 'smooth, no cracks',
      residue: 'would leave residue',
      homogeneity: 'homogeneous',
    },
    alternates: [{ score: 3, confidence: 0.3 }],
    notVisible: ['odour'],
    caution: 'Involve the veterinarian if this persists beyond 48 hours.',
    ...over,
  };
}

const retrieval: FecalScanRetrieval = {
  source: 'rag',
  query: 'moist stool no cracks distinct shape',
  docSlugs: ['fecal:dog'],
  scope: { tool: 'fecal-scan', species: 'dog' },
  referenceScores: [1, 2, 2.5, 3, 3.5, 4, 4.5, 5],
    exactReference: null,
    mostSimilarReference: null,
  chunks: [
    {
      citation: 'Royal Canin — Fecal Scoring System for Dogs, VGI/064/0324',
      similarity: 0.84,
      excerpt: 'Score 3.5 (Fecal Scoring System for Dogs): MOIST STOOL WITH NO CRACKS.',
      scores: [3.5],
      kind: 'chart',
    },
    {
      citation: 'Royal Canin — Fecal Scoring System for Dogs, VGI/064/0324',
      similarity: null,
      excerpt: 'Score 1 (Fecal Scoring System for Dogs): VERY HARD AND DRY.',
      scores: [1],
      kind: 'chart',
    },
  ],
};

/** A File whose `type` / `size` we control, without allocating real bytes. */
function fakeFile(type: string, size: number, name = 'stool.jpg'): File {
  const file = new File(['x'], name, { type });
  Object.defineProperty(file, 'size', { value: size });
  return file;
}

beforeEach(() => {
  analyzeStoolPhoto.mockReset();
  logEvent.mockReset();
  // jsdom has no object-URL implementation.
  URL.createObjectURL = vi.fn(() => 'blob:preview');
  URL.revokeObjectURL = vi.fn();
});

describe('useFecalScan', () => {
  it('starts idle with the dog chart selected', () => {
    const { result: hook } = renderHook(() => useFecalScan());
    expect(hook.current.status).toBe('idle');
    expect(hook.current.species).toBe('dog');
    expect(hook.current.result).toBeNull();
    expect(hook.current.retrieval).toBeNull();
  });

  it('runs a scan and exposes result + retrieval', async () => {
    analyzeStoolPhoto.mockResolvedValue({ result: result(), retrieval });
    const { result: hook } = renderHook(() => useFecalScan());

    await act(async () => {
      await hook.current.analyzeFile(fakeFile('image/jpeg', 1024));
    });

    await waitFor(() => expect(hook.current.status).toBe('done'));
    expect(hook.current.result?.score).toBe(3.5);
    expect(hook.current.retrieval?.source).toBe('rag');
    expect(hook.current.previewUrl).toBe('blob:preview');
    expect(logEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'custom',
        screen: 'fecalScan',
        target: 'fecal_scan',
        meta: expect.objectContaining({ species: 'dog', score: 3.5, band: 'tooSoft', source: 'rag' }),
      }),
    );
  });

  it('passes the selected species and breed size to the service', async () => {
    analyzeStoolPhoto.mockResolvedValue({
      result: result({ species: 'puppy', score: 3, band: 'normal' }),
      retrieval,
    });
    const { result: hook } = renderHook(() => useFecalScan());

    act(() => {
      hook.current.setSpecies('puppy');
    });
    act(() => {
      hook.current.setBreedSize('large-giant');
    });
    await act(async () => {
      await hook.current.analyzeFile(fakeFile('image/jpeg', 1024));
    });

    expect(analyzeStoolPhoto).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      expect.objectContaining({ species: 'puppy', breedSize: 'large-giant', locale: 'en' }),
    );
  });

  it('sends no breedSize for non-puppy charts', async () => {
    analyzeStoolPhoto.mockResolvedValue({ result: result({ species: 'cat' }), retrieval });
    const { result: hook } = renderHook(() => useFecalScan());

    act(() => {
      hook.current.setSpecies('cat');
    });
    await act(async () => {
      await hook.current.analyzeFile(fakeFile('image/jpeg', 1024));
    });

    expect(analyzeStoolPhoto.mock.calls[0][2]).toMatchObject({ species: 'cat' });
    expect(analyzeStoolPhoto.mock.calls[0][2].breedSize).toBeUndefined();
  });

  it('rejects a non-image file without calling the service', async () => {
    const { result: hook } = renderHook(() => useFecalScan());
    await act(async () => {
      await hook.current.analyzeFile(fakeFile('application/pdf', 1024, 'chart.pdf'));
    });
    expect(hook.current.status).toBe('error');
    expect(hook.current.error).toBeTruthy();
    expect(analyzeStoolPhoto).not.toHaveBeenCalled();
  });

  it('rejects a file over 5 MB', async () => {
    const { result: hook } = renderHook(() => useFecalScan());
    await act(async () => {
      await hook.current.analyzeFile(fakeFile('image/jpeg', 6 * 1024 * 1024));
    });
    expect(hook.current.status).toBe('error');
    expect(analyzeStoolPhoto).not.toHaveBeenCalled();
  });

  it('surfaces a failure as an error status', async () => {
    analyzeStoolPhoto.mockRejectedValue(new Error('boom'));
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { result: hook } = renderHook(() => useFecalScan());
    await act(async () => {
      await hook.current.analyzeFile(fakeFile('image/jpeg', 1024));
    });
    expect(hook.current.status).toBe('error');
    expect(hook.current.error).toBeTruthy();
    spy.mockRestore();
  });

  it('ignores a stale result when a newer pick supersedes it', async () => {
    let resolveFirst: (v: unknown) => void = () => {};
    analyzeStoolPhoto
      .mockImplementationOnce(
        () =>
          new Promise((res) => {
            resolveFirst = res;
          }),
      )
      .mockResolvedValueOnce({ result: result({ score: 2.5 }), retrieval });

    const { result: hook } = renderHook(() => useFecalScan());

    let firstCall: Promise<unknown> = Promise.resolve(null);
    act(() => {
      firstCall = hook.current.analyzeFile(fakeFile('image/jpeg', 1024, 'a.jpg'));
    });
    // Let the first pick reach the service before superseding it, otherwise
    // the stale guard trips at the file-read stage and proves nothing.
    await waitFor(() => expect(analyzeStoolPhoto).toHaveBeenCalledTimes(1));
    await act(async () => {
      await hook.current.analyzeFile(fakeFile('image/jpeg', 1024, 'b.jpg'));
    });
    await act(async () => {
      resolveFirst({ result: result({ score: 5 }), retrieval });
      await firstCall;
    });

    expect(hook.current.result?.score).toBe(2.5);
  });

  it('a rejected pick supersedes an earlier scan still in flight', async () => {
    let resolveFirst: (v: unknown) => void = () => {};
    analyzeStoolPhoto.mockImplementationOnce(
      () =>
        new Promise((res) => {
          resolveFirst = res;
        }),
    );
    const { result: hook } = renderHook(() => useFecalScan());

    let firstCall: Promise<unknown> = Promise.resolve(null);
    act(() => {
      firstCall = hook.current.analyzeFile(fakeFile('image/jpeg', 1024, 'a.jpg'));
    });
    await waitFor(() => expect(analyzeStoolPhoto).toHaveBeenCalledTimes(1));

    // The user then picks a PDF: its validation error is the latest intent.
    await act(async () => {
      await hook.current.analyzeFile(fakeFile('application/pdf', 1024, 'b.pdf'));
    });
    expect(hook.current.status).toBe('error');

    await act(async () => {
      resolveFirst({ result: result({ score: 5 }), retrieval });
      await firstCall;
    });

    // The stale scan must not overwrite the error with its result.
    expect(hook.current.status).toBe('error');
    expect(hook.current.error).toBe('Please choose an image file.');
    expect(hook.current.result).toBeNull();
  });

  it('logs the band and score only for a real stool reading', async () => {
    analyzeStoolPhoto.mockResolvedValueOnce({ result: result(), retrieval });
    const { result: hook } = renderHook(() => useFecalScan());
    await act(async () => {
      await hook.current.analyzeFile(fakeFile('image/jpeg', 1024));
    });
    expect(logEvent).toHaveBeenLastCalledWith(
      expect.objectContaining({
        meta: expect.objectContaining({ isStool: true, score: 3.5, band: 'tooSoft' }),
      }),
    );

    analyzeStoolPhoto.mockResolvedValueOnce({
      result: result({ isStool: false }),
      retrieval,
    });
    await act(async () => {
      await hook.current.analyzeFile(fakeFile('image/jpeg', 1024));
    });
    const meta = logEvent.mock.calls.at(-1)?.[0].meta as Record<string, unknown>;
    expect(meta.isStool).toBe(false);
    expect(meta).not.toHaveProperty('score');
    expect(meta).not.toHaveProperty('band');
  });

  it('reset() clears everything and revokes the preview URL', async () => {
    analyzeStoolPhoto.mockResolvedValue({ result: result(), retrieval });
    const { result: hook } = renderHook(() => useFecalScan());
    await act(async () => {
      await hook.current.analyzeFile(fakeFile('image/jpeg', 1024));
    });
    act(() => hook.current.reset());

    expect(hook.current.status).toBe('idle');
    expect(hook.current.result).toBeNull();
    expect(hook.current.retrieval).toBeNull();
    expect(hook.current.previewUrl).toBeNull();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:preview');
  });

  it('switching chart clears a previous result so the two never disagree', async () => {
    analyzeStoolPhoto.mockResolvedValue({ result: result(), retrieval });
    const { result: hook } = renderHook(() => useFecalScan());
    await act(async () => {
      await hook.current.analyzeFile(fakeFile('image/jpeg', 1024));
    });
    act(() => hook.current.setSpecies('cat'));

    expect(hook.current.status).toBe('idle');
    expect(hook.current.result).toBeNull();
    expect(hook.current.species).toBe('cat');
  });
});
