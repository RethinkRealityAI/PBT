/**
 * Small readings of the `EngagementReport` the Engagement tab prints: the
 * weekday × hour grid in Monday-first order and its peak, time-in-app
 * durations, the returning-visitor rate, and the device/context breakdowns
 * folded for a share bar. Pure; unit-tested in `__tests__/engagementInsights.test.ts`.
 */
import type { ContextBreakdown, EngagementTotals } from '../../../../src/shared/analytics/contract';
import { humanize } from '../../lib/labels';

// ─── Weekday × hour ────────────────────────────────────────────────────

/** Report weekday index (0 = Sunday) in the order a work week reads: Monday first. */
export const WEEKDAYS_MONDAY_FIRST: ReadonlyArray<{ index: number; short: string; long: string }> = [
  { index: 1, short: 'Mon', long: 'Monday' },
  { index: 2, short: 'Tue', long: 'Tuesday' },
  { index: 3, short: 'Wed', long: 'Wednesday' },
  { index: 4, short: 'Thu', long: 'Thursday' },
  { index: 5, short: 'Fri', long: 'Friday' },
  { index: 6, short: 'Sat', long: 'Saturday' },
  { index: 0, short: 'Sun', long: 'Sunday' },
];

/** Compact axis label: 0 → "12a", 8 → "8a", 12 → "12p", 15 → "3p". */
export function hourTick(h: number): string {
  const suffix = h < 12 ? 'a' : 'p';
  const n = h % 12 === 0 ? 12 : h % 12;
  return `${n}${suffix}`;
}

/** Spoken hour: 0 → "midnight", 8 → "8 am", 12 → "noon", 15 → "3 pm". */
export function hourWords(h: number): string {
  if (h === 0) return 'midnight';
  if (h === 12) return 'noon';
  return `${h % 12} ${h < 12 ? 'am' : 'pm'}`;
}

/** "8–9 am", "11 am–noon", "noon–1 pm". */
export function hourRange(h: number): string {
  const a = hourWords(h);
  const b = hourWords((h + 1) % 24);
  const sameHalf = h !== 11 && h !== 23 && h !== 0 && h !== 12 && a.split(' ')[1] === b.split(' ')[1];
  return sameHalf ? `${a.split(' ')[0]}–${b}` : `${a}–${b}`;
}

/** Read one cell; tolerant of a ragged or short grid. */
export function heatValue(grid: readonly (readonly number[])[], weekday: number, hour: number): number {
  const v = grid[weekday]?.[hour];
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

export interface HeatSummary {
  total: number;
  /** The single busiest weekday-hour, or null with no activity. */
  peak: { weekday: number; hour: number; views: number } | null;
  /** Busiest weekday by total views (0 = Sunday). */
  busiestDay: { weekday: number; views: number; share: number } | null;
  /** Busiest hour of the day across the week. */
  busiestHour: { hour: number; views: number; share: number } | null;
  /** Share of views on Saturday + Sunday, 0–100. */
  weekendShare: number | null;
}

export function heatSummary(grid: readonly (readonly number[])[]): HeatSummary {
  let total = 0;
  let peak: HeatSummary['peak'] = null;
  const dayTotals = Array.from({ length: 7 }, () => 0);
  const hourTotals = Array.from({ length: 24 }, () => 0);
  // Walk Monday-first so a tie names the earlier day of the work week.
  for (const { index: d } of WEEKDAYS_MONDAY_FIRST) {
    for (let h = 0; h < 24; h++) {
      const v = heatValue(grid, d, h);
      total += v;
      dayTotals[d] += v;
      hourTotals[h] += v;
      if (v > 0 && (!peak || v > peak.views)) peak = { weekday: d, hour: h, views: v };
    }
  }
  if (total === 0) return { total: 0, peak: null, busiestDay: null, busiestHour: null, weekendShare: null };
  let bd = WEEKDAYS_MONDAY_FIRST[0].index;
  for (const { index } of WEEKDAYS_MONDAY_FIRST) if (dayTotals[index] > dayTotals[bd]) bd = index;
  let bh = 0;
  for (let h = 1; h < 24; h++) if (hourTotals[h] > hourTotals[bh]) bh = h;
  return {
    total,
    peak,
    busiestDay: { weekday: bd, views: dayTotals[bd], share: (dayTotals[bd] / total) * 100 },
    busiestHour: { hour: bh, views: hourTotals[bh], share: (hourTotals[bh] / total) * 100 },
    weekendShare: ((dayTotals[0] + dayTotals[6]) / total) * 100,
  };
}

export function weekdayLong(index: number): string {
  return WEEKDAYS_MONDAY_FIRST.find((d) => d.index === index)?.long ?? '';
}

/** "Busiest: Tuesdays around 8 am" — or null when the grid is empty. */
export function peakSentence(grid: readonly (readonly number[])[]): string | null {
  const { peak } = heatSummary(grid);
  if (!peak) return null;
  return `Busiest: ${weekdayLong(peak.weekday)}s around ${hourWords(peak.hour)}`;
}

// ─── Durations & rates ─────────────────────────────────────────────────

/** Time in app: "3h 20m", "45m", "30s", "0m". */
export function fmtDwell(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms) || ms <= 0) return '0m';
  const totalMin = Math.round(ms / 60_000);
  if (totalMin === 0) return `${Math.max(1, Math.round(ms / 1000))}s`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m}m`;
  return m ? `${h}h ${m}m` : `${h}h`;
}

/** Share of visitors who came back on 2+ days, 0–100; null with no visitors. */
export function returningRate(t: Pick<EngagementTotals, 'visitors' | 'returning_visitors'> | null | undefined): number | null {
  if (!t || t.visitors <= 0) return null;
  return (t.returning_visitors / t.visitors) * 100;
}

/** Screens opened per person; null with no visitors. */
export function screensPerVisitor(t: Pick<EngagementTotals, 'visitors' | 'screen_views'> | null | undefined): number | null {
  if (!t || t.visitors <= 0) return null;
  return t.screen_views / t.visitors;
}

// ─── Active-days histogram ─────────────────────────────────────────────

const ACTIVE_DAY_WORDS: Record<string, string> = {
  '1': '1 day',
  '2': '2 days',
  '3-5': '3–5 days',
  '6-10': '6–10 days',
  '11+': '11+ days',
};

export function activeDaysLabel(bucket: string): string {
  return ACTIVE_DAY_WORDS[bucket] ?? bucket.replace('-', '–');
}

// ─── Context share bars ────────────────────────────────────────────────

/**
 * Categorical hues for the device/context share bars, in a FIXED order
 * assigned by the dimension's known values — so "Phone" is the same blue in
 * every window, whatever its rank. Status hues (green / amber / red) are
 * deliberately absent: they mean good and bad elsewhere on this page.
 */
export const CONTEXT_HUES = ['#2a78d6', '#eb6834', '#1baf7a', '#6250d6', '#e87ba4'] as const;
export const CONTEXT_OTHER = 'oklch(0.80 0.015 40)';

export interface SharePart {
  key: string;
  label: string;
  value: number;
  color: string;
}

/**
 * A context breakdown as share-bar parts. `order` is the dimension's known
 * values (from its label map): each keeps its own hue; unknown values and
 * anything past the palette fold into one grey "Other".
 */
export function contextParts(
  breakdown: ContextBreakdown | null | undefined,
  labels: Record<string, string>,
  order: readonly string[],
): SharePart[] {
  const rows = (breakdown ?? []).filter((r) => r.visitors > 0);
  const known: SharePart[] = [];
  let other = 0;
  for (const r of rows) {
    const i = order.indexOf(r.value);
    if (i >= 0 && i < CONTEXT_HUES.length && r.value !== 'other') {
      known.push({ key: r.value, label: labels[r.value] ?? humanize(r.value), value: r.visitors, color: CONTEXT_HUES[i] });
    } else {
      other += r.visitors;
    }
  }
  known.sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key));
  if (other > 0) known.push({ key: 'other', label: 'Other', value: other, color: CONTEXT_OTHER });
  return known;
}

// ─── Trend buckets ─────────────────────────────────────────────────────

/**
 * A trend bucket's label. Short for the axis ("3 PM", "Oct 14"), long for a
 * tooltip or the table ("Tue, Oct 14 · 3–4 pm", "Tue, Oct 14", "Week of Oct 6").
 */
export function bucketLabel(start: number, granularity: 'hour' | 'day' | 'week', long = false): string {
  const d = new Date(start);
  if (Number.isNaN(d.getTime())) return '';
  const day = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  if (granularity === 'hour') {
    const h = d.getHours();
    return long ? `${d.toLocaleDateString('en-US', { weekday: 'short' })}, ${day} · ${hourRange(h)}` : hourTick(h).replace('a', ' am').replace('p', ' pm');
  }
  if (granularity === 'week') return long ? `Week of ${day}` : day;
  return long ? `${d.toLocaleDateString('en-US', { weekday: 'short' })}, ${day}` : day;
}
