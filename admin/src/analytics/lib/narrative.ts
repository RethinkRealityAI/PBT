/**
 * Plain-English summaries for the Analytics tabs — the sentences a practice
 * manager would say after reading the numbers, so the Overview opens with an
 * answer rather than a wall of tiles.
 *
 * Rules:
 *   - Every figure in a sentence is on the same page (a tile, a chart), so the
 *     words never claim something the reader can't check.
 *   - Honest when data is thin: no comparison without an earlier window, no
 *     "weakest skill" from two sessions, and an empty window says so plainly.
 *   - Output is SEGMENTS, not a string, so the page can set numbers in bold and
 *     names as links; `narrativeText()` flattens them (tests, aria labels).
 *
 * Pure; unit-tested in `__tests__/narrative.test.ts`.
 */
import type { Range } from './period';
import { SKILL_LABELS, type SessionStats, type SkillKey } from './metrics';

/** A run of text; `strong` for a figure, `userId` for a name that links to a profile. */
export type NarrativeSeg = string | { text: string; strong?: boolean; userId?: string };
export type NarrativeSentence = NarrativeSeg[];

/** Below this many scored sessions with skill scores, naming a weakest skill is noise. */
export const MIN_SKILL_SESSIONS = 3;
/** Below this many scored sessions, the average says how few it rests on. */
const THIN_SCORED = 5;

export interface NarrativeImprover {
  user_id: string;
  name: string;
  /** Points: mean of the latest scores minus the mean of the ones before. */
  momentum: number;
}

export interface OverviewNarrativeInput {
  range: Range;
  current: SessionStats;
  /** The previous window of the same length; null for `all` (nothing to compare). */
  previous: SessionStats | null;
  /** Weakest skill in the current window, when known. */
  weakestSkill: SkillKey | null;
  /** Scored sessions in the window that carry the five skill scores. */
  skillSessions: number;
  /** Most improved first; only positive movers are named. */
  improvers: readonly NarrativeImprover[];
}

/** "In the last 28 days" / "In the last 24 hours" / "So far". */
export function windowPhrase(range: Range): string {
  switch (range) {
    case '24h':
      return 'In the last 24 hours';
    case '7d':
      return 'In the last 7 days';
    case '28d':
      return 'In the last 28 days';
    case '90d':
      return 'In the last 90 days';
    case 'all':
      return 'So far';
  }
}

/** "the 28 days before" — the window a comparison is against; '' for `all`. */
export function priorWords(range: Range): string {
  switch (range) {
    case '24h':
      return 'the day before';
    case '7d':
      return 'the 7 days before';
    case '28d':
      return 'the 28 days before';
    case '90d':
      return 'the 90 days before';
    case 'all':
      return '';
  }
}

function plural(n: number, one: string, many: string): string {
  return `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`;
}

function times(n: number): string {
  if (n === 1) return 'once';
  if (n === 2) return 'twice';
  return `${n.toLocaleString('en-US')} times`;
}

/** "A", "A and B", "A, B and C". */
export function joinNames<T>(items: readonly T[], render: (t: T) => NarrativeSeg): NarrativeSeg[] {
  const out: NarrativeSeg[] = [];
  items.forEach((it, i) => {
    if (i > 0) out.push(i === items.length - 1 ? ' and ' : ', ');
    out.push(render(it));
  });
  return out;
}

/**
 * The Overview's opening paragraph: who practised and how much (vs the window
 * before), how the team scores (vs before), the weakest skill, and who
 * improved most. One to three sentences.
 */
export function overviewNarrative(input: OverviewNarrativeInput): NarrativeSentence[] {
  const { range, current, previous } = input;
  const prior = priorWords(range);
  const comparable = range !== 'all' && previous != null;
  const sentences: NarrativeSentence[] = [];

  // ── 1. Activity ────────────────────────────────────────────────────
  if (current.sessions === 0) {
    if (range === 'all') return [['No one has practised yet.']];
    sentences.push([`No one has practised in the ${windowPhrase(range).slice('In the '.length)} yet.`]);
    if (comparable && previous.sessions > 0) {
      sentences.push([
        `${prior.charAt(0).toUpperCase()}${prior.slice(1)} had `,
        { text: plural(previous.sessions, 'session', 'sessions'), strong: true },
        '.',
      ]);
    }
    return sentences;
  }

  const activity: NarrativeSentence = [
    `${windowPhrase(range)}, `,
    { text: plural(current.activeTrainees, 'trainee', 'trainees'), strong: true },
    range === 'all' ? ' have practised ' : ' practised ',
    { text: times(current.sessions), strong: true },
  ];
  if (comparable) {
    if (previous.sessions > 0) {
      const change = Math.round(((current.sessions - previous.sessions) / previous.sessions) * 100);
      if (Math.abs(change) < 5) activity.push(` — about as often as ${prior}`);
      else activity.push(' — ', { text: `${Math.abs(change)}% ${change > 0 ? 'more' : 'fewer'}`, strong: true }, ` than ${prior}`);
    } else {
      activity.push(` — up from none in ${prior}`);
    }
  }
  activity.push('.');
  sentences.push(activity);

  // ── 2. Score ───────────────────────────────────────────────────────
  if (current.scored === 0 || current.avgScore == null) {
    sentences.push([
      current.finished === 0
        ? `${current.sessions === 1 ? 'It wasn’t' : 'None of them was'} finished, so there are no scores yet.`
        : `${current.sessions === 1 ? 'It has' : 'None of them has'} a score yet.`,
    ]);
  } else {
    const score: NarrativeSentence = ['The team averages ', { text: String(Math.round(current.avgScore)), strong: true }];
    if (current.scored < THIN_SCORED) {
      score.push(` across just ${plural(current.scored, 'scored session', 'scored sessions')}`);
    }
    const prevAvg = comparable ? previous.avgScore : null;
    if (prevAvg != null) {
      const d = Math.round(current.avgScore) - Math.round(prevAvg);
      if (d === 0) score.push(', the same as before');
      else score.push(', ', { text: `${d > 0 ? 'up' : 'down'} ${Math.abs(d)} point${Math.abs(d) === 1 ? '' : 's'}`, strong: true });
    }
    score.push('.');
    sentences.push(score);
  }

  // ── 3. Weakest skill · most improved ───────────────────────────────
  const skillPart: NarrativeSeg[] =
    input.weakestSkill && input.skillSessions >= MIN_SKILL_SESSIONS
      ? [{ text: SKILL_LABELS[input.weakestSkill], strong: true }, ' is the weakest skill']
      : [];
  const movers = input.improvers.filter((m) => m.momentum > 0).slice(0, 2);
  const moverPart: NarrativeSeg[] = movers.length
    ? [...joinNames(movers, (m) => ({ text: m.name, userId: m.user_id })), ' improved most']
    : [];
  if (skillPart.length && moverPart.length) sentences.push([...skillPart, '; ', ...moverPart, '.']);
  else if (skillPart.length) sentences.push([...skillPart, '.']);
  else if (moverPart.length) sentences.push([...moverPart, '.']);

  return sentences;
}

/** Flatten segments to plain text (tests, aria labels, copy). */
export function narrativeText(sentences: readonly NarrativeSentence[]): string {
  return sentences.map((s) => s.map((seg) => (typeof seg === 'string' ? seg : seg.text)).join('')).join(' ');
}
