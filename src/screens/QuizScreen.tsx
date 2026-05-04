import { useEffect, useState } from 'react';
import { Glass } from '../design-system/Glass';
import { DriverWave } from '../design-system/DriverWave';
import { Icon } from '../design-system/Icon';
import { useQuiz } from '../features/quiz/useQuiz';
import { TopBar } from '../shell/TopBar';
import { Page } from '../shell/Page';
import { useNavigation } from '../app/providers/NavigationProvider';
import { useProfile } from '../app/providers/ProfileProvider';
import type { DriverKey } from '../design-system/tokens';
import type { QuizOption } from '../data/quizQuestions';

export function QuizScreen() {
  const { go, back } = useNavigation();
  const { setProfile } = useProfile();
  const { step, currentQuestion, tieBreaker, answer } = useQuiz();
  const [chosen, setChosen] = useState<QuizOption | null>(null);

  // When complete, persist profile and route to result
  useEffect(() => {
    if (step.kind === 'complete') {
      setProfile({
        ...step.result,
        takenAt: new Date().toISOString(),
      });
      go('result');
    }
  }, [step, setProfile, go]);

  // Reset chosen state on question change
  useEffect(() => {
    setChosen(null);
  }, [
    step.kind === 'question' ? step.index : null,
    step.kind === 'tieBreaker' ? 'tb' : null,
  ]);

  const question =
    step.kind === 'question'
      ? currentQuestion
      : step.kind === 'tieBreaker'
        ? { id: 16, part: 0, partLabel: 'Tie-breaker', prompt: tieBreaker!.prompt, options: tieBreaker!.options }
        : null;

  if (!question) return null;

  const counter =
    step.kind === 'question'
      ? `${step.index + 1} / ${step.total}`
      : 'Tie-breaker';

  const handleChoose = (opt: QuizOption) => {
    if (chosen) return;
    setChosen(opt);
    setTimeout(() => answer(opt.driver as DriverKey), 280);
  };

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
      <Page>
        <div style={{ height: 72, marginBottom: 10 }}>
          <DriverWave driver="all" height={72} synthwave amplitude={1.2} speed={1.1} />
        </div>
        {(() => {
          const pct = step.kind === 'question'
            ? ((step.index + 1) / step.total) * 100
            : 100;
          return (
            <div
              style={{
                position: 'relative',
                height: 4,
                borderRadius: 9999,
                background: 'rgba(60,20,15,0.10)',
                marginBottom: 24,
                overflow: 'visible',
              }}
            >
              <div
                style={{
                  height: '100%',
                  width: `${pct}%`,
                  background: 'linear-gradient(90deg, oklch(0.66 0.22 22), oklch(0.56 0.24 18))',
                  borderRadius: 9999,
                  transition: 'width 0.55s cubic-bezier(0.4,0,0.2,1)',
                }}
              />
              {/* Glowing progress orb */}
              <div
                style={{
                  position: 'absolute',
                  top: '50%',
                  left: `${pct}%`,
                  transform: 'translate(-50%, -50%)',
                  width: 14,
                  height: 14,
                  borderRadius: '50%',
                  background: 'oklch(0.72 0.22 22)',
                  boxShadow: '0 0 10px 4px oklch(0.66 0.22 22 / 0.65), 0 0 20px 8px oklch(0.66 0.22 22 / 0.25)',
                  transition: 'left 0.55s cubic-bezier(0.4,0,0.2,1)',
                  zIndex: 2,
                }}
              />
            </div>
          );
        })()}
        <div
          style={{
            fontFamily: 'var(--pbt-font-mono)',
            fontSize: 11,
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
            color: 'var(--pbt-text-muted)',
            marginBottom: 8,
          }}
        >
          {step.kind === 'question'
            ? `Part ${question.part} · ${question.partLabel}`
            : 'Final question · pick what fits best'}
        </div>
        <h2
          style={{
            margin: '0 0 22px',
            fontSize: 26,
            fontWeight: 400,
            letterSpacing: '-0.02em',
            lineHeight: 1.1,
            color: 'var(--pbt-text)',
          }}
        >
          {question.prompt}
        </h2>
        <div className="flex flex-col gap-12" style={{ gap: 12 }}>
          {question.options.map((opt) => {
            const isChosen = chosen?.letter === opt.letter;
            const isOther = chosen !== null && !isChosen;
            return (
              <Glass
                key={opt.letter}
                onClick={() => handleChoose(opt)}
                radius={20}
                padding={16}
                glow={isChosen ? 'oklch(0.62 0.22 22)' : null}
                style={{
                  transform: isChosen ? 'scale(0.98)' : 'scale(1)',
                  opacity: isOther ? 0.4 : 1,
                  border: isChosen
                    ? '1px solid oklch(0.62 0.22 22)'
                    : undefined,
                  background: isChosen
                    ? 'linear-gradient(135deg, oklch(0.94 0.05 20), oklch(0.92 0.06 22))'
                    : undefined,
                }}
              >
                <div className="flex items-center gap-3">
                  <div
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: '50%',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontFamily: 'var(--pbt-font-mono)',
                      fontSize: 12,
                      fontWeight: 700,
                      background: isChosen
                        ? 'linear-gradient(180deg, oklch(0.66 0.22 22), oklch(0.56 0.24 18))'
                        : 'rgba(60,20,15,0.08)',
                      color: isChosen ? '#fff' : 'var(--pbt-text)',
                    }}
                  >
                    {isChosen ? <Icon.check /> : opt.letter}
                  </div>
                  <div
                    style={{
                      fontSize: 14.5,
                      lineHeight: 1.4,
                      color: 'var(--pbt-text)',
                    }}
                  >
                    {opt.text}
                  </div>
                </div>
              </Glass>
            );
          })}
        </div>
      </Page>
    </>
  );
}
