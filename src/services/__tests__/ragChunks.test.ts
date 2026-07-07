import { describe, expect, it } from 'vitest';
import { buildSessionChunks } from '../ragDocument';
import { SEED_SCENARIOS } from '../../data/scenarios';
import type { ChatMessage, ScoreReport } from '../types';

const scenario = SEED_SCENARIOS[0];

function msg(role: 'ai' | 'user', text: string, t: number): ChatMessage {
  return { role, text, timestamp: t };
}

const REPORT = {
  acknowledge: 80,
  clarify: 75,
  transform: 70,
  empathy: 85,
  rapport: 78,
  overall: 77,
  band: 'ok',
  critique: 'Good acknowledgement, clarify earlier.',
  betterAlternative: 'Walk me through her day first.',
  perDimensionNotes: {
    acknowledge: '',
    clarify: '',
    transform: '',
    empathy: '',
    rapport: '',
  },
  keyMoments: [],
} as ScoreReport;

describe('buildSessionChunks', () => {
  it('pairs each customer turn with its staff reply and appends a coaching chunk', () => {
    const transcript = [
      msg('ai', 'This food is too expensive.', 1),
      msg('user', 'I hear you — it is a real expense.', 2),
      msg('ai', 'So why should I pay it?', 3),
      msg('user', 'Per day it costs less than a coffee.', 4),
    ];
    const chunks = buildSessionChunks(scenario, transcript, REPORT);

    expect(chunks).toHaveLength(3); // 2 exchanges + 1 coaching
    expect(chunks[0].chunkType).toBe('exchange');
    expect(chunks[0].content).toBe(
      'CUSTOMER: This food is too expensive.\nSTAFF: I hear you — it is a real expense.',
    );
    expect(chunks[0].tags).toMatchObject({
      pushback_id: scenario.pushback.id,
      driver: scenario.suggestedDriver,
      score_band: 'ok',
      has_staff_reply: true,
      turn_range: [0, 1],
    });
    // Sequential indices, positive token estimates.
    expect(chunks.map((c) => c.chunkIdx)).toEqual([0, 1, 2]);
    expect(chunks.every((c) => c.tokenEstimate > 0)).toBe(true);

    const coaching = chunks[2];
    expect(coaching.chunkType).toBe('coaching');
    expect(coaching.content).toContain('COACH CRITIQUE: Good acknowledgement');
    expect(coaching.content).toContain('BETTER ALTERNATIVE: Walk me through');
  });

  it('handles a trailing unanswered customer turn and a missing report', () => {
    const transcript = [
      msg('ai', 'Too expensive.', 1),
      msg('user', 'Let me explain.', 2),
      msg('ai', 'Hmm, still not convinced.', 3), // no staff reply
    ];
    const chunks = buildSessionChunks(scenario, transcript, null);

    expect(chunks).toHaveLength(2); // no coaching chunk without a report
    expect(chunks[1].content).toBe('CUSTOMER: Hmm, still not convinced.');
    expect(chunks[1].tags.has_staff_reply).toBe(false);
    expect(chunks[1].tags.score_band).toBeNull();
  });

  it('returns empty for an empty transcript with no critique', () => {
    expect(buildSessionChunks(scenario, [], null)).toEqual([]);
  });
});
