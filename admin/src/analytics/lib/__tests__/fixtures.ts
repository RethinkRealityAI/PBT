import type { SessionSummary, TraineeDirectoryEntry } from '../../../../../src/shared/analytics/contract';

let n = 0;

/** A finished, scored text session; override anything. */
export function session(over: Partial<SessionSummary> = {}): SessionSummary {
  n++;
  return {
    id: `s${n}`,
    user_id: 'u1',
    anon_session_id: null,
    locale: null,
    reconstructed: false,
    created_at: '2026-10-10T15:00:00.000Z',
    started_at: null,
    completed: true,
    ended_reason: 'completed',
    mode: 'text',
    duration_seconds: 300,
    turns: 10,
    pushback_id: 'cost',
    owner_driver: 'Analyzer',
    scenario_summary: null,
    scenario_title: null,
    objection_title: null,
    scenario_source: 'library',
    scenario_id: 'seed:0',
    difficulty: 2,
    species: 'dog',
    breed: 'Labrador',
    persona: 'Skeptical',
    score_overall: 70,
    score_unavailable: false,
    skills: { acknowledge: 70, clarify: 70, transform: 70, empathy: 70, rapport: 70 },
    band: 'ok',
    owner_sentiment_start: -0.5,
    owner_sentiment_end: 0.4,
    owner_mood_end: 'green',
    staff_messages: 5,
    staff_words_avg: 22,
    reply_seconds_median: 18,
    hints_used: 0,
    key_wins: 2,
    key_misses: 1,
    ...over,
  };
}

/** An anonymous (no account) session from one device — scored like any other. */
export function anonSession(device: string, over: Partial<SessionSummary> = {}): SessionSummary {
  return session({ user_id: null, anon_session_id: device, ...over });
}

/**
 * An anonymous session rebuilt from app activity (before 15 Oct 2026): no
 * transcript, no score, no animal or scenario details. `ending`: 'finished'
 * (reached the scorecard), 'left' (with the logged reason) or 'unknown'.
 */
export function rebuiltSession(
  device: string,
  ending: 'finished' | 'left' | 'unknown',
  over: Partial<SessionSummary> = {},
): SessionSummary {
  return session({
    user_id: null,
    anon_session_id: device,
    reconstructed: true,
    completed: ending === 'finished',
    ended_reason: ending === 'finished' ? 'completed' : ending === 'left' ? 'user_exit' : null,
    duration_seconds: ending === 'unknown' ? null : 240,
    turns: null,
    owner_driver: null,
    scenario_source: 'unknown',
    scenario_id: null,
    difficulty: null,
    breed: null,
    persona: null,
    score_overall: null,
    skills: null,
    band: null,
    owner_sentiment_start: null,
    owner_sentiment_end: null,
    owner_mood_end: null,
    staff_messages: 0,
    staff_words_avg: null,
    reply_seconds_median: null,
    key_wins: 0,
    key_misses: 0,
    ...over,
  });
}

export function person(over: Partial<TraineeDirectoryEntry> = {}): TraineeDirectoryEntry {
  return {
    user_id: 'u1',
    display_name: 'Marie Tremblay',
    echo_primary: 'Harmonizer',
    echo_secondary: null,
    created_at: '2026-08-01T00:00:00.000Z',
    locale: 'en',
    disabled: false,
    admin_role: null,
    email: null,
    last_sign_in_at: null,
    ...over,
  };
}
