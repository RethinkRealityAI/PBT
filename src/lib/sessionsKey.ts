import type { StorageKeyDef } from './storage';
import type { SessionRecord } from '../services/types';

/**
 * Shared descriptor for the `pbt:sessions` slot. Import this instead of
 * re-declaring the key locally — one definition keeps the validator and
 * fallback consistent across every reader/writer.
 */
export const SESSIONS_KEY: StorageKeyDef<SessionRecord[]> = {
  key: 'sessions',
  fallback: [],
  validate: (v): v is SessionRecord[] => Array.isArray(v),
};
