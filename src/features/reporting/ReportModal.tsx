import { useEffect, useState } from 'react';
import { Glass } from '../../design-system/Glass';
import { PillButton } from '../../design-system/PillButton';
import { Icon } from '../../design-system/Icon';
import { Segmented } from '../../design-system/Segmented';
import { useTheme } from '../../app/providers/ThemeProvider';
import { usePlatformReport, type ReportKind } from './usePlatformReport';
import { useT } from '../../i18n/useT';
import { useDialog } from '../../lib/useDialog';
import type { CatalogKey } from '../../i18n/catalog';

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

/**
 * Quick-subject chips. `id` is the STABLE ENGLISH string that gets prefixed
 * onto the stored report body — keeping it locale-independent means the admin
 * triage queue reads consistently no matter which language the reporter used.
 * Only `key` (the visible label) is localised.
 */
interface Subject {
  id: string;
  key: CatalogKey;
}

const BUG_SUBJECTS: Subject[] = [
  { id: 'Feature not working', key: 'report.subject.featureNotWorking' },
  { id: 'AI not responding', key: 'report.subject.aiNotResponding' },
  { id: 'Voice mode issue', key: 'report.subject.voiceMode' },
  { id: 'Button not working', key: 'report.subject.buttonNotWorking' },
  { id: 'App crashes / glitches', key: 'report.subject.crashes' },
  { id: 'Scoring issue', key: 'report.subject.scoring' },
  { id: 'Other', key: 'report.subject.other' },
];

const SUGGESTION_SUBJECTS: Subject[] = [
  { id: 'New feature idea', key: 'report.subject.newFeature' },
  { id: 'UI improvement', key: 'report.subject.ui' },
  { id: 'Content request', key: 'report.subject.content' },
  { id: 'Better AI responses', key: 'report.subject.betterAi' },
  { id: 'Accessibility', key: 'report.subject.accessibility' },
  { id: 'Other', key: 'report.subject.other' },
];

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
  // The dialog body only exists while it is open, so its focus/Escape wiring is
  // bound on open and torn down on close — and the form starts empty each time.
  if (!open) return null;
  return <ReportDialog initialKind={initialKind} screen={screen} onClose={onClose} />;
}

function ReportDialog({
  initialKind,
  screen,
  onClose,
}: {
  initialKind: ReportKind;
  screen?: string;
  onClose: () => void;
}) {
  const { status, submitReport } = usePlatformReport();
  const t = useT();
  const { resolvedTheme } = useTheme();
  const dark = resolvedTheme === 'dark';
  const [kind, setKind] = useState<ReportKind>(initialKind);
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const dialogRef = useDialog<HTMLDivElement>(onClose);

  // Scrolling the page under an open modal is the one part of the dialog
  // contract that lives outside the dialog element itself.
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

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
      ref={dialogRef}
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
                {t('report.eyebrow')}
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
                {status === 'done' ? t('report.title.done') : t('report.title')}
              </h2>
            </div>
            <button
              onClick={onClose}
              aria-label={t('report.close')}
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
                {kind === 'bug' ? t('report.done.bug') : t('report.done.suggestion')}
              </p>
              <PillButton fullWidth onClick={onClose}>
                {t('report.done.cta')}
              </PillButton>
            </div>
          ) : (
            <>
              {/* Kind toggle */}
              <div style={{ marginBottom: 16 }}>
                <Segmented
                  value={kind}
                  onChange={(v) => { setKind(v as ReportKind); setSubject(''); }}
                  ariaLabel={t('report.kind.aria')}
                  options={[
                    { value: 'bug', label: t('report.kind.bug') },
                    { value: 'suggestion', label: t('report.kind.suggestion') },
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
                  {t('report.subject.label')}
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {subjects.map((s) => {
                    const selected = subject === s.id;
                    return (
                      <button
                        key={s.id}
                        onClick={() => setSubject(selected ? '' : s.id)}
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
                        {t(s.key)}
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
                  {kind === 'bug'
                    ? t('report.message.label.bug')
                    : t('report.message.label.suggestion')}
                </div>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder={
                    kind === 'bug'
                      ? t('report.message.placeholder.bug')
                      : t('report.message.placeholder.suggestion')
                  }
                  rows={6}
                  className="pbt-glass-input"
                  style={{
                    fontSize: 15,
                    lineHeight: 1.55,
                    resize: 'vertical',
                    minHeight: 130,
                  }}
                />
                <div style={{ textAlign: 'right', fontSize: 11, color: 'var(--pbt-text-muted)', marginTop: 4 }}>
                  {t('report.charCount', { count: message.trim().length })}
                </div>
              </div>

              {status === 'error' && (
                <div
                  role="alert"
                  style={{
                    marginBottom: 10,
                    fontSize: 12.5,
                    color: 'var(--pbt-score-poor)',
                    padding: '6px 10px',
                    borderRadius: 12,
                    background: 'color-mix(in oklab, var(--pbt-score-poor) 14%, transparent)',
                  }}
                >
                  {message.trim().length === 0
                    ? t('report.error.empty')
                    : t('report.error.send')}
                </div>
              )}

              <PillButton
                fullWidth
                disabled={!canSubmit}
                onClick={handleSubmit}
              >
                {status === 'submitting' ? t('report.submitting') : t('report.submit')}
              </PillButton>
            </>
          )}
        </div>
      </Glass>
    </div>
  );
}
