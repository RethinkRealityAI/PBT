/**
 * Admin analytics — the wire contract between `netlify/functions/admin-sessions`
 * / `admin-analytics` and the admin portal's Analytics destination.
 *
 * Dependency-free (types only) so both sides import it. The server derives
 * everything below from rows the trainee app ALREADY writes — the full
 * `scenario` jsonb, the `transcript` (with per-message timestamps and the AI
 * owner's `emotion`), the `score_report`, and `nav_events` — so no column or
 * migration is needed. What the server never sends: transcripts in list
 * views (a session's transcript is fetched on its own, when opened), and a
 * trainee's email to a caller without `team.read`.
 *
 * Supabase answers at most 1,000 rows per request whatever `limit` says; every
 * read behind this contract pages (`.range()`) so a busy window is counted in
 * full, and says so (`truncated`) when it hits the hard cap instead.
 */

export type SkillKey = 'acknowledge' | 'clarify' | 'transform' | 'empathy' | 'rapport';

export const SKILL_KEYS: readonly SkillKey[] = ['acknowledge', 'clarify', 'transform', 'empathy', 'rapport'];

export type SkillScores = Record<SkillKey, number>;

/** Where the scenario a session played came from (`scenario._overrideId`). */
export type ScenarioSource =
  /** One of the built-in library scenarios (`seed:<n>`). */
  | 'library'
  /** Authored by the team in the Scenario Studio (`admin:<uuid>`). */
  | 'studio'
  /** Built by the trainee themselves on the Create screen (no override id). */
  | 'self-built'
  /** Backfilled / older rows that didn't store it. */
  | 'unknown';

export type OwnerMood = 'red' | 'yellow' | 'green';

/**
 * One training session, as the Analytics tabs need it — no transcript.
 * `GET admin-sessions?view=summary` (and the trainee profile) return these.
 */
export interface SessionSummary {
  id: string;
  /** The trainee's account — null for an ANONYMOUS session (no account). */
  user_id: string | null;
  /**
   * An anonymous session's random per-device id (`pbt:session_id`) — groups
   * one device's sessions; never a name or an email. Null when signed in.
   */
  anon_session_id: string | null;
  /** App language the session was played in ('en', 'fr'); null before 2026-10-15. */
  locale: string | null;
  /**
   * Rebuilt from app-usage events for an anonymous session played before
   * anonymous sessions were recorded (2026-10-15): when, which objection, the
   * mode and whether it reached the scorecard are known; the transcript and
   * the score were never stored.
   */
  reconstructed: boolean;
  /** Row creation — in practice the END of the session (the scorer writes the row). */
  created_at: string;
  /** created_at − duration, when a duration was stored. */
  started_at: string | null;
  completed: boolean;
  ended_reason: string | null;
  mode: 'text' | 'voice' | null;
  duration_seconds: number | null;
  /** Messages in the transcript (both sides). */
  turns: number | null;
  pushback_id: string | null;
  /** The AI owner's ECHO driver for this session (`training_sessions.driver`). */
  owner_driver: string | null;
  scenario_summary: string | null;
  /**
   * What to call the scenario: the team's Studio card / scenario title when it
   * has one (looked up server-side), else the objection's title.
   */
  scenario_title: string | null;
  /**
   * The objection's OWN title as the session stored it (`scenario.pushback
   * .title`) — never a scenario title. How a team objection is named for a
   * role that can't read the Studio's objections.
   */
  objection_title: string | null;
  scenario_source: ScenarioSource;
  /** `scenario._overrideId` when present (`seed:0`, `admin:<uuid>`). */
  scenario_id: string | null;
  /** 1 Coachable … 4 Combative; null when the row never stored one. */
  difficulty: 1 | 2 | 3 | 4 | null;
  species: 'dog' | 'cat';
  breed: string | null;
  persona: string | null;
  /** Score — null when never scored (left early) or scoring failed. */
  score_overall: number | null;
  /** True when a scoring attempt FAILED (placeholder report). Never average it. */
  score_unavailable: boolean;
  /** The five ACT-first skill scores (0–100); null on unscored / pre-Phase-2 rows. */
  skills: SkillScores | null;
  /** The scorer's band, when it gave one. */
  band: string | null;
  /** AI owner's sentiment (−1…1) on its first and last scored turn. */
  owner_sentiment_start: number | null;
  owner_sentiment_end: number | null;
  /** The AI owner's mood on its LAST message (the resolution arc's end). */
  owner_mood_end: OwnerMood | null;
  /** Trainee messages in the transcript. */
  staff_messages: number;
  /** Mean words per trainee message (null with none). */
  staff_words_avg: number | null;
  /** Median seconds between an owner message and the trainee's reply (text mode). */
  reply_seconds_median: number | null;
  /**
   * Coach hints requested in this session (from `coach_hint_request` events).
   * Null when the caller's view can't see them; 0 is a real zero.
   */
  hints_used: number | null;
  /** Scorer's key moments: how many wins / misses it called out. */
  key_wins: number;
  key_misses: number;
}

/** `GET admin-sessions?view=summary` */
export interface SessionSummaryResponse {
  rows: SessionSummary[];
  /** True when the window held more rows than the hard cap returned. */
  truncated: boolean;
  /**
   * `?lite=1`: read without transcripts or full score reports (the all-time
   * lifetime figures). Transcript-derived fields (owner mood, staff words,
   * reply time), owner sentiment and key moments are empty in this mode.
   */
  lite?: boolean;
}

// ─── Trainee directory ─────────────────────────────────────────────────

/**
 * Everyone with a profile, as the analytics screens name them.
 * `GET admin-analytics?op=directory` — needs `sessions.read` (NOT `team.read`:
 * an Analyst can read sessions but not manage people, and used to see every
 * trainee as "Anonymous" — or no sessions at all). Email is included only for
 * a caller who also holds `team.read`.
 */
export interface TraineeDirectoryEntry {
  user_id: string;
  display_name: string | null;
  echo_primary: string | null;
  echo_secondary: string | null;
  created_at: string;
  locale: string | null;
  /**
   * `disabled` and `admin_role` reach every caller with `sessions.read` on
   * purpose: the analytics screens keep disabled accounts and portal staff out
   * of "hasn't started" nudges and label staff in the roster. They grant no
   * people-management rights (those stay behind `team.read` / `team.manage`).
   */
  disabled: boolean;
  /** Admin role key, or null for a trainee-only account. */
  admin_role: string | null;
  /** Only for a caller with `team.read`; otherwise always null. */
  email: string | null;
  /** From Supabase Auth; null when unknown or never signed in. */
  last_sign_in_at: string | null;
}

export interface TraineeDirectoryResponse {
  rows: TraineeDirectoryEntry[];
  /** False when emails were withheld (caller lacks `team.read`). */
  emails: boolean;
}

// ─── Engagement (nav_events, aggregated server-side) ───────────────────

export interface EngagementTotals {
  /** Distinct people/devices (signed-in user id, else the device id). */
  visitors: number;
  /** Distinct signed-in accounts. */
  signed_in: number;
  screen_views: number;
  dwell_ms: number;
  /**
   * `session_open` events — sessions started (text always; voice from the
   * release that added it — `meta.mode` tells them apart).
   */
  sessions_started: number;
  hint_requests: number;
  /** Visitors active on 2+ different days in the window. */
  returning_visitors: number;
}

export interface EngagementScreenRow {
  screen: string;
  views: number;
  dwell_ms: number;
  /** Distinct visitors who opened it. */
  visitors: number;
}

export interface EngagementActionRow {
  /** `target` of a card_click / custom event (`session_open`, `fecal_scan`, …). */
  action: string;
  count: number;
  visitors: number;
}

export interface EngagementBucket {
  /** Bucket start, ms epoch. Hourly (24h), daily (≤ 35 days) or weekly. */
  start: number;
  visitors: number;
  screen_views: number;
}

/** Distinct visitors per value of one device/context dimension (from `app_open`). */
export type ContextBreakdown = Array<{ value: string; visitors: number }>;

export interface EngagementPerUser {
  user_id: string;
  last_seen: string;
  active_days: number;
  screen_views: number;
  dwell_ms: number;
  hint_requests: number;
}

/** `GET admin-analytics?op=engagement&range=28d&tz=-240` — needs `analytics.read`. */
export interface EngagementReport {
  range: string;
  generated_at: string;
  granularity: 'hour' | 'day' | 'week';
  current: EngagementTotals;
  /** Same-length window before; null for `all`. */
  previous: EngagementTotals | null;
  trend: EngagementBucket[];
  screens: EngagementScreenRow[];
  actions: EngagementActionRow[];
  /** [weekday 0=Sun..6][hour 0..23] screen views, in the caller's timezone. */
  heatmap: number[][];
  /** Visitors by number of distinct active days: "1", "2", "3-5", "6-10", "11+". */
  active_days_histogram: Array<{ bucket: string; visitors: number }>;
  /** Context the trainee app reports on `app_open` (empty until that ships widely). */
  context: {
    device: ContextBreakdown;
    os: ContextBreakdown;
    installed: ContextBreakdown;
    locale: ContextBreakdown;
    theme: ContextBreakdown;
  };
  /** Signed-in accounts seen in the current window. */
  per_user: EngagementPerUser[];
  /** Rows read; `truncated` when the hard cap stopped the scan early. */
  scanned: number;
  truncated: boolean;
}

// ─── One trainee ───────────────────────────────────────────────────────

export interface TraineeActivity {
  first_seen: string | null;
  last_seen: string | null;
  /** Local-calendar days (YYYY-MM-DD, caller's tz) with any app activity, last 365 days. */
  active_days: string[];
  screen_views: number;
  dwell_ms: number;
  screens: EngagementScreenRow[];
  actions: EngagementActionRow[];
  /** Latest `app_open` context, when the app reported one. */
  last_context: { device?: string; os?: string; installed?: boolean; locale?: string; theme?: string } | null;
  /** Most recent events, newest first (≤ 60). */
  recent: Array<{ at: string; type: string; screen: string | null; action: string | null }>;
}

export interface TraineeFeedbackRow {
  id: string;
  session_id: string | null;
  realism: number | null;
  ai_quality: number | null;
  comfort: number | null;
  comment: string | null;
  created_at: string;
}

export interface TraineeScenarioRow {
  id: string;
  title: string;
  pushback_id: string | null;
  difficulty: number | null;
  species: string | null;
  created_at: string;
}

export interface TraineeAnalyzerRow {
  id: string;
  breed: string | null;
  bcs: number | null;
  verdict: string | null;
  source: string | null;
  created_at: string;
}

export interface TraineeReportRow {
  id: string;
  kind: string;
  status: string;
  message: string;
  created_at: string;
}

export interface TraineeAiUsage {
  calls: number;
  cost_usd: number;
  by_type: Array<{ call_type: string; calls: number; cost_usd: number }>;
}

/**
 * `GET admin-analytics?op=trainee&id=<uuid>&tz=-240` — needs `sessions.read`.
 * Every other section is included only when the caller holds ITS permission
 * and is otherwise null, with the section named in `withheld` so the profile
 * can say so instead of showing an empty card.
 */
export interface TraineeDetail {
  profile: TraineeDirectoryEntry;
  /** All of this trainee's sessions, newest first (capped at 2,000). */
  sessions: SessionSummary[];
  activity: TraineeActivity | null; // analytics.read
  feedback: TraineeFeedbackRow[] | null; // feedback.read
  scenarios: TraineeScenarioRow[] | null; // scenarios.read
  analyzer: TraineeAnalyzerRow[] | null; // analyzer.read
  reports: TraineeReportRow[] | null; // reports.read
  ai_usage: TraineeAiUsage | null; // quality.read
  withheld: Array<'activity' | 'feedback' | 'scenarios' | 'analyzer' | 'reports' | 'ai_usage'>;
}
