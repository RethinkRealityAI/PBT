import { describe, expect, it, beforeEach } from 'vitest';
import {
  readStorage,
  writeStorage,
  removeStorage,
  clearAllStorage,
  getOrCreateSessionId,
  STORAGE_KEYS,
  type StorageKeyDef,
} from '../storage';

const numberKey: StorageKeyDef<number> = {
  key: 'test_number',
  fallback: 0,
  validate: (v): v is number => typeof v === 'number',
};

describe('storage', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('returns fallback when key missing', () => {
    expect(readStorage(numberKey)).toBe(0);
  });

  it('round-trips a value', () => {
    writeStorage(numberKey, 42);
    expect(readStorage(numberKey)).toBe(42);
  });

  it('returns fallback and clears the slot when value is corrupt JSON', () => {
    localStorage.setItem('pbt:test_number', '{not json');
    expect(readStorage(numberKey)).toBe(0);
    expect(localStorage.getItem('pbt:test_number')).toBeNull();
  });

  it('returns fallback and clears when validator fails', () => {
    localStorage.setItem('pbt:test_number', JSON.stringify('hello'));
    expect(readStorage(numberKey)).toBe(0);
    expect(localStorage.getItem('pbt:test_number')).toBeNull();
  });

  it('removeStorage deletes the namespaced key', () => {
    writeStorage(numberKey, 1);
    removeStorage(numberKey.key);
    expect(readStorage(numberKey)).toBe(0);
  });

  it('clearAllStorage only clears pbt: prefixed keys', () => {
    writeStorage(numberKey, 1);
    localStorage.setItem('other:thing', 'keep');
    clearAllStorage();
    expect(readStorage(numberKey)).toBe(0);
    expect(localStorage.getItem('other:thing')).toBe('keep');
  });

  it('getOrCreateSessionId persists a stable id', () => {
    const id1 = getOrCreateSessionId();
    const id2 = getOrCreateSessionId();
    expect(id1).toEqual(id2);
    expect(id1).toMatch(/^[0-9a-f-]{36}$/i);
  });

  it('theme key validates the union', () => {
    localStorage.setItem('pbt:theme', JSON.stringify('purple'));
    expect(readStorage(STORAGE_KEYS.theme)).toBe('system');
  });
});
