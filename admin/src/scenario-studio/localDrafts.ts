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

function writeStore(store: Store): void {
  try {
    const now = Date.now();
    const kept = Object.entries(store)
      .filter(([, e]) => e && typeof e.savedAt === 'number' && now - e.savedAt < MAX_AGE_MS)
      .sort(([, a], [, b]) => b.savedAt - a.savedAt)
      .slice(0, MAX_ENTRIES);
    localStorage.setItem(storageKey(), JSON.stringify(Object.fromEntries(kept)));
  } catch {
    /* storage full or blocked — resume is a convenience, not a guarantee */
  }
}

export function readLocalDraft(id: string): LocalDraftEntry | null {
  const entry = readStore()[id];
  if (!entry || typeof entry !== 'object' || !entry.draft || typeof entry.baseline !== 'string') {
    return null;
  }
  return entry;
}

export function writeLocalDraft(id: string, entry: LocalDraftEntry): void {
  const store = readStore();
  store[id] = entry;
  writeStore(store);
}

export function clearLocalDraft(id: string): void {
  const store = readStore();
  if (!(id in store)) return;
  delete store[id];
  writeStore(store);
}

/** Every resumable entry, newest first. */
export function listLocalDrafts(): Array<{ id: string } & LocalDraftEntry> {
  return Object.entries(readStore())
    .filter(([, e]) => e && typeof e.savedAt === 'number' && e.draft)
    .sort(([, a], [, b]) => b.savedAt - a.savedAt)
    .map(([id, e]) => ({ id, ...e }));
}

/** Does this entry hold edits the server doesn't have? */
export function isUnsaved(entry: Pick<LocalDraftEntry, 'draft' | 'baseline'>): boolean {
  return JSON.stringify(entry.draft) !== entry.baseline;
}
