import { afterEach, describe, expect, it } from 'vitest';
import {
  LOCAL_DRAFTS_KEY,
  listLocalDrafts,
  readLocalDraft,
  setLocalDraftsOwner,
  writeLocalDraft,
} from '../localDrafts';
import { EMPTY_TRANSCRIPT } from '../copilot/types';

const entry = (title: string) => ({
  draft: { scenario_id: 'admin:x', breed: title },
  baseline: '{}',
  step: 'pet' as const,
  transcript: EMPTY_TRANSCRIPT,
  tested: false,
  title,
  savedAt: Date.now(),
});

describe('local drafts are kept per admin account', () => {
  afterEach(() => {
    setLocalDraftsOwner(null);
    localStorage.clear();
  });

  it('one admin never sees (or resumes) another admin’s unsaved work', () => {
    setLocalDraftsOwner('admin-a');
    writeLocalDraft('admin:x', entry('Persian'));
    setLocalDraftsOwner('admin-b');
    expect(readLocalDraft('admin:x')).toBeNull();
    expect(listLocalDrafts()).toHaveLength(0);
    setLocalDraftsOwner('admin-a');
    expect(readLocalDraft('admin:x')?.title).toBe('Persian');
    expect(localStorage.getItem(`${LOCAL_DRAFTS_KEY}:admin-a`)).not.toBeNull();
  });

  it('ignores an owner id that is not a plain identifier', () => {
    setLocalDraftsOwner('../../etc');
    writeLocalDraft('admin:x', entry('Lab'));
    expect(localStorage.getItem(LOCAL_DRAFTS_KEY)).not.toBeNull();
  });
});
