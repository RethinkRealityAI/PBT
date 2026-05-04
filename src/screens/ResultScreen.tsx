import { useEffect, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Glass } from '../design-system/Glass';
import { DriverWave } from '../design-system/DriverWave';
import { Icon } from '../design-system/Icon';
import { PillButton } from '../design-system/PillButton';
import { TopBar } from '../shell/TopBar';
import { Page } from '../shell/Page';
import { useNavigation } from '../app/providers/NavigationProvider';
import { useProfile } from '../app/providers/ProfileProvider';
import { ECHO_DRIVERS } from '../data/echoDrivers';
import { DRIVER_COLORS, DRIVER_KEYS } from '../design-system/tokens';

const INTRO_CYCLE_MS = 520;
const INTRO_HOLD_PRIMARY_MS = 720;
const easeOut = [0.22, 1, 0.36, 1] as const;

const containerVariants = {
  hidden: {},
  show: {
    transition: {
      staggerChildren: 0.09,
      delayChildren: 0.1,
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 28 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.52, ease: easeOut },
  },
};

export function ResultScreen() {
  const { go } = useNavigation();
  const { profile } = useProfile();
  const reduceMotion = useReducedMotion();
  const [introOpen, setIntroOpen] = useState(() => !reduceMotion);
  const [orbLand, setOrbLand] = useState(false);
  const [cycleIdx, setCycleIdx] = useState(0);

  useEffect(() => {
    if (reduceMotion) {
      setIntroOpen(false);
      setOrbLand(true);
      return;
    }
    setIntroOpen(true);
    setOrbLand(false);
    setCycleIdx(0);

    const interval = window.setInterval(() => {
      setCycleIdx(
        (i) => (i + 1) % DRIVER_KEYS.length,
      );
    }, INTRO_CYCLE_MS);

    const cycleSpan = INTRO_CYCLE_MS * DRIVER_KEYS.length + 120;
    const landT = window.setTimeout(() => {
      window.clearInterval(interval);
      setOrbLand(true);
    }, cycleSpan);

    const closeT = window.setTimeout(
      () => setIntroOpen(false),
      cycleSpan + INTRO_HOLD_PRIMARY_MS,
    );

    return () => {
      window.clearInterval(interval);
      window.clearTimeout(landT);
      window.clearTimeout(closeT);
    };
  }, [reduceMotion]);

  if (!profile) return null;

  const primary = ECHO_DRIVERS[profile.primary];
  const secondary = ECHO_DRIVERS[profile.secondary];
  const primaryColors = DRIVER_COLORS[profile.primary];
  const secondaryColors = DRIVER_COLORS[profile.secondary];
  const totalAnswers = profile.answers.length;
  const matchPct = Math.round(
    (profile.tally[profile.primary] / totalAnswers) * 100,
  );

  const orbHue =
    orbLand || reduceMotion
      ? primaryColors.primary
      : DRIVER_COLORS[DRIVER_KEYS[cycleIdx]].primary;

  const contentShown = !introOpen;
  const barMotionDuration = reduceMotion ? 0 : 0.65;
  // Bars start after intro closes + card stagger lands (~0.8s total)
  const barDelay = (i: number) => (reduceMotion ? 0 : 0.55 + i * 0.08);

  const listVariants = reduceMotion
    ? { hidden: {}, show: { transition: { staggerChildren: 0 } } }
    : containerVariants;
  const rowVariants = reduceMotion
    ? {
        hidden: { opacity: 1, y: 0 },
        show: { opacity: 1, y: 0 },
      }
    : itemVariants;

  const revealAnimate =
    introOpen && !reduceMotion ? 'hidden' : 'show';

  return (
    <>
      <TopBar showBack />
      <Page className="max-w-full overflow-x-hidden">
        <AnimatePresence>
          {introOpen && (
            <motion.div
              key="echo-intro"
              role="presentation"
              aria-hidden
              className="pointer-events-auto fixed left-1/2 top-0 z-50 flex h-[100dvh] w-full max-w-[var(--pbt-layout-max)] -translate-x-1/2 flex-col items-center justify-center px-6"
              style={{
                paddingTop: 'max(env(safe-area-inset-top), 12px)',
                paddingBottom: 'max(env(safe-area-inset-bottom), 12px)',
              }}
              initial={false}
              exit={{
                opacity: 0,
                scale: reduceMotion ? 1 : 1.035,
                filter: reduceMotion ? 'none' : 'blur(14px)',
                transition: { duration: reduceMotion ? 0.12 : 0.55, ease: easeOut },
              }}
            >
              <div
                className="absolute inset-0"
                style={{
                  background:
                    'color-mix(in oklab, var(--pbt-glass-tint-strong) 42%, var(--pbt-canvas))',
                  backdropFilter: 'blur(32px) saturate(190%)',
                  WebkitBackdropFilter: 'blur(32px) saturate(190%)',
                  borderBottom: '1px solid var(--pbt-glass-border)',
                  boxShadow:
                    'inset 0 1px 0 rgba(255,255,255,0.45), inset 0 -20px 60px -30px rgba(0,0,0,0.12)',
                }}
              />
              <div className="relative z-[1] flex flex-col items-center text-center">
                <motion.p
                  className="max-w-[300px]"
                  style={{
                    fontFamily: 'var(--pbt-font-mono)',
                    fontSize: 10,
                    letterSpacing: '0.18em',
                    textTransform: 'uppercase',
                    fontWeight: 700,
                    color: 'var(--pbt-text-muted)',
                    marginBottom: 26,
                  }}
                >
                  {reduceMotion
                    ? 'ECHO profile'
                    : orbLand
                      ? 'Locking your ECHO profile'
                      : 'Defining your driver'}
                </motion.p>
                <motion.div
                  className="relative"
                  style={{ width: 'min(72vw, 260px)', height: 'min(72vw, 260px)' }}
                  animate={
                    reduceMotion
                      ? {}
                      : {
                          scale: orbLand ? [1, 1.06, 1] : 1,
                        }
                  }
                  transition={
                    reduceMotion
                      ? {}
                      : {
                          duration: orbLand ? 0.85 : 0.35,
                          ease: easeOut,
                        }
                  }
                >
                  <motion.div
                    className="absolute rounded-full"
                    style={{
                      inset: '-10%',
                      background: `radial-gradient(closest-side, color-mix(in oklab, ${orbHue} 55%, transparent) 0%, color-mix(in oklab, ${orbHue} 18%, transparent) 50%, transparent 72%)`,
                      filter: 'blur(18px)',
                      pointerEvents: 'none',
                    }}
                    animate={
                      reduceMotion
                        ? {}
                        : { opacity: orbLand ? [0.85, 1, 0.92] : [0.75, 0.95, 0.8] }
                    }
                    transition={{
                      duration: orbLand ? 1.6 : 2.2,
                      repeat: orbLand ? 0 : Infinity,
                      ease: 'easeInOut',
                    }}
                  />
                  <motion.div
                    className="absolute left-1/2 top-1/2"
                    style={{
                      width: 'min(56vw, 200px)',
                      height: 'min(56vw, 200px)',
                      transform: 'translate(-50%, -50%)',
                      borderRadius: '50%',
                      background: `radial-gradient(circle at 32% 28%, rgba(255,255,255,0.9) 0%, color-mix(in oklab, ${orbHue} 35%, white) 18%, color-mix(in oklab, ${orbHue} 85%, black) 58%, color-mix(in oklab, ${orbHue} 45%, black) 100%)`,
                      boxShadow: reduceMotion
                        ? `0 18px 50px -14px color-mix(in oklab, ${orbHue} 55%, transparent)`
                        : `0 0 0 1px rgba(255,255,255,0.35) inset, 0 20px 56px -12px color-mix(in oklab, ${orbHue} 58%, transparent), 0 0 80px -20px color-mix(in oklab, ${orbHue} 45%, transparent)`,
                    }}
                    animate={
                      reduceMotion
                        ? {}
                        : {
                            boxShadow: orbLand
                              ? `0 0 0 1px rgba(255,255,255,0.4) inset, 0 24px 64px -10px color-mix(in oklab, ${primaryColors.primary} 62%, transparent)`
                              : undefined,
                          }
                    }
                    transition={{ duration: 0.6, ease: easeOut }}
                  />
                  <div
                    aria-hidden
                    className="absolute rounded-full"
                    style={{
                      width: '29%',
                      height: '22%',
                      left: '21%',
                      top: '12%',
                      background:
                        'radial-gradient(closest-side, rgba(255,255,255,0.88), transparent 72%)',
                      filter: 'blur(3px)',
                      pointerEvents: 'none',
                    }}
                  />
                </motion.div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <motion.div
          initial={false}
          animate={revealAnimate}
          variants={listVariants}
          className="min-w-0"
        >
          <motion.div variants={rowVariants}>
            <Glass
              radius={28}
              padding={0}
              glow={primaryColors.primary}
              style={{ overflow: 'hidden', position: 'relative' }}
            >
              <div
                aria-hidden
                style={{
                  position: 'absolute',
                  right: -80,
                  bottom: -60,
                  width: 280,
                  height: 280,
                  borderRadius: '50%',
                  background: `radial-gradient(closest-side, color-mix(in oklab, ${primaryColors.primary} 45%, transparent), transparent 70%)`,
                  filter: 'blur(14px)',
                  pointerEvents: 'none',
                }}
              />
              <div style={{ padding: '22px 22px 0', position: 'relative' }}>
                <div
                  style={{
                    display: 'inline-block',
                    fontFamily: 'var(--pbt-font-mono)',
                    fontSize: 10,
                    letterSpacing: '0.18em',
                    textTransform: 'uppercase',
                    fontWeight: 700,
                    padding: '5px 12px',
                    borderRadius: 9999,
                    color: '#fff',
                    background: `linear-gradient(135deg, ${primaryColors.primary}, ${primaryColors.accent})`,
                  }}
                >
                  Primary Driver · {matchPct}% match
                </div>
                <h1
                  style={{
                    margin: '14px 0 6px',
                    fontSize: 48,
                    fontWeight: 400,
                    letterSpacing: '-0.025em',
                    lineHeight: 1,
                    color: primaryColors.primary,
                  }}
                >
                  {primary.name}
                </h1>
                <div
                  style={{
                    fontStyle: 'italic',
                    fontSize: 14,
                    color: 'var(--pbt-text-muted)',
                    marginBottom: 10,
                  }}
                >
                  {primary.tagline}
                </div>
                <p
                  style={{
                    margin: '0 0 14px',
                    fontSize: 15,
                    lineHeight: 1.45,
                    color: 'var(--pbt-text)',
                    textWrap: 'pretty' as never,
                  }}
                >
                  {primary.blurb}
                </p>
              </div>
              <div style={{ height: 118, position: 'relative' }}>
                <DriverWave
                  driver={profile.primary}
                  height={118}
                  synthwave
                  amplitude={1.1}
                  speed={0.88}
                />
              </div>
            </Glass>
          </motion.div>

          <div style={{ height: 14 }} />

          <motion.div variants={rowVariants}>
            <Glass radius={22} padding={20}>
              <div
                style={{
                  fontFamily: 'var(--pbt-font-mono)',
                  fontSize: 10,
                  letterSpacing: '0.18em',
                  textTransform: 'uppercase',
                  color: 'var(--pbt-text-muted)',
                  marginBottom: 12,
                }}
              >
                Driver mix · {totalAnswers} answers
              </div>
              {DRIVER_KEYS.map((k, idx) => {
                const count = profile.tally[k];
                const pct = Math.round((count / totalAnswers) * 100);
                const c = DRIVER_COLORS[k];
                return (
                  <div
                    key={k}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr auto',
                      alignItems: 'center',
                      gap: 8,
                      marginBottom: 10,
                      minWidth: 0,
                    }}
                  >
                    <div
                      style={{ display: 'flex', alignItems: 'center', gap: 8 }}
                    >
                      <div
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: '50%',
                          background: c.primary,
                          flexShrink: 0,
                        }}
                      />
                      <span
                        style={{
                          fontSize: 13,
                          color: 'var(--pbt-text)',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {k}
                      </span>
                    </div>
                    <div
                      style={{
                        fontFamily: 'var(--pbt-font-mono)',
                        fontSize: 11,
                        color: 'var(--pbt-text-muted)',
                        flexShrink: 0,
                      }}
                    >
                      {count} · {pct}%
                    </div>
                    <div
                      style={{
                        gridColumn: '1 / -1',
                        height: 6,
                        borderRadius: 9999,
                        background: 'rgba(60,20,15,0.06)',
                        overflow: 'hidden',
                        marginTop: 2,
                      }}
                    >
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{
                          width: contentShown ? `${pct}%` : 0,
                        }}
                        transition={{
                          duration: barMotionDuration,
                          delay: barDelay(idx),
                          ease: easeOut,
                        }}
                        style={{
                          height: '100%',
                          maxWidth: '100%',
                          background: `linear-gradient(90deg, ${c.primary}, ${c.accent})`,
                          borderRadius: 9999,
                          transformOrigin: 'left',
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </Glass>
          </motion.div>

          <div style={{ height: 16 }} />

          <motion.div
            variants={rowVariants}
            style={{
              fontFamily: 'var(--pbt-font-mono)',
              fontSize: 10,
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              color: 'var(--pbt-text-muted)',
              marginBottom: 10,
              paddingLeft: 2,
            }}
          >
            {primary.name} · in practice
          </motion.div>
          {primary.traits.map((t) => (
            <motion.div
              key={t.name}
              variants={rowVariants}
              style={{ marginBottom: 12 }}
            >
              <Glass
                radius={22}
                padding={18}
                border
                style={{
                  borderColor:
                    'color-mix(in oklab, var(--pbt-glass-border) 88%, transparent)',
                }}
              >
                <div className="flex min-w-0 items-start gap-3.5">
                  <div
                    className="flex flex-shrink-0 items-center justify-center rounded-full"
                    style={{
                      width: 34,
                      height: 34,
                      background: `color-mix(in oklab, ${primaryColors.primary} 14%, transparent)`,
                      boxShadow: `inset 0 1px 0 rgba(255,255,255,0.55), 0 4px 16px -6px color-mix(in oklab, ${primaryColors.primary} 42%, transparent)`,
                    }}
                  >
                    <Icon.checkBadge
                      style={{ color: primaryColors.primary }}
                      width={19}
                      height={19}
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div
                      style={{
                        fontWeight: 600,
                        fontSize: 14,
                        marginBottom: 4,
                        color: 'var(--pbt-text)',
                        letterSpacing: '-0.01em',
                      }}
                    >
                      {t.name}
                    </div>
                    <div
                      style={{
                        fontSize: 13,
                        lineHeight: 1.45,
                        color: 'var(--pbt-text-muted)',
                      }}
                    >
                      {t.description}
                    </div>
                  </div>
                </div>
              </Glass>
            </motion.div>
          ))}

          <motion.div variants={rowVariants} style={{ marginTop: 6 }}>
            <Glass
              radius={22}
              padding={20}
              glow={primaryColors.primary}
              border={false}
              shine
              style={{
                background: `linear-gradient(
                  152deg,
                  color-mix(in oklab, ${primaryColors.primary} 68%, #18050a) 0%,
                  color-mix(in oklab, ${primaryColors.accent} 52%, #100306) 100%
                )`,
                border: `1px solid color-mix(in oklab, ${primaryColors.primary} 38%, rgba(255,255,255,0.42))`,
                boxShadow: `
                  0 1px 0 rgba(255,255,255,0.28) inset,
                  0 -1px 0 rgba(0,0,0,0.18) inset,
                  0 22px 56px -18px color-mix(in oklab, ${primaryColors.primary} 52%, transparent),
                  0 0 48px -8px color-mix(in oklab, ${primaryColors.primary} 38%, transparent)
                `,
              }}
            >
              <div
                style={{
                  fontFamily: 'var(--pbt-font-mono)',
                  fontSize: 10,
                  letterSpacing: '0.18em',
                  textTransform: 'uppercase',
                  color: 'rgba(255,255,255,0.78)',
                  marginBottom: 8,
                  fontWeight: 700,
                }}
              >
                Growth Edge
              </div>
              <div
                style={{
                  fontSize: 14,
                  lineHeight: 1.55,
                  color: 'rgba(255,255,255,0.94)',
                  textWrap: 'pretty' as never,
                }}
              >
                {primary.growth}
              </div>
            </Glass>
          </motion.div>

          <div style={{ height: 14 }} />

          <motion.div variants={rowVariants}>
            <Glass
              radius={22}
              padding={0}
              glow={secondaryColors.primary}
              style={{ overflow: 'hidden', position: 'relative' }}
            >
              {/* Wave sits at the TOP as a decorative strip, not overlapping text */}
              <div
                style={{
                  height: 64,
                  position: 'relative',
                  overflow: 'hidden',
                  pointerEvents: 'none',
                }}
              >
                <DriverWave
                  driver={profile.secondary}
                  height={64}
                  synthwave
                  amplitude={1.0}
                  speed={0.92}
                  opacity={0.75}
                />
                {/* Fade wave into the card body below */}
                <div
                  style={{
                    position: 'absolute',
                    bottom: 0,
                    left: 0,
                    right: 0,
                    height: 24,
                    background: 'linear-gradient(to bottom, transparent, var(--pbt-canvas, rgba(255,255,255,0.01)))',
                    pointerEvents: 'none',
                  }}
                />
              </div>
              {/* Text content — clearly below the wave */}
              <div style={{ padding: '14px 20px 20px', position: 'relative' }}>
                <div
                  style={{
                    fontFamily: 'var(--pbt-font-mono)',
                    fontSize: 10,
                    letterSpacing: '0.18em',
                    textTransform: 'uppercase',
                    color: 'var(--pbt-text-muted)',
                    marginBottom: 6,
                  }}
                >
                  Support driver
                </div>
                <h3
                  style={{
                    margin: '0 0 4px',
                    fontSize: 22,
                    fontWeight: 400,
                    letterSpacing: '-0.02em',
                    color: secondaryColors.primary,
                  }}
                >
                  {secondary.name}
                </h3>
                <div
                  style={{
                    fontStyle: 'italic',
                    fontSize: 13,
                    color: 'var(--pbt-text-muted)',
                    marginBottom: 8,
                  }}
                >
                  {secondary.tagline}
                </div>
                <p
                  style={{
                    margin: 0,
                    fontSize: 13,
                    lineHeight: 1.45,
                    color: 'var(--pbt-text)',
                  }}
                >
                  {secondary.blurb}
                </p>
              </div>
            </Glass>
          </motion.div>

          <div style={{ height: 90 }} />
        </motion.div>
      </Page>
      <div
        className="fixed bottom-0 left-1/2 z-30 w-full max-w-[var(--pbt-layout-max)] -translate-x-1/2 px-5"
        style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 18px)' }}
      >
        <PillButton
          size="lg"
          fullWidth
          icon={<Icon.arrow />}
          onClick={() => go('home')}
        >
          Start training
        </PillButton>
      </div>
    </>
  );
}
