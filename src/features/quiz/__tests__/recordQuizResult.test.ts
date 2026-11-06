import { beforeEach, describe, expect, it, vi } from 'vitest';

const { postAi } = vi.hoisted(() => ({ postAi: vi.fn() }));
vi.mock('../../../services/aiApi', () => ({ postAi }));
const gates = vi.hoisted(() => ({ terms: true, preview: false, allowed: true }));
vi.mock('../../../lib/terms', () => ({ hasAcceptedCurrentTerms: () => gates.terms }));
vi.mock('../../../lib/previewMode', () => ({ isPreviewMode: () => gates.preview }));
vi.mock('../../../lib/privacy', () => ({ isTrainingUseAllowed: () => gates.allowed }));

import { recordQuizResult } from '../recordQuizResult';
import type { QuizCapture } from '../useQuiz';

const capture: QuizCapture = {
  id: '0b1a3c9e-5d2f-4a6b-8c7d-9e0f1a2b3c4d',
  answers: [{ questionId: 1, letter: 'A', driver: 'Harmonizer', ms: 1234.6 }],
  tieBreaker: null,
  undoCount: 1,
  totalMs: 40_000.2,
};

beforeEach(() => {
  postAi.mockReset();
  postAi.mockResolvedValue({ persisted: true });
  Object.assign(gates, { terms: true, preview: false, allowed: true });
});

describe('recordQuizResult', () => {
  it('posts letters and timings only — never a tally or a driver result', () => {
    recordQuizResult(capture, { takenAt: '2026-11-06T10:00:00.000Z', locale: 'fr' });
    expect(postAi).toHaveBeenCalledTimes(1);
    const [endpoint, body] = postAi.mock.calls[0];
    expect(endpoint).toBe('/.netlify/functions/echo-quiz-save');
    expect(body).toEqual({
      quizId: capture.id,
      anonSessionId: expect.any(String),
      answers: [{ questionId: 1, letter: 'A', ms: 1235 }],
      tieBreaker: null,
      undoCount: 1,
      totalMs: 40_000,
      takenAt: '2026-11-06T10:00:00.000Z',
      locale: 'fr',
    });
  });

  it('sends nothing before the Terms, in a preview, or with the opt-out', () => {
    for (const g of [{ terms: false }, { preview: true }, { allowed: false }]) {
      Object.assign(gates, { terms: true, preview: false, allowed: true }, g);
      recordQuizResult(capture, { takenAt: 'x', locale: 'en' });
    }
    expect(postAi).not.toHaveBeenCalled();
  });

  it('never throws when the post fails', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    postAi.mockRejectedValueOnce(new Error('offline'));
    expect(() => recordQuizResult(capture, { takenAt: 'x', locale: 'en' })).not.toThrow();
    await Promise.resolve();
  });
});
