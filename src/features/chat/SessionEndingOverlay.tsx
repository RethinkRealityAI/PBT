import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Orb } from '../../design-system/Orb';
import type { DriverKey } from '../../design-system/tokens';

/**
 * Beautiful "session is wrapping up" overlay shown between the AI's closing
 * line and the scorecard. Three jobs:
 *
 *   1. Make it visually obvious the simulation has ended — no more typing.
 *   2. Cover the latency of the scorer API call (typically 2–5s) so the
 *      transition to the scorecard feels intentional, not laggy.
 *   3. Match the design system — soft halos, the same Orb the rest of the
 *      app uses, driver-tinted glass.
 *
 * Rendered inside ChatScreen and controlled by useTextChat's status:
 * appears on `ending` + `scoring` + `complete`, exits when ChatScreen
 * navigates to stats.
 */
export interface SessionEndingOverlayProps {
  /** Whether the overlay is visible. */
  open: boolean;
  /**
   * Phase tracker for copy.
   *  - 'closing'   AI just delivered its final line; we're holding for read.
   *  - 'analyzing' Scorer API call is in flight.
   *  - 'ready'     Scorecard is in hand; navigation is about to fire.
   */
  phase: 'closing' | 'analyzing' | 'ready';
  /** Driver tint to colour the orb / accents. */
  driver: DriverKey;
}

const COPY: Record<SessionEndingOverlayProps['phase'], { eyebrow: string; title: string; sub: string }> = {
  closing: {
    eyebrow: 'Session complete',
    title: 'Wrapping up the conversation',
    sub: 'Holding for a beat so the closing line lands…',
  },
  analyzing: {
    eyebrow: 'Analyzing your performance',
    title: 'Building your scorecard',
    sub: 'Scoring empathy, listening, knowledge, objection handling, confidence, closing, and pacing.',
  },
  ready: {
    eyebrow: 'Done',
    title: 'Your scorecard is ready',
    sub: 'Opening it now…',
  },
};

export function SessionEndingOverlay({
  open,
  phase,
  driver,
}: SessionEndingOverlayProps) {
  const reduceMotion = useReducedMotion();
  const copy = COPY[phase];

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="session-ending"
          role="status"
          aria-live="polite"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduceMotion ? 0 : 0.32, ease: [0.22, 1, 0.36, 1] }}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 70,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 24,
            // Layered backdrop — driver-tinted halos behind a translucent
            // frosted pane so the chat that was underneath stays as a
            // soft suggestion, not a hard cut.
            background: `
              radial-gradient(60% 60% at 50% 28%, color-mix(in oklab, var(--pbt-driver-primary) 24%, transparent), transparent 70%),
              radial-gradient(40% 40% at 50% 78%, color-mix(in oklab, var(--pbt-driver-accent) 18%, transparent), transparent 75%),
              rgba(10, 5, 8, 0.35)
            `,
            backdropFilter: 'blur(22px) saturate(180%)',
            WebkitBackdropFilter: 'blur(22px) saturate(180%)',
          }}
        >
          {/* Concentric ripples — same vocabulary as the onboarding orb */}
          {!reduceMotion &&
            [0, 1, 2].map((i) => (
              <motion.div
                key={i}
                aria-hidden
                style={{
                  position: 'absolute',
                  width: 220,
                  height: 220,
                  borderRadius: '50%',
                  border: '1.5px solid color-mix(in oklab, var(--pbt-driver-primary) 55%, transparent)',
                  pointerEvents: 'none',
                  willChange: 'transform, opacity',
                }}
                initial={{ scale: 1, opacity: 0 }}
                animate={{ scale: [1, 2.4], opacity: [0, 0.32, 0.16, 0.04, 0] }}
                transition={{
                  duration: 4.2,
                  repeat: Infinity,
                  delay: i * 1.2,
                  ease: [0.22, 0.61, 0.36, 1],
                }}
              />
            ))}

          <motion.div
            initial={{ y: 16, scale: 0.96, opacity: 0 }}
            animate={{ y: 0, scale: 1, opacity: 1 }}
            exit={{ y: 8, scale: 0.98, opacity: 0 }}
            transition={{
              duration: reduceMotion ? 0 : 0.5,
              ease: [0.2, 0.8, 0.2, 1],
              delay: reduceMotion ? 0 : 0.05,
            }}
            style={{
              position: 'relative',
              maxWidth: 460,
              width: '100%',
              padding: '32px 28px 28px',
              borderRadius: 28,
              textAlign: 'center',
              background:
                'linear-gradient(165deg, rgba(255,255,255,0.78) 0%, rgba(255,255,255,0.46) 100%)',
              backdropFilter: 'blur(36px) saturate(220%) brightness(1.02)',
              WebkitBackdropFilter: 'blur(36px) saturate(220%) brightness(1.02)',
              border: '1px solid var(--pbt-glass-border)',
              boxShadow: [
                '0 1px 0 rgba(255,255,255,0.95) inset',
                '0 -1px 0 rgba(255,255,255,0.45) inset',
                '0 28px 60px -22px color-mix(in oklab, var(--pbt-driver-primary) 28%, rgba(20,5,8,0.45))',
                '0 60px 110px -40px rgba(20,5,8,0.45)',
              ].join(', '),
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'center',
                marginBottom: 18,
              }}
            >
              <Orb size={104} driver={driver} pulse />
            </div>

            <div
              style={{
                fontFamily: 'var(--pbt-font-mono)',
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: '0.18em',
                textTransform: 'uppercase',
                color: 'var(--pbt-driver-primary)',
              }}
            >
              {copy.eyebrow}
            </div>

            <h2
              style={{
                margin: '8px 0 10px',
                fontSize: 26,
                fontWeight: 400,
                letterSpacing: '-0.025em',
                lineHeight: 1.15,
                color: 'var(--pbt-text)',
              }}
            >
              {copy.title}
            </h2>
            <p
              style={{
                margin: '0 auto',
                maxWidth: 360,
                fontSize: 14,
                lineHeight: 1.55,
                color: 'var(--pbt-text-muted)',
                textWrap: 'pretty' as never,
              }}
            >
              {copy.sub}
            </p>

            {phase !== 'ready' && (
              <div
                aria-hidden
                style={{
                  marginTop: 22,
                  display: 'inline-flex',
                  gap: 6,
                }}
              >
                {[0, 1, 2].map((i) => (
                  <motion.span
                    key={i}
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: 9999,
                      background: 'var(--pbt-driver-primary)',
                    }}
                    animate={{ opacity: [0.25, 1, 0.25], y: [0, -3, 0] }}
                    transition={{
                      duration: 1.1,
                      repeat: Infinity,
                      delay: i * 0.18,
                      ease: 'easeInOut',
                    }}
                  />
                ))}
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
