import { useState } from 'react';
import { Orb } from '../design-system/Orb';
import { PillButton } from '../design-system/PillButton';
import { Icon } from '../design-system/Icon';
import { useNavigation } from '../app/providers/NavigationProvider';

const SLIDES: { eyebrow: string; title: string; body: string }[] = [
  {
    eyebrow: 'PBT · Pushback Training',
    title: 'Train the\nawkward moments.',
    body: "The price objection. The breeder advice. The raw-food evangelist. We'll cue this — you handle it.",
  },
  {
    eyebrow: 'Built for clinic conversations',
    title: 'Practice with\npersonalities.',
    body: "Every customer is different. PBT roleplays the four ECHO driver types so you learn to read who you're talking to.",
  },
  {
    eyebrow: 'Score with rigour',
    title: 'See what landed.\nFix what didn\'t.',
    body: 'After every session: empathy, listening, knowledge, objection-handling, confidence, closing, pacing. With concrete next-line examples.',
  },
];

export function OnboardingScreen() {
  const { go } = useNavigation();
  const [slide, setSlide] = useState(0);

  const lastSlide = slide === SLIDES.length - 1;
  const advance = () => {
    if (lastSlide) go('terms');
    else setSlide(slide + 1);
  };

  const current = SLIDES[slide];

  return (
    <div className="flex h-full flex-col items-center justify-between px-6 pt-12 pb-8">
      <div className="flex flex-col items-center gap-3">
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <Orb size={32} pulse={false} />
          <div
            style={{
              fontFamily: 'var(--pbt-font-mono)',
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              color: 'var(--pbt-text-muted)',
            }}
          >
            {current.eyebrow}
          </div>
        </div>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center gap-8 text-center">
        <Orb size={180} />
        <h1
          style={{
            margin: 0,
            fontSize: 42,
            fontWeight: 400,
            letterSpacing: '-0.025em',
            lineHeight: 1.05,
            whiteSpace: 'pre-line',
            color: 'var(--pbt-text)',
          }}
        >
          {current.title}
        </h1>
        <p
          style={{
            margin: 0,
            maxWidth: 320,
            fontSize: 15,
            lineHeight: 1.5,
            color: 'var(--pbt-text-muted)',
            textWrap: 'pretty' as never,
          }}
        >
          {current.body}
        </p>
      </div>

      <div className="flex flex-col items-center gap-5">
        <div className="flex items-center gap-2">
          {SLIDES.map((_, i) => (
            <div
              key={i}
              style={{
                height: 6,
                width: i === slide ? 22 : 6,
                borderRadius: 9999,
                background:
                  i === slide
                    ? 'linear-gradient(90deg, oklch(0.66 0.22 22), oklch(0.56 0.24 18))'
                    : 'var(--pbt-glass-tint-strong)',
                transition: 'all 0.25s',
              }}
            />
          ))}
        </div>
        <PillButton
          size="lg"
          onClick={advance}
          icon={<Icon.arrow />}
          fullWidth
          style={{ maxWidth: 320 }}
        >
          {lastSlide ? 'Get Started' : 'Continue'}
        </PillButton>
        <button
          onClick={() => go('quiz')}
          style={{
            fontSize: 13,
            color: 'var(--pbt-text-muted)',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: '6px 10px',
          }}
        >
          I already have an account · Sign in
        </button>
      </div>
    </div>
  );
}
