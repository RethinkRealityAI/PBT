import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Glass } from '../design-system/Glass';
import { DriverWave } from '../design-system/DriverWave';
import { Icon } from '../design-system/Icon';
import { useQuiz } from '../features/quiz/useQuiz';
import { TopBar } from '../shell/TopBar';
import { Page } from '../shell/Page';
import { useNavigation } from '../app/providers/NavigationProvider';
import { useProfile } from '../app/providers/ProfileProvider';
import { useTheme } from '../app/providers/ThemeProvider';
import { DRIVER_COLORS, type DriverKey } from '../design-system/tokens';
import type { QuizOption } from '../data/quizQuestions';

// All four driver colors for the rainbow gradient effects
const RAINBOW = [
  'oklch(0.62 0.22 22)',   // Activator — coral/red
  'oklch(0.70 0.18 70)',   // Energizer — amber
  'oklch(0.62 0.16 245)',  // Analyzer  — blue
  'oklch(0.60 0.16 145)',  // Harmonizer — green
] as const;

const RAINBOW_GRADIENT = `linear-gradient(90deg, ${RAINBOW.join(', ')})`;

export function QuizScreen() {
  const { go, back } = useNavigation();
  const { setProfile } = useProfile();
  const { resolvedTheme } = useTheme();
  const dark = resolvedTheme === 'dark';
  const { step, currentQuestion, tieBreaker, answer } = useQuiz();
  const [chosen, setChosen] = useState<QuizOption | null>(null);
  const [activeDriver, setActiveDriver] = useState<DriverKey | 'all'>('all');
  // Track the driver color of the chosen option for glow/border effects
  const chosenDriverColor = chosen
    ? DRIVER_COLORS[chosen.driver as DriverKey]?.primary ?? RAINBOW[0]
    : null;

  // Prevent double-fire
  const answering = useRef(false);

  useEffect(() => {
    if (step.kind === 'complete') {
      setProfile({
        ...step.result,
        takenAt: new Date().toISOString(),
      });
      go('result');
    }
  }, [step, setProfile, go]);

  useEffect(() => {
    setChosen(null);
    answering.current = false;
  }, [
    step.kind === 'question' ? step.index : null,
    step.kind === 'tieBreaker' ? 'tb' : null,
  ]);

  const question =
    step.kind === 'question'
      ? currentQuestion
      : step.kind === 'tieBreaker'
        ? {
            id: 16,
            part: 0,
            partLabel: 'Tie-breaker',
            prompt: tieBreaker!.prompt,
            options: tieBreaker!.options,
          }
        : null;

  if (!question) return null;

  const counter =
    step.kind === 'question'
      ? `${step.index + 1} / ${step.total}`
      : 'Tie-breaker';

  const handleChoose = (opt: QuizOption) => {
    if (chosen || answering.current) return;
    answering.current = true;
    setChosen(opt);
    setActiveDriver(opt.driver as DriverKey);
    setTimeout(() => answer(opt.driver as DriverKey), 420);
  };

  const pct =
    step.kind === 'question'
      ? ((step.index + 1) / step.total) * 100
      : 100;

  // Current driver color for orbs/progress (update immediately when driver changes)
  const driverColor = activeDriver !== 'all'
    ? DRIVER_COLORS[activeDriver].primary
    : null;

  return (
    <>
      <TopBar
        title="ECHO Driver Quiz"
        showBack={!(step.kind === 'question' && step.index === 0)}
        trailing={
          <button
            onClick={back}
            style={{
              fontFamily: 'var(--pbt-font-mono)',
              fontSize: 11,
              letterSpacing: '0.10em',
              textTransform: 'uppercase',
              color: 'var(--pbt-text-muted)',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
            }}
          >
            {counter}
          </button>
        }
      />
      <Page className="flex flex-col flex-1 min-h-0">
        {/* Ambient orbs — cross-fade to active driver color */}
        {/* Ambient orbs — keyed so AnimatePresence can exit/enter on driver change */}
        <AnimatePresence>
          <motion.div
            aria-hidden
            key={`orb1-${activeDriver}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.7, ease: 'easeInOut' }}
            style={{
              position: 'absolute',
              top: '8%',
              right: '-10%',
              width: '70%',
              height: '40%',
              borderRadius: '50%',
              background: `radial-gradient(closest-side, color-mix(in oklab, ${driverColor ?? 'oklch(0.62 0.22 22)'} 28%, transparent), transparent 70%)`,
              filter: 'blur(32px)',
              pointerEvents: 'none',
              zIndex: 0,
            }}
          />
        </AnimatePresence>
        <AnimatePresence>
          <motion.div
            aria-hidden
            key={`orb2-${activeDriver}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.7, ease: 'easeInOut', delay: 0.12 }}
            style={{
              position: 'absolute',
              bottom: '15%',
              left: '-10%',
              width: '55%',
              height: '30%',
              borderRadius: '50%',
              background: `radial-gradient(closest-side, color-mix(in oklab, ${driverColor ?? 'oklch(0.70 0.18 70)'} 22%, transparent), transparent 70%)`,
              filter: 'blur(26px)',
              pointerEvents: 'none',
              zIndex: 0,
            }}
          />
        </AnimatePresence>

        <div className="relative z-[1] flex flex-col flex-1 min-h-0">
          <header className="shrink-0">
            {/* DriverWave — cross-fades when driver changes */}
            <div style={{ height: 56, marginBottom: 8, position: 'relative' }}>
              <AnimatePresence>
                <motion.div
                  key={activeDriver}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.4, ease: 'easeInOut' }}
                  style={{ position: 'absolute', inset: 0 }}
                >
                  <DriverWave
                    driver={activeDriver}
                    height={56}
                    synthwave
                    amplitude={1.15}
                    speed={1.05}
                  />
                </motion.div>
              </AnimatePresence>
            </div>

            {/* Progress bar — rainbow gradient fill + glowing thumb */}
            <div
              style={{
                position: 'relative',
                height: 6,
                borderRadius: 9999,
                background: dark
                  ? 'rgba(255,255,255,0.10)'
                  : 'rgba(0,0,0,0.07)',
                marginBottom: 14,
                overflow: 'visible',
              }}
            >
              {/* Track glassmorphic tint */}
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  borderRadius: 9999,
                  backdropFilter: 'blur(8px)',
                  WebkitBackdropFilter: 'blur(8px)',
                  background: dark
                    ? 'rgba(255,255,255,0.06)'
                    : 'rgba(255,255,255,0.35)',
                  border: '0.5px solid rgba(255,255,255,0.4)',
                }}
              />
              {/* Fill — rainbow when no driver chosen, transitions to active driver color */}
              <motion.div
                animate={{
                  width: `${pct}%`,
                  background: driverColor
                    ? `linear-gradient(90deg, ${driverColor}, color-mix(in oklab, ${driverColor} 70%, ${DRIVER_COLORS[activeDriver as DriverKey]?.accent ?? driverColor}))`
                    : RAINBOW_GRADIENT,
                }}
                transition={{ duration: 0.55, ease: [0.4, 0, 0.2, 1] }}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  height: '100%',
                  borderRadius: 9999,
                  boxShadow: `0 0 8px 2px color-mix(in oklab, ${driverColor ?? RAINBOW[0]} 50%, transparent)`,
                }}
              />
              {/* Glowing thumb dot */}
              <motion.div
                animate={{ left: `${pct}%` }}
                transition={{ duration: 0.55, ease: [0.4, 0, 0.2, 1] }}
                style={{
                  position: 'absolute',
                  top: '50%',
                  transform: 'translate(-50%, -50%)',
                  width: 16,
                  height: 16,
                  borderRadius: '50%',
                  background: driverColor ?? RAINBOW[0],
                  boxShadow: `0 0 10px 4px color-mix(in oklab, ${driverColor ?? RAINBOW[0]} 65%, transparent), 0 0 22px 10px color-mix(in oklab, ${driverColor ?? RAINBOW[0]} 22%, transparent)`,
                  zIndex: 2,
                }}
              />
            </div>

            <div
              style={{
                fontFamily: 'var(--pbt-font-mono)',
                fontSize: 11,
                letterSpacing: '0.18em',
                textTransform: 'uppercase',
                color: 'var(--pbt-text-muted)',
                marginBottom: 6,
                textAlign: 'center',
              }}
            >
              {step.kind === 'question'
                ? `Part ${question.part} · ${question.partLabel}`
                : 'Final question · pick what fits best'}
            </div>
          </header>

          <div
            className="flex flex-1 flex-col justify-center min-h-0"
            style={{ gap: 22, paddingTop: 12, paddingBottom: 16 }}
          >
            <h2
              style={{
                margin: 0,
                fontSize: 31,
                fontWeight: 400,
                letterSpacing: '-0.025em',
                lineHeight: 1.12,
                color: 'var(--pbt-text)',
                textAlign: 'center',
                paddingInline: 4,
              }}
            >
              {question.prompt}
            </h2>

            <div className="flex flex-col" style={{ gap: 12 }}>
              {question.options.map((opt) => {
                const isChosen = chosen?.letter === opt.letter;
                const isOther = chosen !== null && !isChosen;
                const optDriverColor = DRIVER_COLORS[opt.driver as DriverKey]?.primary ?? RAINBOW[0];

                return (
                  <motion.div
                    key={opt.letter}
                    animate={
                      isChosen
                        ? { y: -5, scale: 1.02 }
                        : isOther
                          ? { opacity: 0.32, scale: 0.97 }
                          : { y: 0, scale: 1, opacity: 1 }
                    }
                    transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
                  >
                    <Glass
                      onClick={() => handleChoose(opt)}
                      radius={22}
                      padding={18}
                      blur={20}
                      glow={null}
                      shine={true}
                      style={isChosen ? {
                        boxShadow: [
                          `0 0 0 1.5px ${optDriverColor}`,
                          `0 8px 20px -6px color-mix(in oklab, ${optDriverColor} 40%, transparent)`,
                        ].join(', '),
                        transition: 'box-shadow 0.28s ease',
                      } : {
                        transition: 'box-shadow 0.28s ease',
                      }}
                    >
                      <div className="flex items-center gap-4">
                        {/* Letter badge — always glassmorphic; only border/glow change on chosen */}
                        <div
                          style={{
                            width: 36,
                            height: 36,
                            borderRadius: '50%',
                            flexShrink: 0,
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontFamily: 'var(--pbt-font-mono)',
                            fontSize: 13,
                            fontWeight: 700,
                            backdropFilter: 'blur(16px)',
                            WebkitBackdropFilter: 'blur(16px)',
                            background: dark ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.28)',
                            color: dark ? '#fff' : 'oklch(0.25 0.04 20)',
                            border: isChosen
                              ? `1px solid color-mix(in oklab, ${optDriverColor} 70%, white)`
                              : '1px solid rgba(255,255,255,0.55)',
                            boxShadow: isChosen
                              ? [
                                  `-3px -3px 8px 2px color-mix(in oklab, ${RAINBOW[0]} 25%, transparent)`,
                                  `3px -3px 8px 2px color-mix(in oklab, ${RAINBOW[1]} 25%, transparent)`,
                                  `3px 3px 8px 2px color-mix(in oklab, ${RAINBOW[2]} 25%, transparent)`,
                                  `-3px 3px 8px 2px color-mix(in oklab, ${RAINBOW[3]} 25%, transparent)`,
                                  'inset 0 1px 0 rgba(255,255,255,0.70)',
                                ].join(', ')
                              : [
                                  `-3px -3px 8px 2px color-mix(in oklab, ${RAINBOW[0]} 18%, transparent)`,
                                  `3px -3px 8px 2px color-mix(in oklab, ${RAINBOW[1]} 18%, transparent)`,
                                  `3px 3px 8px 2px color-mix(in oklab, ${RAINBOW[2]} 18%, transparent)`,
                                  `-3px 3px 8px 2px color-mix(in oklab, ${RAINBOW[3]} 18%, transparent)`,
                                  '0 2px 8px rgba(0,0,0,0.06)',
                                  'inset 0 1px 0 rgba(255,255,255,0.70)',
                                ].join(', '),
                            transition: 'border 0.28s ease, box-shadow 0.28s ease',
                          }}
                        >
                          <AnimatePresence mode="wait">
                            {isChosen ? (
                              <motion.span
                                key="check"
                                initial={{ scale: 0, opacity: 0 }}
                                animate={{ scale: 1, opacity: 1 }}
                                exit={{ scale: 0, opacity: 0 }}
                                transition={{ duration: 0.2, ease: 'backOut' }}
                              >
                                <Icon.check />
                              </motion.span>
                            ) : (
                              <motion.span
                                key={opt.letter}
                                initial={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                transition={{ duration: 0.1 }}
                              >
                                {opt.letter}
                              </motion.span>
                            )}
                          </AnimatePresence>
                        </div>

                        <div
                          style={{
                            fontSize: 16,
                            lineHeight: 1.45,
                            color: 'var(--pbt-text)',
                            fontWeight: isChosen ? 600 : 500,
                            transition: 'font-weight 0.2s ease',
                          }}
                        >
                          {opt.text}
                        </div>
                      </div>
                    </Glass>
                  </motion.div>
                );
              })}
            </div>
          </div>
        </div>
      </Page>
    </>
  );
}
