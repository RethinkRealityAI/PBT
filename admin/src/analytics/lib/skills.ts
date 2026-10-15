/**
 * Aggregations for the Skills tab — training OUTCOMES: which objection the
 * team handles worst and on which skill, which communication-style pairings
 * are hard, how owners felt by the end, what trainees said.
 *
 * Every average here is over scored sessions only (`isScored`); a failed
 * scoring attempt is a stand-in 0 and never counts. Groups too small to mean
 * anything are reported separately, never silently dropped.
 *
 * Pure; unit-tested in `__tests__/skills.test.ts`.
 */
import type { SessionSummary } from '../../../../src/shared/analytics/contract';
import { mean } from './period';
import {
  SKILL_KEYS,
  groupStats,
  isScored,
  skillAverages,
  type SkillKey,
} from './metrics';

// ─── Objection × skill ─────────────────────────────────────────────────

export interface ObjectionSkillRow {
  key: string;
  label: string;
  /** Scored sessions on this objection. */
  scored: number;
  /** Of those, how many carry the five skill scores. */
  withSkills: number;
  overall: number | null;
  skills: Record<SkillKey, number | null>;
}

/** Fewer scored sessions than this on an objection = too thin to compare. */
export const MIN_OBJECTION_SESSIONS = 2;

/**
 * One row per objection (most-practised first) with each skill's average and
 * the overall average. Objections with fewer than `min` scored sessions are
 * returned in `thin` so the page can say they were set aside.
 */
export function objectionSkillTable(
  rows: readonly SessionSummary[],
  labelOf: (pushbackId: string) => string,
  min = MIN_OBJECTION_SESSIONS,
): { rows: ObjectionSkillRow[]; thin: Array<{ key: string; label: string; scored: number }> } {
  const scored = rows.filter(isScored);
  const groups = groupStats(scored, (s) => s.pushback_id ?? 'custom');
  const out: ObjectionSkillRow[] = [];
  const thin: Array<{ key: string; label: string; scored: number }> = [];
  for (const g of groups) {
    const label = labelOf(g.key);
    if (g.scored < min) {
      thin.push({ key: g.key, label, scored: g.scored });
      continue;
    }
    const list = scored.filter((s) => (s.pushback_id ?? 'custom') === g.key);
    out.push({
      key: g.key,
      label,
      scored: g.scored,
      withSkills: skillAverages(list).count,
      overall: g.avgScore,
      skills: g.skills,
    });
  }
  out.sort((a, b) => b.scored - a.scored || a.label.localeCompare(b.label));
  return { rows: out, thin };
}

/**
 * The single weakest (objection, skill) cell among objections with at least
 * `min` sessions carrying skill scores — "the team is weakest at Transform on
 * weight denial".
 */
export function hardestCell(
  rows: readonly ObjectionSkillRow[],
  min = 3,
): { key: string; label: string; skill: SkillKey; value: number; sessions: number } | null {
  let best: { key: string; label: string; skill: SkillKey; value: number; sessions: number } | null = null;
  for (const r of rows) {
    if (r.withSkills < min) continue;
    for (const k of SKILL_KEYS) {
      const v = r.skills[k];
      if (v == null) continue;
      if (!best || v < best.value) best = { key: r.key, label: r.label, skill: k, value: v, sessions: r.withSkills };
    }
  }
  return best;
}

/**
 * Team objection titles from the sessions themselves. A session's
 * `scenario_title` is the scenario's own title when it has one, else the
 * objection's title — so a title shared by most sessions on a `team:`
 * objection is the objection's name, while a one-off is a scenario's.
 */
export function teamObjectionTitles(rows: readonly SessionSummary[]): Array<{ id: string; title: string }> {
  const byId = new Map<string, Map<string, number>>();
  const totals = new Map<string, number>();
  for (const s of rows) {
    const id = s.pushback_id;
    if (!id || !id.startsWith('team:')) continue;
    totals.set(id, (totals.get(id) ?? 0) + 1);
    // The objection's own title — never `scenario_title`, which may be a
    // Studio scenario's card title ("Senior lab, cost-sensitive owner").
    const t = s.objection_title?.trim();
    if (!t) continue;
    let m = byId.get(id);
    if (!m) byId.set(id, (m = new Map()));
    m.set(t, (m.get(t) ?? 0) + 1);
  }
  const out: Array<{ id: string; title: string }> = [];
  for (const [id, m] of byId) {
    let top: [string, number] | null = null;
    for (const e of m) if (!top || e[1] > top[1]) top = e;
    if (top && top[1] * 2 > (totals.get(id) ?? 0)) out.push({ id, title: top[0] });
  }
  return out;
}

// ─── Communication styles ──────────────────────────────────────────────

/**
 * The hardest trainee-style × owner-style pairing with at least `min` scored
 * sessions (from `driverMatchup`'s map, keyed "trainee|owner").
 */
export function hardestPairing(
  matchup: ReadonlyMap<string, { avgScore: number | null; scored: number }>,
  min = 2,
): { trainee: string; owner: string; avgScore: number; scored: number } | null {
  let best: { trainee: string; owner: string; avgScore: number; scored: number } | null = null;
  for (const [k, v] of matchup) {
    if (v.avgScore == null || v.scored < min) continue;
    if (!best || v.avgScore < best.avgScore) {
      const [trainee, owner] = k.split('|');
      best = { trainee, owner, avgScore: v.avgScore, scored: v.scored };
    }
  }
  return best;
}

// ─── Splits ────────────────────────────────────────────────────────────

export interface SplitRowStats {
  key: string;
  sessions: number;
  scored: number;
  avgScore: number | null;
}

/**
 * Sessions and average score per value of `keyOf`, in the order given by
 * `order`. `keyOf` returns null for a session that has no value to split on
 * (a rebuilt session's animal) — it is left out, not guessed.
 */
export function splitBy(
  rows: readonly SessionSummary[],
  keyOf: (s: SessionSummary) => string | null,
  order: readonly string[],
): SplitRowStats[] {
  const groups = new Map(groupStats(rows, keyOf).map((g) => [g.key, g]));
  return order
    .map((key) => {
      const g = groups.get(key);
      return { key, sessions: g?.sessions ?? 0, scored: g?.scored ?? 0, avgScore: g?.avgScore ?? null };
    })
    .filter((r) => r.sessions > 0);
}

// ─── How owners felt ───────────────────────────────────────────────────

/** How finished sessions ended: the AI owner's mood on its last message. */
export function moodSplit(rows: readonly SessionSummary[]): { green: number; yellow: number; red: number; total: number } {
  const out = { green: 0, yellow: 0, red: 0, total: 0 };
  for (const s of rows) {
    if (!s.completed || s.owner_mood_end == null) continue;
    out[s.owner_mood_end]++;
    out.total++;
  }
  return out;
}

/** Mean owner sentiment (−1…1) on the first and last scored turn, over scored sessions that carry both. */
export function sentimentShift(rows: readonly SessionSummary[]): { start: number | null; end: number | null; count: number } {
  const both = rows.filter((s) => isScored(s) && s.owner_sentiment_start != null && s.owner_sentiment_end != null);
  return {
    start: mean(both.map((s) => s.owner_sentiment_start as number)),
    end: mean(both.map((s) => s.owner_sentiment_end as number)),
    count: both.length,
  };
}

/** "Upset" … "Happy" for a −1…1 sentiment. */
export function sentimentWord(v: number): string {
  return v <= -0.5 ? 'upset' : v < -0.15 ? 'wary' : v <= 0.15 ? 'neutral' : v < 0.5 ? 'warm' : 'happy';
}

// ─── Trainee feedback ──────────────────────────────────────────────────

export interface FeedbackLike {
  realism: number | null;
  ai_quality: number | null;
  comfort: number | null;
  comment: string | null;
  created_at: string;
  pushback_id?: string | null;
  user_id?: string | null;
}

export interface FeedbackSummary {
  count: number;
  realism: number | null;
  aiQuality: number | null;
  comfort: number | null;
}

function ratings(rows: readonly FeedbackLike[], pick: (f: FeedbackLike) => number | null): number[] {
  return rows.map(pick).filter((v): v is number => v != null && Number.isFinite(v) && v >= 1 && v <= 5);
}

export function feedbackSummary(rows: readonly FeedbackLike[]): FeedbackSummary {
  return {
    count: rows.length,
    realism: mean(ratings(rows, (f) => f.realism)),
    aiQuality: mean(ratings(rows, (f) => f.ai_quality)),
    comfort: mean(ratings(rows, (f) => f.comfort)),
  };
}

/** Newest comments first, blanks skipped. */
export function latestComments<T extends FeedbackLike>(rows: readonly T[], n = 3): T[] {
  return rows
    .filter((f) => (f.comment ?? '').trim() !== '')
    .slice()
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
    .slice(0, n);
}

// ─── Coaching ──────────────────────────────────────────────────────────

/** A practical next step for a team whose weakest skill is this one. */
export const SKILL_COACHING: Record<SkillKey, string> = {
  acknowledge:
    'Have trainees open every reply by naming the owner’s worry in their own words before giving any facts.',
  clarify:
    'Ask for one open question before any recommendation — “What worries you most about switching?” — and let the owner answer.',
  transform:
    'End every conversation on one concrete, low-risk next step the owner agrees to: a trial period, a weigh-in date, a written plan.',
  empathy: 'Model warm, validating phrases (“It makes sense you’d want to be sure…”) and keep judgement out of the tone.',
  rapport: 'Slow the pace: check in, use the pet’s name, and agree the plan together rather than prescribing it.',
};
