import { useEffect, useState } from 'react';
import { Glass } from '../../design-system/Glass';
import { PillButton } from '../../design-system/PillButton';
import { Icon } from '../../design-system/Icon';
import { Segmented } from '../../design-system/Segmented';
import { COLORS } from '../../design-system/tokens';
import { usePlatformReport, type ReportKind } from './usePlatformReport';

/**
 * Platform Reporting Tool modal — file a bug or a suggestion. Routed to the
 * admin dashboard via `platform_reports`.
 */
export function ReportModal({
  open,
  initialKind = 'bug',
  screen,
  onClose,
}: {
  open: boolean;
  initialKind?: ReportKind;
  /** Screen the user came from, captured as context. */
  screen?: string;
  onClose: () => void;
}) {
  const { status, submitReport, reset } = usePlatformReport();
  const [kind, setKind] = useState<ReportKind>(initialKind);
  const [message, setMessage] = useState('');

  // Reset to a clean slate whenever the modal (re)opens.
  useEffect(() => {
    if (open) {
      setKind(initialKind);
      setMessage('');
      reset();
    }
  }, [open, initialKind, reset]);

  if (!open) return null;

  const canSubmit = message.trim().length > 0 && status !== 'submitting';

  return (
    <div
      role="dialog"
      aria-modal
      aria-labelledby="pbt-report-title"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(10, 5, 8, 0.18)',
        backdropFilter: 'blur(10px) saturate(180%)',
        WebkitBackdropFilter: 'blur(10px) saturate(180%)',
        padding: 16,
      }}
      onClick={onClose}
    >
      <Glass
        radius={28}
        padding={0}
        glow="oklch(0.62 0.22 22)"
        backdropSaturatePct={235}
        style={{
          maxWidth: 400,
          width: '100%',
          background:
            'linear-gradient(165deg, rgba(255,255,255,0.62) 0%, rgba(255,255,255,0.30) 100%)',
        }}
      >
        <div style={{ padding: 22 }} onClick={(e) => e.stopPropagation()}>
          <div className="flex items-start justify-between" style={{ marginBottom: 14 }}>
            <div>
              <div
                style={{
                  fontFamily: 'var(--pbt-font-mono)',
                  fontSize: 11,
                  letterSpacing: '0.18em',
                  textTransform: 'uppercase',
                  color: 'var(--pbt-text-muted)',
                  marginBottom: 6,
                }}
              >
                Help us improve
              </div>
              <h2
                id="pbt-report-title"
                style={{
                  margin: 0,
                  fontSize: 24,
                  fontWeight: 400,
                  letterSpacing: '-0.025em',
                  lineHeight: 1.1,
                  color: 'var(--pbt-text)',
                }}
              >
                {status === 'done' ? 'Thank you' : 'Report or suggest'}
              </h2>
            </div>
            <button
              onClick={onClose}
              aria-label="Close"
              style={{
                width: 32,
                height: 32,
                borderRadius: '50%',
                border: 'none',
                background: 'rgba(60,20,15,0.06)',
                cursor: 'pointer',
                color: 'var(--pbt-text)',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <Icon.close />
            </button>
          </div>

          {status === 'done' ? (
            <div>
              <p style={{ fontSize: 14, lineHeight: 1.5, color: 'var(--pbt-text)', marginTop: 0 }}>
                Your {kind === 'bug' ? 'report' : 'suggestion'} reached our
                triage queue. We read every one.
              </p>
              <PillButton fullWidth onClick={onClose}>
                Done
              </PillButton>
            </div>
          ) : (
            <>
              <div style={{ marginBottom: 12 }}>
                <Segmented
                  value={kind}
                  onChange={(v) => setKind(v as ReportKind)}
                  ariaLabel="Report type"
                  options={[
                    { value: 'bug', label: 'Bug' },
                    { value: 'suggestion', label: 'Suggestion' },
                  ]}
                />
              </div>

              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder={
                  kind === 'bug'
                    ? 'What happened? What did you expect instead?'
                    : "What would make this better?"
                }
                rows={4}
                autoFocus
                style={{
                  width: '100%',
                  marginBottom: 12,
                  padding: '12px 14px',
                  borderRadius: 16,
                  border: '1px solid rgba(255,255,255,0.5)',
                  background: 'rgba(255,255,255,0.4)',
                  fontFamily: 'inherit',
                  fontSize: 16,
                  lineHeight: 1.45,
                  color: 'var(--pbt-text)',
                  resize: 'none',
                  outline: 'none',
                }}
              />

              {status === 'error' && (
                <div style={{ marginBottom: 10, fontSize: 12.5, color: COLORS.score.poor }}>
                  {message.trim().length === 0
                    ? 'Add a short description first.'
                    : "Couldn't send that — tap submit to try again."}
                </div>
              )}

              <PillButton
                fullWidth
                disabled={!canSubmit}
                onClick={() => void submitReport({ kind, message, screen })}
              >
                {status === 'submitting' ? 'Sending…' : 'Submit'}
              </PillButton>
            </>
          )}
        </div>
      </Glass>
    </div>
  );
}
