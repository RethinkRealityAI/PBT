import type { SessionSummary, TraineeDirectoryEntry } from '../../../../../src/shared/analytics/contract';

let n = 0;

/** A finished, scored text session; override anything. */
export function session(over: Partial<SessionSummary> = {}): SessionSummary {
  n++;
  return {
    id: `s${n}`,
    user_id: 'u1',
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
