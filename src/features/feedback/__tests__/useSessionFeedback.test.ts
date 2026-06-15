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
  getOrCreateSessionId: () => 'anon-123',
}));

import { useSessionFeedback } from '../useSessionFeedback';

beforeEach(() => {
  insert.mockReset();
  getSupabase.mockReset();
  logEvent.mockReset();
});

describe('useSessionFeedback', () => {
  it('inserts an anonymous-safe feedback row and logs an event', async () => {
    insert.mockResolvedValue({ error: null });
    getSupabase.mockReturnValue({
      auth: { getUser: async () => ({ data: { user: null } }) },
      from: () => ({ insert }),
    });

    const { result } = renderHook(() => useSessionFeedback());
    await act(async () => {
      await result.current.submitFeedback({
        sessionId: 'sess-1',
        realism: 4,
        aiQuality: 5,
        comfort: 3,
        comment: '  great  ',
        pushbackId: 'cost',
      });
    });

    expect(result.current.status).toBe('done');
    expect(logEvent).toHaveBeenCalledOnce();
    const row = insert.mock.calls[0][0];
    expect(row).toMatchObject({
      session_id: 'sess-1',
      user_id: null,
      anon_session_id: 'anon-123',
      realism: 4,
      ai_quality: 5,
      comfort: 3,
      comment: 'great', // trimmed
      pushback_id: 'cost',
    });
  });

  it('soft-succeeds (still logs) when no backend is configured', async () => {
    getSupabase.mockReturnValue(null);
    const { result } = renderHook(() => useSessionFeedback());
    await act(async () => {
      await result.current.submitFeedback({ realism: 5, aiQuality: 5, comfort: 5 });
    });
    expect(result.current.status).toBe('done');
    expect(logEvent).toHaveBeenCalledOnce();
    expect(insert).not.toHaveBeenCalled();
  });

  it('reports an error when the insert fails', async () => {
    insert.mockResolvedValue({ error: new Error('rls') });
    getSupabase.mockReturnValue({
      auth: { getUser: async () => ({ data: { user: null } }) },
      from: () => ({ insert }),
    });
    const { result } = renderHook(() => useSessionFeedback());
    await act(async () => {
      await result.current.submitFeedback({ realism: 1, aiQuality: 1, comfort: 1 });
    });
    expect(result.current.status).toBe('error');
  });
});
