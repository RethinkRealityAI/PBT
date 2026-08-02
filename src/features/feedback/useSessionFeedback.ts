import { useCallback, useState } from 'react';
import { getSupabase } from '../auth/supabaseClient';
import { logEvent } from '../../lib/analytics';
import { getOrCreateSessionId, readStorage, writeStorage, STORAGE_KEYS } from '../../lib/storage';

/** Most rated-session ids we keep locally (oldest entries fall off the front). */
export const RATED_SESSIONS_CAP = 100;

/** Has this session already been rated on this device? */
export function isSessionRated(sessionId?: string | null): boolean {
  if (!sessionId) return false;
  return readStorage(STORAGE_KEYS.ratedSessionIds).includes(sessionId);
}

/**
 * Remember that `sessionId` was rated. Idempotent (deduped) and capped at
 * {@link RATED_SESSIONS_CAP}, newest last.
 */
export function markSessionRated(sessionId?: string | null): void {
  if (!sessionId) return;
  const existing = readStorage(STORAGE_KEYS.ratedSessionIds);
  const next = [...existing.filter((id) => id !== sessionId), sessionId];
  writeStorage(
    STORAGE_KEYS.ratedSessionIds,
    next.length > RATED_SESSIONS_CAP ? next.slice(next.length - RATED_SESSIONS_CAP) : next,
  );
}

/**
 * Simulation Feedback Tool — "rate the session".
 *
 * Persists a post-session rating across the three SOW-supplied dimensions
 * (scenario realism, AI response quality, user comfort) plus an optional
 * comment. Anonymous-safe: rows attribute via the anon session id when the
 * user isn't signed in, mirroring nav_events.
 */
export interface SessionFeedbackInput {
  /** training_sessions.id when known (nullable for anonymous runs). */
  sessionId?: string | null;
  /** 1–5 each. */
  realism: number;
  aiQuality: number;
  comfort: number;
  comment?: string;
  scenarioSummary?: string;
  pushbackId?: string;
}

export type FeedbackStatus = 'idle' | 'submitting' | 'done' | 'error';

export function useSessionFeedback() {
  const [status, setStatus] = useState<FeedbackStatus>('idle');

  const submitFeedback = useCallback(async (input: SessionFeedbackInput) => {
    setStatus('submitting');
    logEvent({
      type: 'custom',
      screen: 'stats',
      target: 'session_feedback',
      meta: {
        sessionId: input.sessionId ?? null,
        realism: input.realism,
        ai_quality: input.aiQuality,
        comfort: input.comfort,
        has_comment: !!input.comment?.trim(),
      },
    });

    const sb = getSupabase();
    if (!sb) {
      // No backend configured — the analytics event above still fired, so
      // treat it as a soft success rather than blocking the user.
      markSessionRated(input.sessionId);
      setStatus('done');
      return true;
    }
    try {
      const {
        data: { user },
      } = await sb.auth.getUser().catch(() => ({ data: { user: null } }));
      const { error } = await sb.from('session_feedback').insert({
        session_id: input.sessionId ?? null,
        user_id: user?.id ?? null,
        anon_session_id: getOrCreateSessionId(),
        realism: input.realism,
        ai_quality: input.aiQuality,
        comfort: input.comfort,
        comment: input.comment?.trim() || null,
        scenario_summary: input.scenarioSummary ?? null,
        pushback_id: input.pushbackId ?? null,
      });
      if (error) throw error;
      markSessionRated(input.sessionId);
      setStatus('done');
      return true;
    } catch (err) {
      console.warn('[useSessionFeedback] submit failed', err);
      setStatus('error');
      return false;
    }
  }, []);

  return { status, submitFeedback };
}
