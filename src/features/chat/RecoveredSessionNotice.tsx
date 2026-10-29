import { useEffect, useState } from 'react';
import { Glass } from '../../design-system/Glass';
import { Icon } from '../../design-system/Icon';
import { useNavigation } from '../../app/providers/NavigationProvider';
import { readStorage, removeStorage } from '../../lib/storage';
import { setSelectedSessionId } from '../../lib/selectedSession';
import { useT } from '../../i18n/useT';
import { RECOVERED_NOTICE_KEY, type RecoveredNotice } from './sessionCheckpoint';

/** Fired by `SessionRecoveryRunner` when a recovery finishes while the app is open. */
export const SESSION_RECOVERED_EVENT = 'pbt:session-recovered';

/**
 * Home's one-time note that an interrupted session was saved and scored
 * (`recoverPendingSession`). The trainee who ran out of time, lost the
 * connection or closed the tab gets their score instead of nothing.
 */
export function RecoveredSessionNotice() {
  const t = useT();
  const { go } = useNavigation();
  const [notice, setNotice] = useState<RecoveredNotice | null>(() => readStorage(RECOVERED_NOTICE_KEY));

  useEffect(() => {
    const refresh = () => setNotice(readStorage(RECOVERED_NOTICE_KEY));
    window.addEventListener(SESSION_RECOVERED_EVENT, refresh);
    return () => window.removeEventListener(SESSION_RECOVERED_EVENT, refresh);
  }, []);

  if (!notice) return null;
  const dismiss = () => {
    removeStorage(RECOVERED_NOTICE_KEY.key);
    setNotice(null);
  };

  return (
    <div role="status" aria-live="polite" style={{ marginBottom: 14 }}>
      <Glass radius={20} padding="14px 16px">
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--pbt-text)', marginBottom: 4 }}>
              {t('chat.recovered.title')}
            </div>
            <div style={{ fontSize: 13, lineHeight: 1.45, color: 'var(--pbt-text-muted)' }}>
              {t('chat.recovered.body', { score: String(Math.round(notice.overall)) })}
            </div>
            <button
              type="button"
              onClick={() => {
                setSelectedSessionId(notice.sessionId);
                dismiss();
                go('historyDetail');
              }}
              style={{
                marginTop: 10,
                padding: '6px 14px',
                borderRadius: 9999,
                border: 'none',
                cursor: 'pointer',
                background: 'linear-gradient(180deg, var(--pbt-driver-primary), var(--pbt-driver-accent))',
                color: '#fff',
                fontFamily: 'var(--pbt-font-mono)',
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: '0.10em',
                textTransform: 'uppercase',
              }}
            >
              {t('chat.recovered.view')}
            </button>
          </div>
          <button
            type="button"
            onClick={dismiss}
            aria-label={t('chat.recovered.dismiss')}
            style={{
              border: 'none',
              background: 'transparent',
              color: 'var(--pbt-text-muted)',
              cursor: 'pointer',
              padding: 4,
              display: 'inline-flex',
            }}
          >
            <Icon.close />
          </button>
        </div>
      </Glass>
    </div>
  );
}
