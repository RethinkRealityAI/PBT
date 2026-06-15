import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const { insert, getSupabase, logEvent } = vi.hoisted(() => ({
  insert: vi.fn(),
  getSupabase: vi.fn(),
  logEvent: vi.fn(),
}));

vi.mock('../../auth/supabaseClient', () => ({ getSupabase }));
vi.mock('../../../lib/analytics', () => ({ logEvent }));
vi.mock('../../../lib/storage', () => ({
  getOrCreateSessionId: () => 'anon-xyz',
}));

import { usePlatformReport } from '../usePlatformReport';

beforeEach(() => {
  insert.mockReset();
  getSupabase.mockReset();
  logEvent.mockReset();
});

describe('usePlatformReport', () => {
  it('rejects an empty message without hitting the backend', async () => {
    getSupabase.mockReturnValue({ from: () => ({ insert }) });
    const { result } = renderHook(() => usePlatformReport());
    await act(async () => {
      await result.current.submitReport({ kind: 'bug', message: '   ' });
    });
    expect(result.current.status).toBe('error');
    expect(insert).not.toHaveBeenCalled();
  });

  it('inserts a trimmed report row with screen + user agent', async () => {
    insert.mockResolvedValue({ error: null });
    getSupabase.mockReturnValue({
      auth: { getUser: async () => ({ data: { user: { id: 'u-1' } } }) },
      from: () => ({ insert }),
    });
    const { result } = renderHook(() => usePlatformReport());
    await act(async () => {
      await result.current.submitReport({
        kind: 'suggestion',
        message: '  add dark mode  ',
        screen: 'home',
      });
    });
    expect(result.current.status).toBe('done');
    expect(logEvent).toHaveBeenCalledOnce();
    const row = insert.mock.calls[0][0];
    expect(row).toMatchObject({
      user_id: 'u-1',
      anon_session_id: 'anon-xyz',
      kind: 'suggestion',
      message: 'add dark mode',
      screen: 'home',
    });
    expect('user_agent' in row).toBe(true);
  });

  it('soft-succeeds with no backend configured', async () => {
    getSupabase.mockReturnValue(null);
    const { result } = renderHook(() => usePlatformReport());
    await act(async () => {
      await result.current.submitReport({ kind: 'bug', message: 'broken' });
    });
    expect(result.current.status).toBe('done');
    expect(insert).not.toHaveBeenCalled();
  });
});
