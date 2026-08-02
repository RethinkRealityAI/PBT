import { describe, expect, it } from 'vitest';
import {
  isSessionRated,
  markSessionRated,
  RATED_SESSIONS_CAP,
} from '../useSessionFeedback';
import { readStorage, writeStorage, STORAGE_KEYS } from '../../../lib/storage';

describe('rated-session memory', () => {
  it('records a session id under pbt:rated_session_ids', () => {
    expect(isSessionRated('sess-1')).toBe(false);
    markSessionRated('sess-1');
    expect(isSessionRated('sess-1')).toBe(true);
    expect(localStorage.getItem('pbt:rated_session_ids')).toBe('["sess-1"]');
  });

  it('ignores a missing session id', () => {
    markSessionRated(null);
    markSessionRated(undefined);
    markSessionRated('');
    expect(readStorage(STORAGE_KEYS.ratedSessionIds)).toEqual([]);
    expect(isSessionRated(null)).toBe(false);
    expect(isSessionRated(undefined)).toBe(false);
  });

  it('dedupes repeat ratings and keeps the newest last', () => {
    markSessionRated('a');
    markSessionRated('b');
    markSessionRated('a');
    expect(readStorage(STORAGE_KEYS.ratedSessionIds)).toEqual(['b', 'a']);
  });

  it('caps the list, dropping the oldest ids', () => {
    for (let i = 0; i < RATED_SESSIONS_CAP + 5; i++) markSessionRated(`s-${i}`);
    const ids = readStorage(STORAGE_KEYS.ratedSessionIds);
    expect(ids).toHaveLength(RATED_SESSIONS_CAP);
    expect(ids[0]).toBe('s-5'); // oldest five fell off the front
    expect(ids[ids.length - 1]).toBe(`s-${RATED_SESSIONS_CAP + 4}`);
    expect(isSessionRated('s-0')).toBe(false);
  });

  it('resets a corrupt value instead of throwing', () => {
    localStorage.setItem('pbt:rated_session_ids', JSON.stringify(['ok', 42]));
    expect(isSessionRated('ok')).toBe(false);
    markSessionRated('fresh');
    expect(readStorage(STORAGE_KEYS.ratedSessionIds)).toEqual(['fresh']);
  });

  it('reads ids written directly through the storage key def', () => {
    writeStorage(STORAGE_KEYS.ratedSessionIds, ['seeded']);
    expect(isSessionRated('seeded')).toBe(true);
  });
});
