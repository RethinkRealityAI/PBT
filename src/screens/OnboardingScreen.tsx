import { useState } from 'react';
import { motion } from 'motion/react';
import { Orb } from '../design-system/Orb';
import { PillButton } from '../design-system/PillButton';
import { Icon } from '../design-system/Icon';
import { Glass } from '../design-system/Glass';
import { useNavigation } from '../app/providers/NavigationProvider';
import { useTheme } from '../app/providers/ThemeProvider';
import { LocaleToggle } from '../shell/LocaleToggle';
import { AccountUpgradeModal } from '../features/auth/AccountUpgradeModal';
import { useT } from '../i18n/useT';
import type { CatalogKey } from '../i18n/catalog';

const BRAND_RED = 'oklch(0.62 0.22 22)';

/** Slide copy lives in the `onboarding` catalog namespace — these are keys. */
const SLIDES: { eyebrow: CatalogKey; title: CatalogKey; body: CatalogKey }[] = [
  {
    eyebrow: 'onboarding.slide1.eyebrow',
    title: 'onboarding.slide1.title',
    body: 'onboarding.slide1.body',
  },
  {
    eyebrow: 'onboarding.slide2.eyebrow',
    title: 'onboarding.slide2.title',
    body: 'onboarding.slide2.body',
  },
  {
    eyebrow: 'onboarding.slide3.eyebrow',
    title: 'onboarding.slide3.title',
    body: 'onboarding.slide3.body',
  },
];

export function OnboardingScreen() {
  const { go } = useNavigation();
  const t = useT();
  const { resolvedTheme, toggle } = useTheme();
  const [slide, setSlide] = useState(0);
  // The "Sign in" link on the landing page now opens this modal instead of
  // jumping straight to the quiz — that previous behaviour bypassed the
  // terms gate entirely. Sign-up paths through the modal continue into the
  // terms screen; sign-in paths land on home (handled by the callbacks
  // below).
  const [authOpen, setAuthOpen] = useState<false | 'signin' | 'signup'>(false);

  const lastSlide = slide === SLIDES.length - 1;
  const advance = () => {
    if (lastSlide) go('terms');
    else setSlide(slide + 1);
  };

  const current = SLIDES[slide];

  return (
    <div
      className="flex h-full flex-col items-center justify-between px-6 pb-8"
      style={{ paddingTop: 0, overflowY: 'auto' }}
    >
      {/*
       * Chromeless screen — no TopBar/Sidebar here, so the language + theme
       * toggles ride at the top of the page itself. The row owns the
       * safe-area inset (the outer container no longer pads the top) so the
       * pills clear a notch. No z-index wrapper: a stacking context here
       * would kill Glass's backdrop-filter (see AppFrame's rail comment).
       */}
      <div
        className="flex w-full shrink-0 items-center justify-end gap-2"
        style={{
          paddingTop: 'max(env(safe-area-inset-top), 22px)',
          paddingBottom: 'clamp(8px, 2.5vw, 14px)',
        }}
      >
        <LocaleToggle />
        <Glass
          radius={9999}
          padding={0}
          tint={0.3}
          shine={false}
          onClick={toggle}
          ariaLabel={
            resolvedTheme === 'dark'
              ? t('chrome.themeToggle.toLight')
              : t('chrome.themeToggle.toDark')
          }
          className="flex h-9 w-9 items-center justify-center"
        >
          {resolvedTheme === 'dark' ? <Icon.sun /> : <Icon.moon />}
        </Glass>
      </div>

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
          {t(current.eyebrow)}
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
          {t(current.title)}
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
          {t(current.body)}
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
          {t(lastSlide ? 'onboarding.cta.getStarted' : 'onboarding.cta.continue')}
        </PillButton>
        <button
          onClick={() => setAuthOpen('signin')}
          style={{
            fontSize: 13,
            color: 'var(--pbt-text-muted)',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: '6px 10px',
          }}
        >
          {t('onboarding.signIn')}
        </button>
      </div>

      <AccountUpgradeModal
        open={authOpen !== false}
        initialMode={authOpen === false ? 'signup' : authOpen}
        onClose={() => setAuthOpen(false)}
        // New sign-up: continue the standard flow — terms first, then quiz.
        onSuccess={() => go('terms')}
        // Returning user: skip the onboarding flow and land on home. Terms
        // are auto-accepted in the modal (they accepted on first sign-up);
        // useCloudSync hydrates their ECHO profile so RouteResolver doesn't
        // bounce them to the quiz.
        onSignedIn={() => go('home')}
      />
    </div>
  );
}
