import { useEffect, useState } from 'react';
import { Glass } from '../../design-system/Glass';
import { PillButton } from '../../design-system/PillButton';
import { Icon } from '../../design-system/Icon';
import { Segmented } from '../../design-system/Segmented';
import { useTheme } from '../../app/providers/ThemeProvider';
import { usePlatformReport, type ReportKind } from './usePlatformReport';

/**
 * Themed modal surface fill. Light = bright top-left catchlight gradient (the
 * frosted look). Dark = a deep gradient so near-white `--pbt-text` reads with
 * full contrast instead of blending into a forced-light pane. See the dark-mode
 * contrast note in CLAUDE.md ("Modals & overlays").
 */
const MODAL_FILL_DARK =
  'linear-gradient(165deg, rgba(20,18,26,0.80) 0%, rgba(12,11,17,0.60) 100%)';
const MODAL_FILL_LIGHT =
  'linear-gradient(165deg, rgba(255,255,255,0.62) 0%, rgba(255,255,255,0.30) 100%)';

const BUG_SUBJECTS = [
  'Feature not working',
  'AI not responding',
  'Voice mode issue',
  'Button not working',
  'App crashes / glitches',
  'Scoring issue',
  'Other',
] as const;

const SUGGESTION_SUBJECTS = [
  'New feature idea',
  'UI improvement',
  'Content request',
  'Better AI responses',
  'Accessibility',
  'Other',
] as const;

export function ReportModal({
  open,
  initialKind = 'bug',
  screen,
  onClose,
}: {
  open: boolean;
  initialKind?: ReportKind;
  screen?: string;
  onClose: () => void;
}) {
  const { status, submitReport, reset } = usePlatformReport();
  const { resolvedTheme } = useTheme();
  const dark = resolvedTheme === 'dark';
  const [kind, setKind] = useState<ReportKind>(initialKind);
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (open) {
      setKind(initialKind);
      setSubject('');
      setMessage('');
      reset();
    }
  }, [open, initialKind, reset]);

  if (!open) return null;

  const subjects = kind === 'bug' ? BUG_SUBJECTS : SUGGESTION_SUBJECTS;
  const canSubmit = message.trim().length > 0 && status !== 'submitting';

  const handleSubmit = () => {
    const prefixed = subject
      ? `[${subject}]\n\n${message}`
      : message;
    void submitReport({ kind, message: prefixed, screen });
  };

  const pillBase: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '5px 12px',
    borderRadius: 100,
    fontSize: 12,
    fontWeight: 500,
    cursor: 'pointer',
    border: '1px solid rgba(0,0,0,0.1)',
    transition: 'all 0.15s',
    whiteSpace: 'nowrap' as const,
  };

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
        glow="var(--pbt-driver-primary)"
        backdropSaturatePct={235}
        style={{
          maxWidth: 520,
          width: '100%',
          background: dark ? MODAL_FILL_DARK : MODAL_FILL_LIGHT,
        }}
      >
        <div style={{ padding: 26 }} onClick={(e) => e.stopPropagation()}>
          {/* Header */}
          <div className="flex items-start justify-between" style={{ marginBottom: 16 }}>
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
                background: dark ? 'rgba(255,255,255,0.10)' : 'rgba(60,20,15,0.06)',
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
              <p style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--pbt-text)', marginTop: 0, marginBottom: 20 }}>
                Your {kind === 'bug' ? 'report' : 'suggestion'} reached our
                triage queue. We read every one.
              </p>
              <PillButton fullWidth onClick={onClose}>
                Done
              </PillButton>
            </div>
          ) : (
            <>
              {/* Kind toggle */}
              <div style={{ marginBottom: 16 }}>
                <Segmented
                  value={kind}
                  onChange={(v) => { setKind(v as ReportKind); setSubject(''); }}
                  ariaLabel="Report type"
                  options={[
                    { value: 'bug', label: 'Bug report' },
                    { value: 'suggestion', label: 'Suggestion' },
                  ]}
                />
              </div>

              {/* Subject pills */}
              <div style={{ marginBottom: 14 }}>
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    letterSpacing: '0.1em',
                    textTransform: 'uppercase',
                    color: 'var(--pbt-text-muted)',
                    marginBottom: 8,
                  }}
                >
                  Quick subject
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {subjects.map((s) => {
                    const selected = subject === s;
                    return (
                      <button
                        key={s}
                        onClick={() => setSubject(selected ? '' : s)}
                        style={{
                          ...pillBase,
                          background: selected
                            ? 'var(--pbt-driver-primary)'
                            : dark
                              ? 'rgba(255,255,255,0.08)'
                              : 'rgba(255,255,255,0.45)',
                          color: selected ? '#fff' : 'var(--pbt-text)',
                          border: selected
                            ? '1px solid transparent'
                            : dark
                              ? '1px solid rgba(255,255,255,0.18)'
                              : '1px solid rgba(0,0,0,0.1)',
                          boxShadow: selected
                            ? '0 2px 8px -2px color-mix(in oklab, var(--pbt-driver-primary) 40%, transparent)'
                            : 'none',
                        }}
                      >
                        {s}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Message textarea */}
              <div style={{ marginBottom: 4 }}>
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    letterSpacing: '0.1em',
                    textTransform: 'uppercase',
                    color: 'var(--pbt-text-muted)',
                    marginBottom: 8,
                  }}
                >
                  {kind === 'bug' ? 'What happened?' : 'Your idea'}
                </div>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder={
                    kind === 'bug'
                      ? 'What happened? What did you expect instead?'
                      : 'What would make this better? Any details help.'
                  }
                  rows={6}
                  autoFocus
                  className="pbt-glass-input"
                  style={{
                    fontSize: 15,
                    lineHeight: 1.55,
                    resize: 'vertical',
                    minHeight: 130,
                  }}
                />
                <div style={{ textAlign: 'right', fontSize: 11, color: 'var(--pbt-text-muted)', marginTop: 4 }}>
                  {message.trim().length} chars
                </div>
              </div>

              {status === 'error' && (
                <div style={{ marginBottom: 10, fontSize: 12.5, color: 'oklch(0.52 0.18 25)' }}>
                  {message.trim().length === 0
                    ? 'Add a short description first.'
                    : "Couldn't send that — tap submit to try again."}
                </div>
              )}

              <PillButton
                fullWidth
                disabled={!canSubmit}
                onClick={handleSubmit}
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
