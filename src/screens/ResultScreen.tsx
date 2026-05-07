import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
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
const easeOut = [0.22, 1, 0.36, 1] as const;

const INTRO_PHASES = [
  'Finding your ECHO personality driver',
  'Analyzing questions and answers',
  'Configuring your driver profile',
] as const;
const PHASE_DURATION_MS = 2000;

/**
 * Intro stage machine:
 *  cycling     → orb cycles all 4 driver colours, 3 copy phases
 *  primaryLand → orb locks to primary; "Your primary ECHO driver / Name" shown
 *  secondaryLand → orb transitions to secondary colour; "Support driver / Name" shown
 *  done        → overlay exits, result screen mounts
 */
type IntroStage = 'cycling' | 'primaryLand' | 'secondaryLand' | 'done';
const PRIMARY_HOLD_MS = 2000;
const SECONDARY_HOLD_MS = 2000;

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
  const { go, history } = useNavigation();
  const { profile } = useProfile();
  const reduceMotion = useReducedMotion();
  // Animation only plays when arriving from the quiz. Re-opening the
  // results from Home/Settings goes straight to the locked profile view —
  // the discovery moment is a one-time celebration, not a recurring intro.
  const cameFromQuiz = history[history.length - 1] === 'quiz';
  const [stage, setStage] = useState<IntroStage>(
    cameFromQuiz ? 'cycling' : 'done',
  );
  const [cycleIdx, setCycleIdx] = useState(0);
  const [phaseIdx, setPhaseIdx] = useState(0);
  const profileRunKey = profile?.takenAt ?? null;

  // Derived helpers consumed by the render below
  const introOpen = stage !== 'done';
  const orbLand = stage === 'primaryLand' || stage === 'secondaryLand';

  useEffect(() => {
    if (!profileRunKey) return;
    if (!cameFromQuiz) return;

    setStage('cycling');
    setCycleIdx(0);
    setPhaseIdx(0);

    const interval = window.setInterval(() => {
      setCycleIdx((i) => (i + 1) % DRIVER_KEYS.length);
    }, INTRO_CYCLE_MS);

    // Advance copy phases at PHASE_DURATION_MS each
    const phaseTs = INTRO_PHASES.slice(1).map((_, i) =>
      window.setTimeout(() => setPhaseIdx(i + 1), PHASE_DURATION_MS * (i + 1)),
    );

    // After all copy phases, lock to primary
    const cycleSpan = PHASE_DURATION_MS * INTRO_PHASES.length;
    const primaryT = window.setTimeout(() => {
      window.clearInterval(interval);
      setStage('primaryLand');
    }, cycleSpan);

    // Then switch to secondary
    const secondaryT = window.setTimeout(() => {
      setStage('secondaryLand');
    }, cycleSpan + PRIMARY_HOLD_MS);

    // Then close
    const doneT = window.setTimeout(() => {
      setStage('done');
    }, cycleSpan + PRIMARY_HOLD_MS + SECONDARY_HOLD_MS);

    return () => {
      window.clearInterval(interval);
      phaseTs.forEach(window.clearTimeout);
      window.clearTimeout(primaryT);
      window.clearTimeout(secondaryT);
      window.clearTimeout(doneT);
    };
  }, [profileRunKey, cameFromQuiz]);

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
    stage === 'secondaryLand'
      ? secondaryColors.primary
      : stage === 'primaryLand'
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

  /** Do not mount heavy results DOM until the orb sequence finishes (no variant flash). */
  const showResultsContent = !introOpen;

  /** During the orb cycle, only the fullscreen overlay is visible — no result chrome yet. */
  const showResultChrome = showResultsContent;

  const introOverlay =
    typeof document !== 'undefined'
      ? createPortal(
          <AnimatePresence>
            {introOpen && (
              <motion.div
                key="echo-intro"
                role="presentation"
                aria-hidden
                style={{
                  position: 'fixed',
                  inset: 0,
                  zIndex: 10000,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding:
                    'max(env(safe-area-inset-top), 24px) 24px max(env(safe-area-inset-bottom), 24px)',
                  pointerEvents: 'auto',
                }}
                initial={false}
                exit={{
                  opacity: 0,
                  scale: 1.035,
                  filter: 'blur(14px)',
                  transition: { duration: 0.55, ease: easeOut },
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
              <div className="relative z-[1] flex flex-col items-center text-center" style={{ width: '100%' }}>

                {/* ── Stage-driven copy label ── */}
                <div style={{ height: 80, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', marginBottom: 8 }}>
                  <AnimatePresence mode="wait">
                    {stage === 'cycling' && (
                      <motion.div
                        key={`phase-${phaseIdx}`}
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -4 }}
                        transition={{ duration: 0.32, ease: easeOut }}
                        style={{
                          fontFamily: 'var(--pbt-font-mono)',
                          fontSize: 10,
                          letterSpacing: '0.18em',
                          textTransform: 'uppercase',
                          fontWeight: 700,
                          color: 'var(--pbt-text-muted)',
                        }}
                      >
                        {INTRO_PHASES[phaseIdx]}
                      </motion.div>
                    )}
                    {stage === 'primaryLand' && (
                      <motion.div
                        key="primary-reveal"
                        initial={{ opacity: 0, y: 10, scale: 0.93 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -6, scale: 0.96 }}
                        transition={{ duration: 0.5, ease: easeOut }}
                        style={{ textAlign: 'center' }}
                      >
                        <div style={{
                          fontFamily: 'var(--pbt-font-mono)',
                          fontSize: 9,
                          letterSpacing: '0.22em',
                          textTransform: 'uppercase',
                          color: 'var(--pbt-text-muted)',
                          marginBottom: 6,
                          fontWeight: 700,
                        }}>
                          Your primary ECHO driver
                        </div>
                        <div style={{
                          fontSize: 36,
                          fontWeight: 400,
                          letterSpacing: '-0.03em',
                          color: primaryColors.primary,
                          lineHeight: 1,
                        }}>
                          {primary.name}
                        </div>
                      </motion.div>
                    )}
                    {stage === 'secondaryLand' && (
                      <motion.div
                        key="secondary-reveal"
                        initial={{ opacity: 0, y: 10, scale: 0.93 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -6, scale: 0.96 }}
                        transition={{ duration: 0.5, ease: easeOut }}
                        style={{ textAlign: 'center' }}
                      >
                        <div style={{
                          fontFamily: 'var(--pbt-font-mono)',
                          fontSize: 9,
                          letterSpacing: '0.22em',
                          textTransform: 'uppercase',
                          color: 'var(--pbt-text-muted)',
                          marginBottom: 6,
                          fontWeight: 700,
                        }}>
                          Your support driver
                        </div>
                        <div style={{
                          fontSize: 36,
                          fontWeight: 400,
                          letterSpacing: '-0.03em',
                          color: secondaryColors.primary,
                          lineHeight: 1,
                        }}>
                          {secondary.name}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* ── Progress dots (cycling phase only) ── */}
                <div style={{ height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginBottom: 24 }}>
                  {stage === 'cycling' && INTRO_PHASES.map((_, i) => (
                    <motion.div
                      key={i}
                      animate={{
                        background: i <= phaseIdx ? orbHue : 'rgba(120,100,110,0.28)',
                        scale: i === phaseIdx ? 1.45 : 1,
                      }}
                      transition={{ duration: 0.35, ease: easeOut }}
                      style={{ width: 5, height: 5, borderRadius: '50%' }}
                    />
                  ))}
                </div>

                {/* ── Single orb — colour and reveal driven by stage ── */}
                {/*
                 * `key={stage}` forces a remount on every stage transition so
                 * Framer Motion re-runs entrance animations (pop + shimmer) each time
                 * the orb colour changes — primary reveal AND secondary reveal.
                 */}
                <motion.div
                  key={stage}
                  className="relative"
                  style={{ width: 'min(64vw, 230px)', height: 'min(64vw, 230px)' }}
                  initial={orbLand ? { scale: 0.82, opacity: 0 } : { scale: 1, opacity: 1 }}
                  animate={
                    orbLand
                      ? { scale: [0.82, 1.10, 0.97, 1.03, 1], opacity: 1 }
                      : { scale: 1, opacity: 1 }
                  }
                  transition={
                    orbLand
                      ? { duration: 0.85, ease: easeOut, times: [0, 0.38, 0.62, 0.80, 1] }
                      : { duration: 0.35, ease: easeOut }
                  }
                >
                  {/* Scanning rings — cycling only */}
                  {stage === 'cycling' && [0, 1, 2].map((i) => (
                    <motion.div
                      key={i}
                      aria-hidden
                      style={{
                        position: 'absolute',
                        inset: 0,
                        borderRadius: '50%',
                        border: `1.5px solid ${orbHue}`,
                        opacity: 0,
                      }}
                      animate={{ scale: [1, 2.4], opacity: [0, 0.45, 0.22, 0] }}
                      transition={{
                        duration: 2.0,
                        repeat: Infinity,
                        delay: i * 0.65,
                        ease: [0.22, 0.61, 0.36, 1],
                        times: [0, 0.18, 0.55, 1],
                      }}
                    />
                  ))}

                  {/* One-shot burst ring on land — expands once then fades */}
                  {orbLand && (
                    <motion.div
                      aria-hidden
                      style={{
                        position: 'absolute',
                        inset: 0,
                        borderRadius: '50%',
                        border: `2px solid ${orbHue}`,
                        opacity: 0,
                      }}
                      animate={{ scale: [1, 2.2], opacity: [0.7, 0] }}
                      transition={{ duration: 0.85, ease: [0.22, 0.61, 0.36, 1] }}
                    />
                  )}

                  {/* Glow halo — breathes gently after land */}
                  <motion.div
                    className="absolute rounded-full"
                    style={{
                      inset: '-14%',
                      background: `radial-gradient(closest-side, color-mix(in oklab, ${orbHue} 56%, transparent) 0%, color-mix(in oklab, ${orbHue} 18%, transparent) 52%, transparent 72%)`,
                      filter: 'blur(22px)',
                      pointerEvents: 'none',
                      transition: 'background 0.55s ease',
                    }}
                    animate={
                      orbLand
                        ? { opacity: [0, 1, 0.88, 0.96, 0.90] }
                        : { opacity: [0.65, 0.90, 0.65] }
                    }
                    transition={
                      orbLand
                        ? { duration: 2.4, ease: 'easeInOut', times: [0, 0.28, 0.55, 0.78, 1], repeat: Infinity }
                        : { duration: 2.0, repeat: Infinity, ease: 'easeInOut' }
                    }
                  />

                  {/* Sphere */}
                  <div
                    className="absolute left-1/2 top-1/2"
                    style={{
                      width: 'min(50vw, 178px)',
                      height: 'min(50vw, 178px)',
                      transform: 'translate(-50%, -50%)',
                      borderRadius: '50%',
                      background: `radial-gradient(circle at 32% 28%, rgba(255,255,255,0.92) 0%, color-mix(in oklab, ${orbHue} 32%, white) 16%, color-mix(in oklab, ${orbHue} 88%, black) 58%, color-mix(in oklab, ${orbHue} 48%, black) 100%)`,
                      boxShadow: `0 0 0 1px rgba(255,255,255,0.38) inset, 0 22px 60px -10px color-mix(in oklab, ${orbHue} 62%, transparent), 0 0 90px -16px color-mix(in oklab, ${orbHue} 50%, transparent)`,
                      overflow: 'hidden',
                      transition: 'background 0.55s ease, box-shadow 0.55s ease',
                    }}
                  >
                    {/* Shimmer sweep — one-shot diagonal highlight on reveal */}
                    {orbLand && (
                      <motion.div
                        aria-hidden
                        style={{
                          position: 'absolute',
                          inset: 0,
                          background: 'linear-gradient(115deg, transparent 20%, rgba(255,255,255,0.55) 48%, rgba(255,255,255,0.18) 58%, transparent 75%)',
                          borderRadius: '50%',
                        }}
                        initial={{ x: '-110%', opacity: 0 }}
                        animate={{ x: '120%', opacity: [0, 1, 0] }}
                        transition={{ duration: 0.72, delay: 0.18, ease: [0.4, 0, 0.2, 1] }}
                      />
                    )}
                  </div>

                  {/* Specular highlight — static gloss dot */}
                  <div
                    aria-hidden
                    className="absolute rounded-full"
                    style={{
                      width: '30%',
                      height: '22%',
                      left: '20%',
                      top: '11%',
                      background: 'radial-gradient(closest-side, rgba(255,255,255,0.92), transparent 72%)',
                      filter: 'blur(3px)',
                      pointerEvents: 'none',
                    }}
                  />
                </motion.div>
              </div>
            </motion.div>
            )}
          </AnimatePresence>,
          document.body,
        )
      : null;

  return (
    <>
      {introOverlay}
      {showResultChrome ? <TopBar showBack /> : null}
      <Page className="max-w-full overflow-x-hidden">
        {showResultsContent ? (
        <motion.div
          initial="hidden"
          animate="show"
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
            <Glass
              radius={22}
              padding={0}
              glow={secondaryColors.primary}
              style={{ overflow: 'hidden', position: 'relative' }}
            >
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

          <div style={{ height: 90 }} />
        </motion.div>
        ) : null}
      </Page>
      {showResultChrome ? (
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
      ) : null}
    </>
  );
}
