/**
 * Unsaved Studio work, kept in the browser so a refresh, a sidebar click or
 * a closed tab never costs an admin their draft or the assistant
 * conversation that produced it.
 *
 * One entry per scenario id under `pbt:admin:studio_drafts`. Entries older
 * than 14 days are pruned on write; at most 20 are kept (newest first).
 * Every access is wrapped — storage can be full, blocked, or absent, and the
 * Studio must work (just without resume) when it is.
 */
import type { StudioDraft, StudioStepKey } from './studioModel';
import type { CopilotTranscript } from './copilot/types';

export const LOCAL_DRAFTS_KEY = 'pbt:admin:studio_drafts';

/**
 * Drafts are kept PER ADMIN ACCOUNT (`pbt:admin:studio_drafts:<userId>`):
 * on a shared machine the next admin must not see — or resume — someone
 * else's unsaved work and assistant conversation. Set once by the Studio
 * from the signed-in identity; unset falls back to the shared key.
 */
let owner: string | null = null;

export function setLocalDraftsOwner(userId: string | null | undefined): void {
  owner = userId && /^[A-Za-z0-9_-]{1,80}$/.test(userId) ? userId : null;
}

function storageKey(): string {
  return owner ? `${LOCAL_DRAFTS_KEY}:${owner}` : LOCAL_DRAFTS_KEY;
}
const MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;
const MAX_ENTRIES = 20;

export interface LocalDraftEntry {
  /** The working copy at the time of the last edit. */
  draft: StudioDraft;
  /**
   * JSON of the draft as it was when the editor opened (the saved state).
   * `draft` differing from it is what "unsaved changes" means after a reload.
   */
  baseline: string;
  step: StudioStepKey;
  transcript: CopilotTranscript;
  /** True once a Test drive finished against a draft identical to `draft`. */
  tested: boolean;
  /** Human title at save time, for the "Resume" list. */
  title: string;
  savedAt: number;
}

type Store = Record<string, LocalDraftEntry>;

function readStore(): Store {
  try {
    const raw = localStorage.getItem(storageKey());
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Store) : {};
  } catch {
    return {};
  }
}

/**
 * One entry, as it must look to be resumable. Both readers use this, so a
 * broken entry (a hand-edited store, an older shape) is invisible everywhere
 * instead of listed by one and refused by the other — or worse, crashing the
 * editor on `transcript.items.length`.
 */
function isValidEntry(e: unknown): e is LocalDraftEntry {
  if (!e || typeof e !== 'object') return false;
  const bag = e as Record<string, unknown>;
  const transcript = bag.transcript as Record<string, unknown> | undefined;
  return (
    !!bag.draft &&
    typeof bag.draft === 'object' &&
    typeof bag.baseline === 'string' &&
    typeof bag.savedAt === 'number' &&
    (bag.title === undefined || typeof bag.title === 'string') &&
    !!transcript &&
    typeof transcript === 'object' &&
    Array.isArray(transcript.items)
  );
}

/**
 * Write the store. Returns whether the browser actually kept it — storage
 * can be full or blocked, and the editor's "kept in this browser" must not
 * be a promise it cannot keep. When the whole store does not fit (one
 * oversized assistant transcript used to stop EVERY draft from persisting),
 * the oldest entries are dropped and the write is retried once.
 */
function writeStore(store: Store): boolean {
  const now = Date.now();
  const kept = Object.entries(store)
    .filter(([, e]) => e && typeof e.savedAt === 'number' && now - e.savedAt < MAX_AGE_MS)
    .sort(([, a], [, b]) => b.savedAt - a.savedAt)
    .slice(0, MAX_ENTRIES);
  const attempt = (entries: typeof kept): boolean => {
    try {
      localStorage.setItem(storageKey(), JSON.stringify(Object.fromEntries(entries)));
      return true;
    } catch {
      return false;
    }
  };
  if (attempt(kept)) return true;
  // Keep the newest entry (the one being edited) and try again with less.
  return kept.length > 1 ? attempt(kept.slice(0, Math.max(1, Math.floor(kept.length / 2)))) : false;
}

export function readLocalDraft(id: string): LocalDraftEntry | null {
  const entry = readStore()[id];
  return isValidEntry(entry) ? entry : null;
}

/** True when the browser kept the draft; false when storage refused it. */
export function writeLocalDraft(id: string, entry: LocalDraftEntry): boolean {
  const store = readStore();
  store[id] = entry;
  return writeStore(store);
}

export function clearLocalDraft(id: string): void {
  const store = readStore();
  if (!(id in store)) return;
  delete store[id];
  writeStore(store);
}

/** Every resumable entry, newest first — the same validity rule as `readLocalDraft`. */
export function listLocalDrafts(): Array<{ id: string } & LocalDraftEntry> {
  return Object.entries(readStore())
    .filter((pair): pair is [string, LocalDraftEntry] => isValidEntry(pair[1]))
    .sort(([, a], [, b]) => b.savedAt - a.savedAt)
    .map(([id, e]) => ({ id, ...e }));
}
