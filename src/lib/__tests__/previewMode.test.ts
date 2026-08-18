/**
 * Admin "Test in app" preview mode.
 *
 * Two things are guarded here:
 *   1. The run store — the channel that carries the builder's requested mode
 *      into ChatScreen and restarts an already-open chat on re-run.
 *   2. The telemetry / persistence gates. A preview run makes REAL AI calls
 *      (that is the point of testing a prompt) but must leave no trace: no
 *      nav_events, no ai_call_telemetry, no rag_documents. Those gates are one
 *      `isPreviewMode()` line each and are exactly the kind of thing a later
 *      refactor deletes silently, so they are asserted at the emitter.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  __resetPreviewRuns,
  getPreviewRun,
  isPreviewMode,
  startPreviewRun,
  subscribePreviewRun,
} from '../previewMode';

/** jsdom won't let us assign location.search; replace the whole object. */
function setSearch(search: string): void {
  const url = new URL(window.location.href);
  url.search = search;
  window.history.replaceState({}, '', url.toString());
}

beforeEach(() => {
  __resetPreviewRuns();
  setSearch('');
});

afterEach(() => {
  setSearch('');
  vi.restoreAllMocks();
});

describe('isPreviewMode', () => {
  it('is false for a normal app load', () => {
    expect(isPreviewMode()).toBe(false);
  });

  it('is true when the preview param is present, with or without a value', () => {
    setSearch('?pbt_preview=1');
    expect(isPreviewMode()).toBe(true);
    setSearch('?pbt_preview');
    expect(isPreviewMode()).toBe(true);
  });

  it('is not fooled by a lookalike param', () => {
    setSearch('?pbt_preview_mode=1');
    expect(isPreviewMode()).toBe(false);
  });
});

describe('preview run store', () => {
  it('starts with no run', () => {
    expect(getPreviewRun()).toBeNull();
  });

  it('carries the requested mode and bumps the run id each time', () => {
    expect(startPreviewRun('text')).toEqual({ runId: 1, mode: 'text' });
    expect(startPreviewRun('voice')).toEqual({ runId: 2, mode: 'voice' });
    // A re-run in the SAME mode still gets a new id — that is what tells
    // ChatScreen to tear the current session down and restart on the new draft.
    expect(startPreviewRun('voice').runId).toBe(3);
    expect(getPreviewRun()).toEqual({ runId: 3, mode: 'voice' });
  });

  it('notifies subscribers and stops after unsubscribe', () => {
    const seen: Array<number | undefined> = [];
    const unsubscribe = subscribePreviewRun(() => seen.push(getPreviewRun()?.runId));
    startPreviewRun('text');
    startPreviewRun('voice');
    unsubscribe();
    startPreviewRun('text');
    expect(seen).toEqual([1, 2]);
  });

  it('keeps a stable snapshot reference between runs (useSyncExternalStore safety)', () => {
    startPreviewRun('text');
    expect(getPreviewRun()).toBe(getPreviewRun());
  });
});

describe('preview mode suppresses telemetry + persistence', () => {
  it('logEvent writes nothing while previewing', async () => {
    const { logEvent } = await import('../analytics');
    const dispatch = vi.spyOn(window, 'dispatchEvent');

    logEvent({ type: 'screen_view', screen: 'chat' });
    expect(dispatch).toHaveBeenCalled();

    dispatch.mockClear();
    setSearch('?pbt_preview=1');
    logEvent({ type: 'screen_view', screen: 'chat' });
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('AI call + turn telemetry never reach Supabase while previewing', async () => {
    const { recordCall, recordTurns } = await import('../../services/aiTelemetry');
    const supabase = await import('../../features/auth/supabaseClient');
    const getSupabase = vi.spyOn(supabase, 'getSupabase');

    // Positive control: outside preview these DO reach for the client, so a
    // spy that failed to intercept would fail here rather than pass silently.
    await recordCall({ callType: 'roleplay', modelId: 'gemini-3-flash-preview', latencyMs: 10 });
    await recordTurns([{ sessionId: 's1', turnIdx: 0, role: 'user', textLen: 5 }]);
    expect(getSupabase).toHaveBeenCalled();

    getSupabase.mockClear();
    setSearch('?pbt_preview=1');
    await recordCall({ callType: 'roleplay', modelId: 'gemini-3-flash-preview', latencyMs: 10 });
    await recordTurns([{ sessionId: 's1', turnIdx: 0, role: 'user', textLen: 5 }]);

    // The gate must fire BEFORE the client is even resolved.
    expect(getSupabase).not.toHaveBeenCalled();
  });

  it('rag_documents are not written while previewing', async () => {
    const { persistRagDocument } = await import('../../services/ragDocument');
    const supabase = await import('../../features/auth/supabaseClient');
    const getSupabase = vi.spyOn(supabase, 'getSupabase');
    const args = {
      sessionId: 'sess-preview',
      scenario: (await import('../../data/scenarios')).LIBRARY_SCENARIOS[0],
      transcript: [{ role: 'ai' as const, text: 'hello', timestamp: 0 }],
      scoreReport: null,
      durationSeconds: 12,
      mode: 'text' as const,
      modelId: 'gemini-3-flash-preview',
      completed: true,
    };

    // Positive control (see above).
    await persistRagDocument(args);
    expect(getSupabase).toHaveBeenCalled();

    getSupabase.mockClear();
    setSearch('?pbt_preview=1');
    await persistRagDocument(args);
    expect(getSupabase).not.toHaveBeenCalled();
  });
});
