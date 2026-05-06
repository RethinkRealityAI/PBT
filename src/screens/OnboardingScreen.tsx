import { useState } from 'react';
import { motion } from 'motion/react';
import { Orb } from '../design-system/Orb';
import { PillButton } from '../design-system/PillButton';
import { Icon } from '../design-system/Icon';
import { useNavigation } from '../app/providers/NavigationProvider';

const BRAND_RED = 'oklch(0.62 0.22 22)';

const SLIDES: { eyebrow: string; title: string; body: string }[] = [
  {
    eyebrow: 'PBT · Pushback Training',
    title: 'Helping you navigate\ndifficult conversations.',
    body: 'This human connection tool is designed to help you forge genuine, empathetic relationships. Perfect in business and everyday life.',
  },
  {
    eyebrow: 'Built for clinic conversations',
    title: 'Every Customer\nis Different.',
    body: "This tool provides you with the place to ask and then practice how to deal with difficult customer conversations.",
  },
  {
    eyebrow: 'Score with rigour',
    title: "See what landed.\nFix what didn't.",
    body: "After every practice you'll receive feedback on how you used empathy, listening, knowledge, objection handling, confidence, closing, and pacing. You'll get concrete next-line suggestions too.",
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
    <div
      className="flex h-full flex-col items-center justify-between px-6 pb-8"
      style={{ paddingTop: 'clamp(20px, 6vh, 48px)', overflowY: 'auto' }}
    >
      {/* Eyebrow — label only, no orb */}
      <div className="flex flex-col items-center">
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

      {/* Main content — shifted slightly below centre with generous vertical rhythm */}
      <div className="flex flex-1 flex-col items-center justify-center text-center" style={{ gap: 'clamp(24px, 5vh, 40px)', padding: '16px 0', paddingTop: 'clamp(24px, 6vh, 56px)' }}>
        {/* Orb with pulsing rings — always brand red */}
        <div
          style={{
            position: 'relative',
            width: 130,
            height: 130,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          {/* Ripple rings */}
          {[0, 1, 2].map((i) => (
            <motion.div
              key={i}
              aria-hidden
              style={{
                position: 'absolute',
                inset: 0,
                borderRadius: '50%',
                border: `1.5px solid ${BRAND_RED}`,
                boxShadow: `0 0 10px color-mix(in oklab, ${BRAND_RED} 40%, transparent)`,
                willChange: 'transform, opacity',
              }}
              initial={{ scale: 1, opacity: 0 }}
              animate={{
                scale: [1, 2.6],
                opacity: [0, 0.32, 0.22, 0.06, 0],
              }}
              transition={{
                duration: 3.8,
                repeat: Infinity,
                delay: i * 1.15,
                ease: [0.22, 0.61, 0.36, 1],
                times: [0, 0.15, 0.45, 0.8, 1],
              }}
            />
          ))}
          {/* Glow halo */}
          <motion.div
            aria-hidden
            style={{
              position: 'absolute',
              inset: '-22%',
              borderRadius: '50%',
              background: `radial-gradient(closest-side, color-mix(in oklab, ${BRAND_RED} 24%, transparent), transparent 72%)`,
              filter: 'blur(12px)',
              pointerEvents: 'none',
            }}
            animate={{ opacity: [0.22, 0.44, 0.22] }}
            transition={{ duration: 3.6, repeat: Infinity, ease: 'easeInOut' }}
          />
          {/* Orb — no driver prop → always brand red */}
          <motion.div
            style={{ position: 'relative' }}
            animate={{ scale: [1.0, 1.04, 1.0] }}
            transition={{ duration: 3.6, repeat: Infinity, ease: 'easeInOut' }}
          >
            <Orb size={130} pulse />
          </motion.div>
        </div>

        <h1
          style={{
            margin: 0,
            /* 34px floor so small phones (320px) still read comfortably at 2 lines.
               The \n in slide data is the 2-line control — no clamp needed. */
            fontSize: 'clamp(34px, 9vw, 44px)',
            fontWeight: 400,
            letterSpacing: '-0.025em',
            lineHeight: 1.1,
            whiteSpace: 'pre-line',
            color: 'var(--pbt-text)',
            maxWidth: '88vw',
          }}
        >
          {current.title}
        </h1>
        <p
          style={{
            margin: 0,
            maxWidth: 'min(320px, 86vw)',
            fontSize: 'clamp(15px, 4vw, 17px)',
            lineHeight: 1.6,
            color: 'var(--pbt-text-muted)',
            textWrap: 'pretty' as never,
          }}
        >
          {current.body}
        </p>
      </div>

      {/* Footer: dots + CTA */}
      <div className="flex flex-col items-center gap-4" style={{ width: '100%', maxWidth: 320 }}>
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
                    ? `linear-gradient(90deg, ${BRAND_RED}, oklch(0.52 0.24 18))`
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
