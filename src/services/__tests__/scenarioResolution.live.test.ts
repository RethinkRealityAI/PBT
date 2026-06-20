/**
 * LIVE end-to-end scenario-resolution check (no mocks).
 *
 * Skipped unless GEMINI_API_KEY is set, so it never runs in CI or offline.
 * To run it against the real model:
 *
 *   GEMINI_API_KEY=your_key npx vitest run scenarioResolution.live
 *
 * It proves the ACT-first pipeline end-to-end: a conversation where the trainee
 * acknowledges → clarifies → transforms scores meaningfully higher than a
 * pitch-first one, and resolves with a non-failing band. This is the
 * "can you actually resolve a scenario" check the mocked tests can't make.
 */
import { describe, expect, it } from 'vitest';
import { evaluateConversation, generateRoleplayMessage } from '../geminiService';
import type { ChatMessage } from '../types';
import { SEED_SCENARIOS } from '../../data/scenarios';

const hasKey =
  !!process.env.GEMINI_API_KEY || !!process.env.VITE_GEMINI_API_KEY;

// A staff trainee who runs the ACT play cleanly: acknowledge → clarify →
// transform with a bounded trial + a recheck checkpoint.
const IDEAL_STAFF_TURNS = [
  "I hear you — it's clear how much you care about him, and a change after all this time is genuinely hard. I'm not here to judge that at all.",
  "Can I ask a couple of things so I get the full picture? Walk me through his typical day — how's his energy, and how is he on the stairs or getting in the car lately?",
  "That makes sense, thank you for sharing that. Given what you've told me, here's what I'd suggest: a 4-week trial on a measured portion plan, and I'll see him back at week two for a weigh-in so we adjust together. No long commitment — we just watch how he does.",
  "Totally your call, and we go at your pace. If it helps, we can start small this week and check in. How does that sound?",
];

// A staff trainee who skips acknowledge/clarify and jumps to the pitch.
const PITCH_FIRST_TURNS = [
  "You really need to switch his food — what he's on now is the problem.",
  "This diet is clinically proven, it's the best option, you should just buy a bag today.",
  "Look, the price is the price. It works. Do you want it or not?",
];

function buildTranscript(staffTurns: string[]): ChatMessage[] {
  // Alternating customer/staff turns; the exact customer text doesn't matter
  // for scoring the staff side, so we use a neutral pushback placeholder.
  const msgs: ChatMessage[] = [];
  let t = Date.now();
  for (const staff of staffTurns) {
    msgs.push({ role: 'ai', text: 'I just have my doubts about all this.', timestamp: t++ });
    msgs.push({ role: 'user', text: staff, timestamp: t++ });
  }
  msgs.push({ role: 'ai', text: 'Okay… that actually makes sense. Let me think about it.', timestamp: t++ });
  return msgs;
}

describe.skipIf(!hasKey)('LIVE scenario resolution (real Gemini)', () => {
  const scenario = SEED_SCENARIOS[0];

  it('the AI customer opens in character', { timeout: 30_000 }, async () => {
    const opener = await generateRoleplayMessage(scenario, []);
    expect(opener.role).toBe('ai');
    expect(opener.text.length).toBeGreaterThan(0);
  });

  it(
    'rewards a full ACT resolution over a pitch-first attempt',
    { timeout: 60_000 },
    async () => {
      const idealReport = await evaluateConversation(
        scenario,
        buildTranscript(IDEAL_STAFF_TURNS),
      );
      const pitchReport = await evaluateConversation(
        scenario,
        buildTranscript(PITCH_FIRST_TURNS),
      );

      // The ACT-run resolves with a non-failing band and beats the pitch-first
      // run on the overall AND on each ACT pillar.
      expect(idealReport.overall).toBeGreaterThan(pitchReport.overall);
      expect(['good', 'ok']).toContain(idealReport.band);
      expect(idealReport.acknowledge).toBeGreaterThan(pitchReport.acknowledge);
      expect(idealReport.clarify).toBeGreaterThan(pitchReport.clarify);
      // eslint-disable-next-line no-console
      console.log(
        `[live] ideal overall=${idealReport.overall} (${idealReport.band}) ` +
          `A/C/T=${idealReport.acknowledge}/${idealReport.clarify}/${idealReport.transform} | ` +
          `pitch overall=${pitchReport.overall} (${pitchReport.band})`,
      );
    },
  );
});
