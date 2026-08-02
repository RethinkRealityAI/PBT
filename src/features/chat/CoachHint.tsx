import { useCallback, useEffect, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Glass } from '../../design-system/Glass';
import { Icon } from '../../design-system/Icon';
import { generateCoachHint } from '../../services/geminiService';
import type { ChatMessage } from '../../services/types';
import type { Scenario } from '../../data/scenarios';
import type { SimulationConfig } from '../../data/knowledge/simulationConfig';
import { logEvent } from '../../lib/analytics';
import { useT } from '../../i18n/useT';

/**
 * In-chat coach: a discreet, capped "give me a nudge" affordance for text
 * simulations. The coach reads the live transcript and returns one short
 * ACT-guided nudge for the trainee's NEXT reply — teaching the skill without
 * writing the line for them. Hints are deliberately scarce (3 per session)
 * so trainees reach for them at genuine sticking points rather than leaning
 * on the coach every turn.
 */

export const MAX_COACH_HINTS = 3;

export type CoachStatus = 'idle' | 'loading' | 'error';

export interface UseCoachHint {
  open: boolean;
  status: CoachStatus;
  hint: string | null;
  /** Successful hints consumed this session. */
  used: number;
  remaining: number;
  request: () => void;
  dismiss: () => void;
}

export function useCoachHint(args: {
  scenario: Scenario | null;
  messages: ChatMessage[];
  sessionId: string | null;
  config?: SimulationConfig;
}): UseCoachHint {
  const { scenario, messages, sessionId, config } = args;
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<CoachStatus>('idle');
  const [hint, setHint] = useState<string | null>(null);
  const [used, setUsed] = useState(0);

  // A restart / new session allocates a fresh id — reset the budget.
  useEffect(() => {
    setOpen(false);
    setStatus('idle');
    setHint(null);
    setUsed(0);
  }, [sessionId]);

  const request = useCallback(() => {
    if (!scenario || status === 'loading') return;
    if (used >= MAX_COACH_HINTS) return;
    setOpen(true);
    setStatus('loading');
    setHint(null);
    logEvent({
      type: 'custom',
      screen: 'chat',
      target: 'coach_hint_request',
      meta: { sessionId, turn: messages.length },
    });
    void generateCoachHint(scenario, messages, { sessionId, config })
      .then((text) => {
        setHint(text);
        setStatus('idle');
        setUsed((n) => n + 1);
      })
      .catch(() => {
        // Failed hints don't burn the budget.
        setStatus('error');
      });
  }, [scenario, status, used, messages, sessionId, config]);

  const dismiss = useCallback(() => {
    setOpen(false);
    setStatus('idle');
  }, []);

  return {
    open,
    status,
    hint,
    used,
    remaining: Math.max(0, MAX_COACH_HINTS - used),
    request,
    dismiss,
  };
}

/** The nudge card — rendered in flow above the session controls. */
export function CoachHintPanel({ coach }: { coach: UseCoachHint }) {
  const reduceMotion = useReducedMotion();
  const t = useT();
  return (
    <AnimatePresence>
      {coach.open && (
        <motion.div
          key="coach-hint"
          initial={reduceMotion ? false : { opacity: 0, y: 10, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 6, scale: 0.98 }}
          transition={{ duration: reduceMotion ? 0 : 0.28, ease: [0.22, 1, 0.36, 1] }}
          // Clearance for the floating Coach / Scenario-info triggers, which
          // are absolutely anchored 16px above the session controls — without
          // this the panel flows into that zone and the triggers bleed
          // through the card.
          style={{ marginBottom: 46 }}
        >
          <Glass
            radius={20}
            padding={14}
            glow="var(--pbt-driver-primary)"
            style={{
              borderColor:
                'color-mix(in oklab, var(--pbt-driver-primary) 36%, var(--pbt-glass-border))',
            }}
          >
            <div className="flex items-start gap-3">
              <div
                aria-hidden
                style={{
                  flexShrink: 0,
                  width: 30,
                  height: 30,
                  borderRadius: '50%',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#fff',
                  background:
                    'linear-gradient(180deg, var(--pbt-driver-primary), var(--pbt-driver-accent))',
                  boxShadow:
                    '0 6px 14px -6px color-mix(in oklab, var(--pbt-driver-primary) 55%, transparent)',
                }}
              >
                <Icon.spark style={{ width: 16, height: 16 }} />
              </div>
              <div className="min-w-0 flex-1">
                <div
                  style={{
                    fontFamily: 'var(--pbt-font-mono)',
                    fontSize: 9,
                    fontWeight: 700,
                    letterSpacing: '0.18em',
                    textTransform: 'uppercase',
                    color: 'var(--pbt-driver-primary)',
                    marginBottom: 4,
                  }}
                >
                  {coach.status === 'loading'
                    ? t('chat.coach.thinking')
                    : coach.status === 'error'
                      ? t('chat.coach.unavailable')
                      : t('chat.coach.hintCount', {
                          used: coach.used,
                          max: MAX_COACH_HINTS,
                        })}
                </div>
                {coach.status === 'loading' ? (
                  <div aria-hidden style={{ display: 'inline-flex', gap: 5, padding: '4px 0' }}>
                    {[0, 1, 2].map((i) => (
                      <span
                        key={i}
                        style={{
                          width: 6,
                          height: 6,
                          borderRadius: '50%',
                          background: 'var(--pbt-driver-primary)',
                          animation: `pbtTypingDot 1.4s ${i * 0.2}s infinite`,
                          display: 'inline-block',
                        }}
                      />
                    ))}
                  </div>
                ) : coach.status === 'error' ? (
                  <div style={{ fontSize: 13, lineHeight: 1.5, color: 'var(--pbt-text-muted)' }}>
                    {t('chat.coach.errorBody')}
                  </div>
                ) : (
                  <div
                    role="status"
                    aria-live="polite"
                    style={{ fontSize: 13.5, lineHeight: 1.5, color: 'var(--pbt-text)' }}
                  >
                    {coach.hint}
                  </div>
                )}
              </div>
              <button
                type="button"
                aria-label={t('chat.coach.dismiss')}
                onClick={coach.dismiss}
                style={{
                  flexShrink: 0,
                  width: 26,
                  height: 26,
                  borderRadius: '50%',
                  border: '1px solid var(--pbt-glass-border)',
                  background: 'transparent',
                  color: 'var(--pbt-text-muted)',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Icon.close style={{ width: 13, height: 13 }} />
              </button>
            </div>
          </Glass>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** The "Coach" trigger — mirrors the Scenario-info affordance visually. */
export function CoachHintButton({
  coach,
  disabled,
}: {
  coach: UseCoachHint;
  disabled: boolean;
}) {
  const t = useT();
  const exhausted = coach.remaining === 0;
  const inert = disabled || exhausted || coach.status === 'loading';
  return (
    <div
      role="button"
      tabIndex={inert ? -1 : 0}
      aria-label={
        exhausted
          ? t('chat.coach.exhaustedAria')
          : t('chat.coach.requestAria', { count: coach.remaining })
      }
      aria-disabled={inert}
      className="flex items-center gap-2"
      style={{ cursor: inert ? 'default' : 'pointer', opacity: inert ? 0.45 : 1 }}
      onClick={() => {
        if (inert) return;
        if (coach.open && coach.status !== 'error') {
          coach.dismiss();
          return;
        }
        coach.request();
      }}
      onKeyDown={(e) => {
        if (inert) return;
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          coach.request();
        }
      }}
    >
      <span
        style={{
          width: 34,
          height: 34,
          borderRadius: '50%',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--pbt-driver-primary)',
          flexShrink: 0,
          border:
            '1px solid color-mix(in oklab, var(--pbt-driver-primary) 42%, rgba(255,255,255,0.5))',
          background: 'rgba(255,255,255,0.16)',
          backdropFilter: 'blur(12px) saturate(240%)',
          WebkitBackdropFilter: 'blur(12px) saturate(240%)',
          boxShadow:
            'inset 0 1px 0 rgba(255,255,255,0.58), 0 8px 16px -10px rgba(15,14,20,0.12)',
        }}
      >
        <Icon.spark style={{ width: 18, height: 18 }} aria-hidden />
      </span>
      <span
        style={{
          fontSize: 9,
          letterSpacing: '0.04em',
          fontWeight: 500,
          color: 'var(--pbt-text-muted)',
          whiteSpace: 'nowrap',
          userSelect: 'none',
        }}
      >
        {exhausted
          ? t('chat.coach.exhausted')
          : t('chat.coach.label', { count: coach.remaining })}
      </span>
    </div>
  );
}
