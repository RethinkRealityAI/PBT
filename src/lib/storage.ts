/**
 * Namespaced, JSON-safe localStorage wrapper.
 * Reads validate the shape against an optional Zod-style validator.
 * Corruption → returns the fallback and logs once.
 */

const NS = 'pbt:';

export interface StorageKeyDef<T> {
  key: string;
  fallback: T;
  validate?: (value: unknown) => value is T;
}

function fullKey(key: string): string {
  return `${NS}${key}`;
}

const warned = new Set<string>();

export function readStorage<T>(def: StorageKeyDef<T>): T {
  if (typeof localStorage === 'undefined') return def.fallback;
  try {
    const raw = localStorage.getItem(fullKey(def.key));
    if (raw == null) return def.fallback;
    const parsed = JSON.parse(raw) as unknown;
    if (def.validate && !def.validate(parsed)) {
      if (!warned.has(def.key)) {
        console.warn(`[pbt:storage] invalid value for ${def.key}; resetting`);
        warned.add(def.key);
      }
      removeStorage(def.key);
      return def.fallback;
    }
    return parsed as T;
  } catch {
    if (!warned.has(def.key)) {
      console.warn(`[pbt:storage] failed to parse ${def.key}; resetting`);
      warned.add(def.key);
    }
    removeStorage(def.key);
    return def.fallback;
  }
}

export function writeStorage<T>(def: StorageKeyDef<T>, value: T): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(fullKey(def.key), JSON.stringify(value));
  } catch (e) {
    console.warn(`[pbt:storage] failed to write ${def.key}`, e);
  }
}

export function removeStorage(key: string): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.removeItem(fullKey(key));
}

export function clearAllStorage(): void {
  if (typeof localStorage === 'undefined') return;
  const keys: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith(NS)) keys.push(k);
  }
  keys.forEach((k) => localStorage.removeItem(k));
}

// --- Standard key definitions ---

import { uuid } from './id';

export const STORAGE_KEYS = {
  sessionId: {
    key: 'session_id',
    fallback: '',
    validate: (v): v is string => typeof v === 'string' && v.length > 0,
  } as StorageKeyDef<string>,

  theme: {
    key: 'theme',
    fallback: 'light' as const,
    validate: (v): v is 'light' | 'dark' | 'system' =>
      v === 'light' || v === 'dark' || v === 'system',
  } as StorageKeyDef<'light' | 'dark' | 'system'>,

  termsAcceptedAt: {
    key: 'terms_accepted_at',
    fallback: null as string | null,
    validate: (v): v is string | null => v === null || typeof v === 'string',
  } as StorageKeyDef<string | null>,

  // App display language. Note: values must stay in sync with the Locale
  // union in src/i18n/locales.ts (kept inline here to avoid a lib → i18n
  // import cycle; the i18n catalog test asserts the two stay aligned).
  locale: {
    key: 'locale',
    fallback: 'en' as 'en' | 'fr',
    validate: (v): v is 'en' | 'fr' => v === 'en' || v === 'fr',
  } as StorageKeyDef<'en' | 'fr'>,

  /**
   * Session ids the user has already rated (Simulation Feedback Tool).
   * Ordered oldest → newest and capped; lets past-session scorecards show a
   * "already rated" state instead of re-offering the form.
   */
  ratedSessionIds: {
    key: 'rated_session_ids',
    fallback: [] as string[],
    validate: (v): v is string[] =>
      Array.isArray(v) && v.every((item) => typeof item === 'string'),
  } as StorageKeyDef<string[]>,
};

/**
 * Returns a stable session id, creating one on first call.
 */
export function getOrCreateSessionId(): string {
  const existing = readStorage(STORAGE_KEYS.sessionId);
  if (existing) return existing;
  const fresh = uuid();
  writeStorage(STORAGE_KEYS.sessionId, fresh);
  return fresh;
}
