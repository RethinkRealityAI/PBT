import { useEffect, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { Icon } from '../../design-system/Icon';
import { useT } from '../../i18n/useT';
import type { CatalogKey } from '../../i18n/catalog';
import { Eyebrow } from './fecalUi';

const STEP_KEYS: CatalogKey[] = [
  'fecalScan.analyzing.step.observe',
  'fecalScan.analyzing.step.retrieve',
  'fecalScan.analyzing.step.match',
];

/** How long each of the first two stages is shown before advancing. */
const STEP_MS = 1200;

export interface ScanProgressProps {
  /**
   * True once the response has landed: every step settles to done. The
   * function is one round trip, so the stepper is time-driven between
   * stages and truthful only at its two ends — it never claims a stage
   * finished after the answer arrived.
   */
  settled?: boolean;
}

/**
 * Observe → retrieve → match, the three stages the `ai-fecal-scan` function
 * runs. Rendered inside the capture modal, on its dark surface (no card). Advances on a timer and holds on the last stage until the response
 * lands, so a slow scan reads as "still matching" rather than as a stalled
 * spinner.
 */
export function ScanProgress({ settled = false }: ScanProgressProps) {
  const t = useT();
  const reduce = useReducedMotion();
  const [active, setActive] = useState(0);

  useEffect(() => {
    if (settled) return;
    if (active >= STEP_KEYS.length - 1) return;
    const id = setTimeout(() => setActive((i) => i + 1), STEP_MS);
    return () => clearTimeout(id);
  }, [active, settled]);

  return (
      <div role="status" aria-live="polite" aria-busy={!settled}>
        <span className="sr-only">
          {settled ? t('fecalScan.analyzing.done') : t('fecalScan.analyzing.aria')}
        </span>
        <Eyebrow accent style={{ marginBottom: 12 }}>
          {t('fecalScan.analyzing.eyebrow')}
        </Eyebrow>

        <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 2 }}>
          {STEP_KEYS.map((key, i) => {
            const done = settled || i < active;
            const current = !settled && i === active;
            return (
              <li
                key={key}
                aria-current={current ? 'step' : undefined}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '9px 0',
                  opacity: done || current ? 1 : 0.42,
                  transition: 'opacity 0.35s ease',
                }}
              >
                <span
                  aria-hidden
                  style={{
                    position: 'relative',
                    width: 22,
                    height: 22,
                    flexShrink: 0,
                    borderRadius: '50%',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: done ? '#fff' : 'var(--pbt-driver-primary)',
                    background: done
                      ? 'linear-gradient(180deg, var(--pbt-driver-primary), var(--pbt-driver-accent))'
                      : 'transparent',
                    border: done
                      ? 'none'
                      : `1.5px solid color-mix(in oklab, var(--pbt-driver-primary) ${current ? 70 : 32}%, transparent)`,
                    transition: 'all 0.3s ease',
                  }}
                >
                  {done ? (
                    <Icon.check style={{ width: 13, height: 13 }} />
                  ) : current ? (
                    <motion.span
                      style={{
                        width: 7,
                        height: 7,
                        borderRadius: '50%',
                        background: 'var(--pbt-driver-primary)',
                      }}
                      animate={reduce ? undefined : { scale: [1, 1.45, 1], opacity: [0.75, 1, 0.75] }}
                      transition={{ duration: 1.1, repeat: Infinity, ease: 'easeInOut' }}
                    />
                  ) : null}
                </span>
                <span
                  style={{
                    fontSize: 13.5,
                    fontWeight: current ? 600 : 400,
                    color: 'var(--pbt-text)',
                    letterSpacing: '-0.01em',
                  }}
                >
                  {t(key)}
                </span>
              </li>
            );
          })}
        </ol>

        {/* Progress rail — a quiet instrument readout under the steps. */}
        <div
          aria-hidden
          style={{
            marginTop: 10,
            height: 3,
            borderRadius: 9999,
            overflow: 'hidden',
            background: 'var(--fecal-track)',
          }}
        >
          <motion.div
            style={{
              height: '100%',
              borderRadius: 9999,
              background:
                'linear-gradient(90deg, var(--pbt-driver-primary), var(--pbt-driver-accent))',
            }}
            initial={false}
            animate={{
              width: settled
                ? '100%'
                : `${Math.round(((active + 0.5) / STEP_KEYS.length) * 100)}%`,
            }}
            transition={reduce ? { duration: 0 } : { duration: 0.6, ease: 'easeOut' }}
          />
        </div>
      </div>
  );
}
