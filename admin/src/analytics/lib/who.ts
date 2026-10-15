/**
 * Who practised — signed-in trainees and anonymous visitors — and in which
 * language. The ONE set of rules and words every Analytics tab, the session
 * window and the Feedback screen use for them.
 *
 * PBT is anonymous-first: most people practise without an account. Since
 * 15 October 2026 their sessions are recorded too, without identifying
 * details (`training_sessions.user_id` is null; `anon_session_id` is the
 * random id the app keeps on that device). Rules that hold everywhere:
 *   - An anonymous session is real practice: it counts as a session, and its
 *     score counts in team and skill averages.
 *   - It is never a PERSON: it never becomes a trainee, a name, a leader or
 *     an attention item. People are counted as signed-in trainees and,
 *     separately, as anonymous DEVICES (one per device id).
 *   - The device id is shown only as a short tag ("Device 4F2A") derived from
 *     it — enough to tell one device's sessions apart, nothing more.
 *
 * Sessions played anonymously BEFORE 15 October 2026 were rebuilt from app
 * activity (`reconstructed`): when, which objection, the mode and whether
 * they reached the scorecard are known; the conversation, the score and the
 * animal never were.
 *
 * Pure; unit-tested in `__tests__/who.test.ts`.
 */
import type { SessionSummary } from '../../../../src/shared/analytics/contract';
import { LOCALE_LABELS } from '../../lib/labels';

// ─── Who ───────────────────────────────────────────────────────────────

/** No account: the session belongs to a device, not a person. */
export function isAnonymous(s: { user_id?: string | null }): boolean {
  return !s.user_id;
}

/**
 * "4F2A" — a short, stable tag for a device id (a hash, so it never repeats
 * the stored id). Null without an id.
 */
export function deviceTag(anonId: string | null | undefined): string | null {
  const id = typeof anonId === 'string' ? anonId.trim() : '';
  if (!id) return null;
  // FNV-1a, 32-bit.
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return ((h >>> 0) & 0xffff).toString(16).toUpperCase().padStart(4, '0');
}

/** "Device 4F2A" — or "Unknown device" when the row carries no id. */
export function deviceLabel(anonId: string | null | undefined): string {
  const tag = deviceTag(anonId);
  return tag ? `Device ${tag}` : 'Unknown device';
}

/** Tooltip for every device tag. */
export const DEVICE_HELP =
  'A random id the app keeps on one phone or computer. It groups that device’s sessions — it isn’t a person, and says nothing about who used it.';

/** What stands in for a name: "Anonymous · Device 4F2A" (search, CSV). */
export function anonymousName(anonId: string | null | undefined): string {
  return `Anonymous · ${deviceLabel(anonId)}`;
}

/** Distinct signed-in trainees among the rows. */
export function signedInTrainees(rows: readonly SessionSummary[]): number {
  const ids = new Set<string>();
  for (const s of rows) if (s.user_id) ids.add(s.user_id);
  return ids.size;
}

/** Distinct anonymous devices among the rows (a row with no device id adds none). */
export function anonymousDevices(rows: readonly Pick<SessionSummary, 'user_id' | 'anon_session_id'>[]): number {
  const ids = new Set<string>();
  for (const s of rows) if (!s.user_id && s.anon_session_id) ids.add(s.anon_session_id);
  return ids.size;
}

export type WhoFilter = 'all' | 'signed_in' | 'anonymous';

export const WHO_FILTER_LABELS: Record<WhoFilter, string> = {
  all: 'Everyone',
  signed_in: 'Signed-in trainees',
  anonymous: 'Anonymous',
};

export function matchesWho(s: SessionSummary, f: WhoFilter): boolean {
  if (f === 'all') return true;
  return f === 'anonymous' ? isAnonymous(s) : !isAnonymous(s);
}

/** "2 trainees · 30 anonymous devices" — people behind a set of sessions, never one number. */
export function peopleWords(trainees: number, devices: number): string {
  const t = `${trainees.toLocaleString('en-US')} ${trainees === 1 ? 'trainee' : 'trainees'}`;
  if (devices === 0) return t;
  const d = `${devices.toLocaleString('en-US')} anonymous ${devices === 1 ? 'device' : 'devices'}`;
  return trainees === 0 ? d : `${t} · ${d}`;
}

// ─── Language ──────────────────────────────────────────────────────────

/** The key for a session whose language wasn't stored (sessions before 15 Oct 2026). */
export const LANGUAGE_NONE = 'none';

/** 'en' / 'fr' (region dropped: 'fr-CA' → 'fr'), or `LANGUAGE_NONE`. */
export function languageKey(locale: string | null | undefined): string {
  const base = typeof locale === 'string' ? locale.trim().toLowerCase().split(/[-_]/)[0] : '';
  return /^[a-z]{2}$/.test(base) ? base : LANGUAGE_NONE;
}

/** "English", "Français", "Not recorded". */
export function languageLabel(key: string): string {
  if (key === LANGUAGE_NONE || !key) return 'Not recorded';
  // A language the portal has no name for yet reads as its code ("ES"), never blank.
  return LOCALE_LABELS[key] ?? key.toUpperCase();
}

/** A session's language in words. */
export function sessionLanguage(s: { locale?: string | null }): string {
  return languageLabel(languageKey(s.locale));
}

export const LANGUAGE_NONE_HELP = 'The app language is recorded from 15 Oct 2026; older sessions didn’t store it.';

/** Language filter / split order: the shipped languages first, "Not recorded" last. */
export function languageOrder(rows: readonly { locale?: string | null }[]): string[] {
  const seen = new Set(rows.map((s) => languageKey(s.locale)));
  const known = Object.keys(LOCALE_LABELS);
  const extra = [...seen].filter((k) => k !== LANGUAGE_NONE && !known.includes(k)).sort();
  return [...known, ...extra, LANGUAGE_NONE];
}

// ─── Rebuilt sessions ──────────────────────────────────────────────────

export const REBUILT_TAG = 'Rebuilt';

export const REBUILT_TAG_HELP =
  'Rebuilt from app activity — an anonymous session from before 15 Oct 2026. When it happened, the objection and whether it reached the scorecard are known; no transcript or score was stored.';

export const REBUILT_SCORE_HELP =
  'Score not recorded — anonymous sessions before 15 Oct 2026 kept no transcript or score';

export const REBUILT_EXPLAINER =
  'Rebuilt from app activity. This anonymous session was played before 15 October 2026, when only signed-in sessions were saved — what happened is known (when, which objection, whether it reached the scorecard), but the conversation and score were never stored.';

/** The animal, when the session stored one — a rebuilt session never did. */
export function speciesOf(s: Pick<SessionSummary, 'species' | 'reconstructed'>): 'dog' | 'cat' | null {
  return s.reconstructed ? null : s.species;
}
