import { useMemo, useState } from 'react';
import { Glass } from '../../design-system/Glass';
import { PillButton } from '../../design-system/PillButton';
import { Icon } from '../../design-system/Icon';
import { COLORS } from '../../design-system/tokens';
import { useTheme } from '../../app/providers/ThemeProvider';
import { isSessionRated, useSessionFeedback } from './useSessionFeedback';
import { useT } from '../../i18n/useT';
import { isPreviewMode } from '../../lib/previewMode';

const MONO_LABEL: React.CSSProperties = {
  fontFamily: 'var(--pbt-font-mono)',
  fontSize: 10,
  letterSpacing: '0.18em',
  textTransform: 'uppercase',
  color: 'var(--pbt-text-muted)',
};

function StarRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  const { resolvedTheme } = useTheme();
  const t = useT();
  const dark = resolvedTheme === 'dark';
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ ...MONO_LABEL, marginBottom: 6 }}>{label}</div>
      <div role="radiogroup" aria-label={label} style={{ display: 'flex', gap: 6 }}>
        {[1, 2, 3, 4, 5].map((n) => {
          const active = n <= value;
          return (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={value === n}
              aria-label={t('feedback.starAria', { n })}
              onClick={() => onChange(n)}
              style={{
                width: 34,
                height: 34,
                borderRadius: '50%',
                cursor: 'pointer',
                border: active
                  ? `1px solid color-mix(in oklab, var(--pbt-driver-primary) 55%, transparent)`
                  : dark
                    ? '1px solid rgba(255,255,255,0.18)'
                    : '1px solid rgba(255,255,255,0.45)',
                background: active
                  ? 'color-mix(in oklab, var(--pbt-driver-primary) 18%, rgba(255,255,255,0.06))'
                  : dark
                    ? 'rgba(255,255,255,0.06)'
                    : 'rgba(255,255,255,0.22)',
                color: active ? 'var(--pbt-driver-primary)' : 'var(--pbt-text-muted)',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.15s ease',
                fontSize: 16,
                lineHeight: 1,
              }}
            >
              {active ? '★' : '☆'}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Post-session "rate the simulation" card. Surfaces the three SOW dimensions
 * (scenario realism, AI response quality, comfort) + an optional comment.
 * Renders inline at the bottom of the scorecard.
 */
export function SessionFeedbackCard({
  sessionId,
  scenarioSummary,
  pushbackId,
}: {
  sessionId?: string | null;
  scenarioSummary?: string;
  pushbackId?: string;
}) {
  const { status, submitFeedback } = useSessionFeedback();
  const t = useT();
  const [realism, setRealism] = useState(0);
  const [aiQuality, setAiQuality] = useState(0);
  const [comfort, setComfort] = useState(0);
  const [comment, setComment] = useState('');
  // Read once per session id: submitting flips `status`, not this — so the
  // freshly-submitted card keeps rendering the richer "done" state below.
  const alreadyRated = useMemo(() => isSessionRated(sessionId), [sessionId]);

  const canSubmit = realism > 0 && aiQuality > 0 && comfort > 0 && status !== 'submitting';

  // Admin preview: asking the admin to rate their own draft would write a
  // `session_feedback` row against a session that was never really played.
  if (isPreviewMode()) return null;

  if (status === 'done') {
    return (
      <Glass radius={22} padding={18}>
        <div className="flex items-center gap-2">
          <Icon.check />
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--pbt-text)' }}>
            {t('feedback.thanks')}
          </div>
        </div>
      </Glass>
    );
  }

  if (alreadyRated) {
    return (
      <Glass radius={22} padding={14}>
        <div className="flex items-center gap-2">
          <Icon.check />
          <div style={{ fontSize: 13, color: 'var(--pbt-text-muted)' }}>
            {t('feedback.alreadyRated')}
          </div>
        </div>
      </Glass>
    );
  }

  return (
    <Glass radius={22} padding={18}>
      <div style={{ ...MONO_LABEL, marginBottom: 12 }}>{t('feedback.title')}</div>
      <StarRow label={t('feedback.realism')} value={realism} onChange={setRealism} />
      <StarRow label={t('feedback.aiQuality')} value={aiQuality} onChange={setAiQuality} />
      <StarRow label={t('feedback.comfort')} value={comfort} onChange={setComfort} />

      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder={t('feedback.commentPlaceholder')}
        rows={2}
        className="pbt-glass-input"
        style={{
          marginTop: 4,
          marginBottom: 12,
          lineHeight: 1.45,
          resize: 'none',
        }}
      />

      {status === 'error' && (
        <div
          style={{
            marginBottom: 10,
            fontSize: 12.5,
            color: COLORS.score.poor,
          }}
        >
          {t('feedback.error')}
        </div>
      )}

      <PillButton
        fullWidth
        disabled={!canSubmit}
        onClick={() =>
          void submitFeedback({
            sessionId,
            realism,
            aiQuality,
            comfort,
            comment,
            scenarioSummary,
            pushbackId,
          })
        }
      >
        {status === 'submitting' ? t('feedback.submitting') : t('feedback.submit')}
      </PillButton>
    </Glass>
  );
}
