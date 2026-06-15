import { useCallback, useState } from 'react';
import { getSupabase } from '../auth/supabaseClient';
import { logEvent } from '../../lib/analytics';
import { getOrCreateSessionId } from '../../lib/storage';

/**
 * Platform Reporting Tool — structured bug reports + suggestions.
 *
 * Persists to `platform_reports` for admin triage. Anonymous-safe: attributes
 * via the anon session id when the user isn't signed in. Best-effort, with a
 * soft success when no backend is configured so the user always gets
 * acknowledged.
 */
export type ReportKind = 'bug' | 'suggestion';
export type ReportStatus = 'idle' | 'submitting' | 'done' | 'error';

export interface PlatformReportInput {
  kind: ReportKind;
  message: string;
  /** Screen the user was on when they filed (best-effort context). */
  screen?: string;
}

export function usePlatformReport() {
  const [status, setStatus] = useState<ReportStatus>('idle');

  const submitReport = useCallback(async (input: PlatformReportInput) => {
    const message = input.message.trim();
    if (!message) {
      setStatus('error');
      return false;
    }
    setStatus('submitting');
    logEvent({
      type: 'custom',
      screen: input.screen ?? 'settings',
      target: 'platform_report',
      meta: { kind: input.kind, len: message.length },
    });

    const sb = getSupabase();
    if (!sb) {
      setStatus('done');
      return true;
    }
    try {
      const {
        data: { user },
      } = await sb.auth.getUser().catch(() => ({ data: { user: null } }));
      const { error } = await sb.from('platform_reports').insert({
        user_id: user?.id ?? null,
        anon_session_id: getOrCreateSessionId(),
        kind: input.kind,
        message,
        screen: input.screen ?? null,
        user_agent:
          typeof navigator !== 'undefined' ? navigator.userAgent : null,
      });
      if (error) throw error;
      setStatus('done');
      return true;
    } catch (err) {
      console.warn('[usePlatformReport] submit failed', err);
      setStatus('error');
      return false;
    }
  }, []);

  const reset = useCallback(() => setStatus('idle'), []);

  return { status, submitReport, reset };
}
