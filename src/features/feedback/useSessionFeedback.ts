import { useCallback, useState } from 'react';
import { getSupabase } from '../auth/supabaseClient';
import { logEvent } from '../../lib/analytics';
import { getOrCreateSessionId } from '../../lib/storage';

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
