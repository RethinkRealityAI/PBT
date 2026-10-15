/**
 * "Needs your attention" — the Overview's inbox. Each item is something a
 * practice manager can act on today, with the one figure that justifies it
 * and where to go to deal with it. Ordered by severity, then size.
 *
 * Sources (each optional, so a role without the permission simply gets no
 * item rather than a 403):
 *   - trainees slipping (last practised 8–21 days ago) and people who joined
 *     over a week ago and never practised            → Trainees tab
 *   - low-scoring and unscorable sessions in the window → Sessions tab
 *   - open problem reports (reports.read)              → Feedback › Reports
 *   - AI failing or slow (quality.read)                → AI quality tab
 *
 * Also home to `aiHealth()`, the AI figures the Overview's compact strip and
 * this inbox share. Pure and clock-injectable; unit-tested.
 */
import type { SessionSummary } from '../../../../src/shared/analytics/contract';
import { DAY_MS, median, splitByPeriod, type Range } from './period';
import { isScored } from './metrics';
import type { TraineeRow } from './trainees';

// ─── AI health ─────────────────────────────────────────────────────────

/**
 * Trip points for the AI alerts — the same bars the AI quality tab's banner
 * uses (`ALERT_THRESHOLDS` in screens/QualityScreen.tsx), so the Overview
 * never raises an alarm the quality tab doesn't.
 */
export const AI_ALERTS = {
  errorRatePct: 5,
  p95LatencyMs: 6000,
  /** Fewer calls than this is too small a sample to call a rate a problem. */
  minCalls: 10,
} as const;

export interface AiCallLike {
  created_at: string;
  latency_ms: number;
  cost_usd: number | string;
  error: string | null;
}

export interface AiHealth {
  calls: number;
  failures: number;
  /** 0–100; null with no calls. */
  failureRate: number | null;
  medianMs: number | null;
  /** Slowest 5% of replies took at least this long (nearest rank). */
  p95Ms: number | null;
  costUsd: number;
  /** Spend per day of observed activity × 30; null with no calls. */
  projectedMonthlyUsd: number | null;
}

function p95(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * 0.95) - 1));
  return sorted[idx];
}

/**
 * AI health over the CURRENT window of `calls` (which may hold twice the
 * window, as the data hooks fetch). The monthly projection divides by the days
 * actually observed, not the window's width — "$3 over the two days since
 * launch" must not read as "$0.10 a day" on a 28-day range.
 */
export function aiHealth(calls: readonly AiCallLike[], range: Range, now = Date.now()): AiHealth {
  const { current } = splitByPeriod(calls, range, now);
  const n = current.length;
  const failures = current.filter((c) => c.error != null && c.error !== '').length;
  const latencies = current.map((c) => c.latency_ms).filter((v) => Number.isFinite(v) && v >= 0);
  const costUsd = current.reduce((a, c) => a + (Number(c.cost_usd) || 0), 0);
  let projected: number | null = null;
  if (n > 0) {
    const oldest = Math.min(...current.map((c) => new Date(c.created_at).getTime()).filter(Number.isFinite));
    const spanDays = Math.max(1, (now - oldest) / DAY_MS);
    projected = (costUsd / spanDays) * 30;
  }
  return {
    calls: n,
    failures,
    failureRate: n > 0 ? (failures / n) * 100 : null,
    medianMs: median(latencies),
    p95Ms: p95(latencies),
    costUsd,
    projectedMonthlyUsd: projected,
  };
}

// ─── The inbox ─────────────────────────────────────────────────────────

export type AttentionTone = 'danger' | 'warn' | 'info';

export type AttentionTarget =
  | { kind: 'tab'; tab: 'trainees' | 'sessions' | 'quality'; id?: string | null }
  | { kind: 'nav'; screen: 'feedback'; tab: 'reports' };

export interface AttentionItem {
  key: string;
  tone: AttentionTone;
  /** Higher first. */
  severity: number;
  /** How many things the item is about (sessions, people, reports). */
  count: number;
  title: string;
  detail: string;
  action: { label: string; target: AttentionTarget };
}

export interface ReportLike {
  kind: string;
  status: string;
  message: string;
  created_at: string;
}

export interface AttentionInput {
  /** Every trainee (from `rollupTrainees` over ALL sessions — status is a lifetime fact). */
  trainees: readonly TraineeRow[];
  /** Sessions in the current window. */
  windowSessions: readonly SessionSummary[];
  nameOf: (userId: string) => string;
  objectionLabel: (pushbackId: string | null) => string;
  /** Recent problem reports; null when the viewer can't read them. */
  reports?: readonly ReportLike[] | null;
  /** AI health for the window; null when the viewer can't read it. */
  ai?: AiHealth | null;
  now?: number;
}

/** Sessions under this score are worth a review with the trainee. */
export const LOW_SCORE = 55;
/** Joined more than this many days ago and never practised = worth a nudge. */
export const NOT_STARTED_AFTER_DAYS = 7;

/** "Hana Sato, Alex Chen and 2 more". */
export function nameList(names: readonly string[], max = 3): string {
  if (names.length === 0) return '';
  if (names.length <= max) {
    if (names.length === 1) return names[0];
    return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
  }
  const shown = names.slice(0, max);
  return `${shown.join(', ')} and ${names.length - max} more`;
}

function count(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

function clip(text: string, max = 90): string {
  const t = text.trim().replace(/\s+/g, ' ');
  return t.length <= max ? t : `${t.slice(0, max - 1).trimEnd()}…`;
}

export function buildAttention(input: AttentionInput): AttentionItem[] {
  const now = input.now ?? Date.now();
  const items: AttentionItem[] = [];

  // ── AI ──────────────────────────────────────────────────────────────
  const ai = input.ai;
  if (ai && ai.calls >= AI_ALERTS.minCalls) {
    if (ai.failureRate != null && ai.failureRate > AI_ALERTS.errorRatePct) {
      items.push({
        key: 'ai-failures',
        tone: 'danger',
        severity: 90,
        count: ai.failures,
        title: 'AI replies are failing',
        detail: `${ai.failureRate.toFixed(1)}% of AI calls failed (${ai.failures} of ${ai.calls}) — above the ${AI_ALERTS.errorRatePct}% alert level. Trainees may be seeing errors mid-session.`,
        action: { label: 'Open AI quality', target: { kind: 'tab', tab: 'quality' } },
      });
    }
    if (ai.p95Ms != null && ai.p95Ms > AI_ALERTS.p95LatencyMs) {
      items.push({
        key: 'ai-slow',
        tone: 'warn',
        severity: 60,
        count: 1,
        title: 'AI replies are slow',
        detail: `The slowest 5% of replies took ${(ai.p95Ms / 1000).toFixed(1)}s or longer (alert level ${AI_ALERTS.p95LatencyMs / 1000}s). Long waits break the flow of a conversation.`,
        action: { label: 'Open AI quality', target: { kind: 'tab', tab: 'quality' } },
      });
    }
  }

  // ── Problem reports ─────────────────────────────────────────────────
  if (input.reports) {
    const open = input.reports
      .filter((r) => r.status === 'open')
      .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
    const bugs = open.filter((r) => r.kind === 'bug');
    const ideas = open.length - bugs.length;
    if (bugs.length > 0) {
      items.push({
        key: 'reports-bugs',
        tone: 'warn',
        severity: 70,
        count: bugs.length,
        title: `${count(bugs.length, 'open problem report', 'open problem reports')}`,
        detail:
          `Latest: “${clip(bugs[0].message)}”` +
          (ideas > 0 ? ` Plus ${count(ideas, 'open suggestion', 'open suggestions')}.` : ''),
        action: { label: 'Review reports', target: { kind: 'nav', screen: 'feedback', tab: 'reports' } },
      });
    } else if (ideas > 0) {
      items.push({
        key: 'reports-ideas',
        tone: 'info',
        severity: 25,
        count: ideas,
        title: `${count(ideas, 'new suggestion', 'new suggestions')} from trainees`,
        detail: `Latest: “${clip(open[0].message)}”`,
        action: { label: 'Review reports', target: { kind: 'nav', screen: 'feedback', tab: 'reports' } },
      });
    }
  }

  // ── Low scores ──────────────────────────────────────────────────────
  const low = input.windowSessions
    .filter((s) => isScored(s) && (s.score_overall as number) < LOW_SCORE)
    .sort((a, b) => (a.score_overall as number) - (b.score_overall as number));
  if (low.length > 0) {
    const worst = low[0];
    const people = new Set(low.map((s) => s.user_id)).size;
    items.push({
      key: 'low-scores',
      tone: 'warn',
      severity: 55,
      count: low.length,
      title: `${count(low.length, 'session', 'sessions')} scored under ${LOW_SCORE}`,
      detail:
        (low.length > 1 && people > 1 ? `Across ${people} trainees. ` : '') +
        `Lowest: ${input.nameOf(worst.user_id)} on “${input.objectionLabel(worst.pushback_id)}” (${Math.round(worst.score_overall as number)}). Reviewing one together is the quickest way to lift a score.`,
      action:
        low.length === 1
          ? { label: 'Open the session', target: { kind: 'tab', tab: 'sessions', id: worst.id } }
          : { label: 'Review sessions', target: { kind: 'tab', tab: 'sessions' } },
    });
  }

  // ── Slipping ────────────────────────────────────────────────────────
  const atRisk = input.trainees
    .filter((t) => !t.disabled && t.status === 'at_risk')
    // Closest to going dormant first.
    .sort((a, b) => (a.lastSessionAt ?? 0) - (b.lastSessionAt ?? 0));
  if (atRisk.length > 0) {
    items.push({
      key: 'at-risk',
      tone: 'warn',
      severity: 50,
      count: atRisk.length,
      title: `${count(atRisk.length, 'trainee is', 'trainees are')} slipping`,
      detail: `${nameList(atRisk.map((t) => t.name))} last practised 8–21 days ago — a nudge now usually brings people back.`,
      action: { label: 'See trainees', target: { kind: 'tab', tab: 'trainees' } },
    });
  }

  // ── Scoring failures ────────────────────────────────────────────────
  const failed = input.windowSessions.filter((s) => s.completed && s.score_unavailable);
  if (failed.length > 0) {
    items.push({
      key: 'scoring-failed',
      tone: 'info',
      severity: 45,
      count: failed.length,
      title: `${count(failed.length, 'session', 'sessions')} couldn’t be scored`,
      detail: `The scorer didn’t answer. Trainees can retry from their scorecard; until then ${failed.length === 1 ? 'it is' : 'they are'} left out of every average.`,
      action: { label: 'Review sessions', target: { kind: 'tab', tab: 'sessions' } },
    });
  }

  // ── Never started ───────────────────────────────────────────────────
  // Portal staff (an admin role) aren't necessarily trainees; nudging them
  // to practise would be noise.
  const notStarted = input.trainees
    .filter(
      (t) =>
        !t.disabled &&
        t.admin_role == null &&
        t.status === 'not_started' &&
        now - t.joinedAt > NOT_STARTED_AFTER_DAYS * DAY_MS,
    )
    .sort((a, b) => a.joinedAt - b.joinedAt);
  if (notStarted.length > 0) {
    items.push({
      key: 'not-started',
      tone: 'info',
      severity: 40,
      count: notStarted.length,
      title: `${count(notStarted.length, 'person hasn’t', 'people haven’t')} started`,
      detail: `${nameList(notStarted.map((t) => t.name))} joined over a week ago and ${notStarted.length === 1 ? 'hasn’t' : 'haven’t'} practised yet.`,
      action: { label: 'See trainees', target: { kind: 'tab', tab: 'trainees' } },
    });
  }

  return items.sort((a, b) => b.severity - a.severity || b.count - a.count);
}
