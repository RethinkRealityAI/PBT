import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Glass } from '../design-system/Glass';
import { DriverWave } from '../design-system/DriverWave';
import { Icon } from '../design-system/Icon';
import { useQuiz } from '../features/quiz/useQuiz';
import { Page } from '../shell/Page';
import { useNavigation } from '../app/providers/NavigationProvider';
import { useProfile } from '../app/providers/ProfileProvider';
import { useTheme } from '../app/providers/ThemeProvider';
import type { DriverKey } from '../design-system/tokens';
import type { QuizOption } from '../data/quizQuestions';

// All four driver colors — ambient UI stays multicolor; answers don’t reveal mapping
const RAINBOW = [
  'oklch(0.62 0.22 22)',   // Activator — coral/red
  'oklch(0.70 0.18 70)',   // Energizer — amber
  'oklch(0.62 0.16 245)',  // Analyzer  — blue
  'oklch(0.60 0.16 145)',  // Harmonizer — green
] as const;

/** Lighter, smoother-blended progress fill (same hues as intro wave) */
const RAINBOW_FILL_SOFT = `linear-gradient(90deg in oklab,
  oklch(0.86 0.09 22) 0%,
  oklch(0.88 0.08 48) 22%,
  oklch(0.89 0.08 85) 44%,
  oklch(0.87 0.08 220) 67%,
  oklch(0.86 0.09 145) 100%)`;

/** Letter badge — soft rainbow rim (idle / chosen intensities) */
const LETTER_RIM_SOFT = [
  `-1px -1px 8px 0 color-mix(in oklab, ${RAINBOW[0]} 12%, transparent)`,
  `1px -1px 8px 0 color-mix(in oklab, ${RAINBOW[1]} 12%, transparent)`,
  `1px 1px 8px 0 color-mix(in oklab, ${RAINBOW[2]} 12%, transparent)`,
  `-1px 1px 8px 0 color-mix(in oklab, ${RAINBOW[3]} 12%, transparent)`,
  'inset 0 1px 0 rgba(255,255,255,0.55)',
].join(', ');

/** Tighter rims + softer outer shadow — stays inside rail padding (no clip / no horizontal scroll). */
const LETTER_RIM_CHOSEN_COMPACT = [
  `-1px -1px 7px 0 color-mix(in oklab, ${RAINBOW[0]} 15%, transparent)`,
  `1px -1px 7px 0 color-mix(in oklab, ${RAINBOW[1]} 15%, transparent)`,
  `1px 1px 7px 0 color-mix(in oklab, ${RAINBOW[2]} 15%, transparent)`,
  `-1px 1px 7px 0 color-mix(in oklab, ${RAINBOW[3]} 15%, transparent)`,
  'inset 0 1px 0 rgba(255,255,255,0.65)',
].join(', ');

/** Answer row glass — crisp border, minimal shadow (matches letter badge stroke when selected) */
const glassBorder = (dark: boolean) =>
  dark ? '1px solid rgba(255,255,255,0.22)' : '1px solid rgba(255,255,255,0.52)';

const glassShadowIdle = '0 1px 0 rgba(255,255,255,0.45) inset, 0 2px 12px -6px rgba(15, 10, 12, 0.06)';
const glassShadowChosenCompact = `${LETTER_RIM_CHOSEN_COMPACT}, 0 2px 10px -8px rgba(15, 10, 12, 0.06)`;

export function QuizScreen() {
  const { replace, back } = useNavigation();
  const { setProfile } = useProfile();
  const { resolvedTheme, toggle } = useTheme();
  const dark = resolvedTheme === 'dark';
  const { step, currentQuestion, tieBreaker, answer } = useQuiz();
  const [chosen, setChosen] = useState<QuizOption | null>(null);

  // Prevent double-fire
  const answering = useRef(false);

  useEffect(() => {
    if (step.kind === 'complete') {
      setProfile({
        ...step.result,
        takenAt: new Date().toISOString(),
      });
      /* Replace so Back from the result screen does not return to an empty quiz shell. */
      replace('result');
    }
  }, [step, setProfile, replace]);

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
    setTimeout(() => answer(opt.driver as DriverKey), 420);
  };

  const pct =
    step.kind === 'question'
      ? ((step.index + 1) / step.total) * 100
      : 100;

  const showBack = !(step.kind === 'question' && step.index === 0);
  const waveH = 'clamp(28px, 8vw, 44px)';

  return (
    <>
      <Page className="flex min-h-0 flex-1 flex-col !px-6 !pt-0 !pb-0 !overflow-hidden max-sm:!px-7 lg:!px-12">
        {/* Soft multi-driver wash — full canvas */}
        <div
          aria-hidden
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 0,
            pointerEvents: 'none',
            /* Soft white veil at top (light) / gentle darken at top (dark); no harsh corner orbs */
            background: dark
              ? `linear-gradient(180deg,
                  rgba(10, 7, 9, 0.72) 0%,
                  transparent 44%
                ),
                linear-gradient(165deg,
                  color-mix(in oklab, ${RAINBOW[2]} 13%, transparent) 0%,
                  color-mix(in oklab, ${RAINBOW[0]} 9%, transparent) 28%,
                  color-mix(in oklab, ${RAINBOW[3]} 10%, transparent) 58%,
                  color-mix(in oklab, ${RAINBOW[1]} 8%, transparent) 100%)`
              : `linear-gradient(180deg,
                  rgba(255,255,255,0.88) 0%,
                  rgba(255,255,255,0.42) 34%,
                  transparent 54%
                ),
                linear-gradient(165deg,
                  color-mix(in oklab, ${RAINBOW[2]} 15%, transparent) 0%,
                  color-mix(in oklab, ${RAINBOW[1]} 11%, transparent) 30%,
                  color-mix(in oklab, ${RAINBOW[3]} 12%, transparent) 62%,
                  color-mix(in oklab, ${RAINBOW[0]} 10%, transparent) 100%)`,
          }}
        />
        {/* Single soft bottom blob — color anchors the canvas without hot spots at the top */}
        <div
          aria-hidden
          style={{
            position: 'absolute',
            bottom: '12%',
            left: '0',
            width: 'min(52%, 100%)',
            height: '32%',
            borderRadius: '50%',
            opacity: dark ? 0.36 : 0.4,
            background: `
              radial-gradient(ellipse 68% 58% at 48% 48%, color-mix(in oklab, ${RAINBOW[1]} 12%, transparent), transparent 60%),
              radial-gradient(ellipse 58% 52% at 62% 55%, color-mix(in oklab, ${RAINBOW[3]} 11%, transparent), transparent 58%),
              radial-gradient(ellipse 50% 46% at 38% 52%, color-mix(in oklab, ${RAINBOW[2]} 10%, transparent), transparent 56%)
            `,
            filter: 'blur(30px)',
            pointerEvents: 'none',
            zIndex: 0,
          }}
        />

        <div className="relative z-[1] flex min-h-0 min-w-0 flex-1 flex-col">
          {/* Seamless top controls (no separate sticky header band) */}
          <div
            className="flex shrink-0 items-center gap-2"
            style={{
              paddingTop: 'max(env(safe-area-inset-top), 10px)',
              paddingBottom: 'clamp(8px, 2.5vw, 14px)',
            }}
          >
            {showBack ? (
              <Glass
                radius={9999}
                padding={0}
                blur={20}
                tint={0.45}
                onClick={back}
                ariaLabel="Back"
                shine={false}
                className="flex h-9 w-9 shrink-0 items-center justify-center"
              >
                <Icon.back />
              </Glass>
            ) : null}
            <h1
              className="min-w-0 flex-1 truncate text-left"
              style={{
                margin: 0,
                fontSize: 15,
                fontWeight: 600,
                letterSpacing: '-0.02em',
                color: 'var(--pbt-text)',
              }}
            >
              ECHO Driver Quiz
            </h1>
            <button
              type="button"
              onClick={back}
              style={{
                fontFamily: 'var(--pbt-font-mono)',
                fontSize: 10,
                letterSpacing: '0.10em',
                textTransform: 'uppercase',
                color: 'var(--pbt-text-muted)',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                flexShrink: 0,
                padding: '4px 2px',
              }}
            >
              {counter}
            </button>
            <Glass
              radius={9999}
              padding={0}
              tint={0.3}
              shine={false}
              onClick={toggle}
              ariaLabel={`Switch to ${resolvedTheme === 'dark' ? 'light' : 'dark'} mode`}
              className="flex h-9 w-9 shrink-0 items-center justify-center"
            >
              {resolvedTheme === 'dark' ? <Icon.sun /> : <Icon.moon />}
            </Glass>
          </div>

          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <header className="shrink-0 px-0 pt-0">
            {/* Multicolor wave — breathing room below title row + above progress */}
            <div
              style={{
                height: waveH,
                marginTop: 'clamp(2px, 1vw, 6px)',
                marginBottom: 'clamp(8px, 2.5vw, 14px)',
                minHeight: 28,
              }}
            >
              <DriverWave
                driver="all"
                height={52}
                synthwave
                amplitude={1.15}
                speed={1.05}
              />
            </div>

            {/* Progress — soft rainbow fill, white thumb */}
            <div
              style={{
                position: 'relative',
                height: 'max(5px, min(6px, 1.4vw))',
                borderRadius: 9999,
                background: dark ? 'rgba(255,255,255,0.09)' : 'rgba(0,0,0,0.06)',
                marginBottom: 'clamp(12px, 3vw, 18px)',
                overflow: 'visible',
                border: dark ? '1px solid rgba(255,255,255,0.12)' : '1px solid rgba(255,255,255,0.45)',
              }}
            >
              <motion.div
                animate={{
                  width: `${pct}%`,
                  background: RAINBOW_FILL_SOFT,
                }}
                transition={{ duration: 0.55, ease: [0.4, 0, 0.2, 1] }}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  height: '100%',
                  borderRadius: 9999,
                  boxShadow: '0 0 12px 3px rgba(255,255,255,0.18)',
                }}
              />
              <motion.div
                animate={{ left: `${pct}%` }}
                transition={{ duration: 0.55, ease: [0.4, 0, 0.2, 1] }}
                style={{
                  position: 'absolute',
                  top: '50%',
                  transform: 'translate(-50%, -50%)',
                  width: 13,
                  height: 13,
                  borderRadius: '50%',
                  background: '#fff',
                  boxShadow:
                    '0 0 10px 3px rgba(255,255,255,0.55), 0 0 22px 8px rgba(255,255,255,0.25)',
                  zIndex: 2,
                }}
              />
            </div>

            <div
              style={{
                fontFamily: 'var(--pbt-font-mono)',
                fontSize: 'clamp(10px, 3vw, 12px)',
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
                fontWeight: 700,
                color: 'var(--pbt-text)',
                opacity: dark ? 0.96 : 1,
                marginBottom: 'clamp(6px, 2vw, 10px)',
                textAlign: 'left',
                textShadow: dark
                  ? '0 1px 3px rgba(0, 0, 0, 0.45)'
                  : '0 1px 2px rgba(255, 255, 255, 0.75)',
              }}
            >
              {step.kind === 'question'
                ? `Part ${question.part} · ${question.partLabel}`
                : 'Final question · pick what fits best'}
            </div>
          </header>

          {/*
           * Layout: flex column. Question gets a fixed-height slot (3 lines at
           * max font-size) so answers never shift when questions vary in length.
           * Answers fill the remaining space with even distribution.
           */}
          <div
            className="flex min-h-0 flex-1 flex-col"
            style={{ paddingTop: 'clamp(10px, 2.5vh, 20px)', paddingBottom: 8 }}
          >
            {/*
             * Fixed-height question block: 3 lines × (28.75px × 1.25) ≈ 108px.
             * Vertically centres the text within that band regardless of length.
             */}
            <div style={{ height: 108, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 18 }}>
              <h2
                style={{
                  margin: 0,
                  fontSize: 'clamp(20px, 5.5vw, 28.75px)',
                  fontWeight: 400,
                  letterSpacing: '-0.025em',
                  lineHeight: 1.25,
                  color: 'var(--pbt-text)',
                  textAlign: 'center',
                  paddingInline: 'clamp(2px, 1vw, 8px)',
                }}
              >
                {question.prompt}
              </h2>
            </div>

            <div
              className="mx-auto flex min-w-0 w-full max-w-full flex-col sm:max-w-[min(100%,22rem)] flex-1"
              style={{ gap: 'clamp(11px, 2.8vw, 16px)', paddingInline: 6, justifyContent: 'flex-start' }}
            >
              {question.options.map((opt) => {
                const isChosen = chosen?.letter === opt.letter;
                const isOther = chosen !== null && !isChosen;

                return (
                  <motion.div
                    key={opt.letter}
                    className="min-w-0"
                    animate={
                      isChosen
                        ? { y: -3, scale: 1 }
                        : isOther
                          ? { opacity: 0.32, scale: 0.98 }
                          : { y: 0, scale: 1, opacity: 1 }
                    }
                    transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
                    whileHover={
                      isChosen || isOther
                        ? undefined
                        : {
                            y: -3,
                            transition: { duration: 0.22, ease: [0.22, 1, 0.36, 1] },
                          }
                    }
                  >
                    <Glass
                      onClick={() => handleChoose(opt)}
                      radius={28}
                      padding={14}
                      blur={20}
                      glow={null}
                      shine={true}
                      className="rounded-[28px] outline-none focus-visible:ring-2 focus-visible:ring-white/35 focus-visible:ring-offset-0"
                      style={{
                        border: isChosen
                          ? '1px solid rgba(255,255,255,0.72)'
                          : glassBorder(dark),
                        boxShadow: isChosen ? glassShadowChosenCompact : glassShadowIdle,
                        transition: 'box-shadow 0.28s ease, border-color 0.28s ease, transform 0.22s ease',
                        outline: 'none',
                        WebkitTapHighlightColor: 'transparent',
                      }}
                    >
                      <div className="flex items-center gap-3">
                        {/* Letter badge — uniform multicolor rim; no per-driver hint */}
                        <div
                          style={{
                            width: 34,
                            height: 34,
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
                              ? '1px solid rgba(255,255,255,0.72)'
                              : '1px solid rgba(255,255,255,0.55)',
                            boxShadow: isChosen ? LETTER_RIM_CHOSEN_COMPACT : LETTER_RIM_SOFT,
                            transition: 'box-shadow 0.28s ease, border-color 0.28s ease',
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
                            fontSize: 15.5,
                            lineHeight: 1.34,
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
        </div>
      </Page>
    </>
  );
}
