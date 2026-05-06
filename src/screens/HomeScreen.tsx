import { useState, type CSSProperties } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Glass } from '../design-system/Glass';
import { Orb } from '../design-system/Orb';
import { Icon } from '../design-system/Icon';
import { PillButton } from '../design-system/PillButton';
import { TopBar } from '../shell/TopBar';
import { Page } from '../shell/Page';
import { useNavigation } from '../app/providers/NavigationProvider';
import { useProfile } from '../app/providers/ProfileProvider';
import { useScenario } from '../app/providers/ScenarioProvider';
import { useSession } from '../app/providers/SessionProvider';
import { ECHO_DRIVERS } from '../data/echoDrivers';
import { DRIVER_COLORS, RADII, type DriverColors } from '../design-system/tokens';
import { SEED_SCENARIOS } from '../data/scenarios';
import { SaveProgressBanner } from '../features/auth/SaveProgressBanner';
import { useTheme } from '../app/providers/ThemeProvider';

function getDisplayInitials(user: { email?: string; user_metadata?: { display_name?: string } } | null): string | null {
  if (!user) return null;
  const name = user.user_metadata?.display_name;
  if (name) return name.trim().slice(0, 2).toUpperCase();
  const email = user.email;
  if (email) return email.slice(0, 2).toUpperCase();
  return null;
}

function getDisplayName(user: { email?: string; user_metadata?: { display_name?: string } } | null): string | null {
  if (!user) return null;
  const name = user.user_metadata?.display_name;
  if (name) return name.trim().split(' ')[0];
  const email = user.email;
  if (email) return email.split('@')[0];
  return null;
}

function driverAvatarGradient(dc: DriverColors): string {
  return `linear-gradient(180deg, color-mix(in oklab, ${dc.primary} 90%, white), ${dc.accent})`;
}

function pillSolidDriverStyle(dc: DriverColors): CSSProperties {
  return {
    background: `linear-gradient(180deg, ${dc.primary}, ${dc.accent})`,
    border: `1px solid color-mix(in oklab, ${dc.primary} 28%, rgba(255,255,255,0.45))`,
    boxShadow: [
      '0 1px 0 rgba(255,255,255,0.38) inset',
      '0 -1px 0 rgba(0,0,0,0.1) inset',
      `0 5px 18px -8px color-mix(in oklab, ${dc.primary} 28%, transparent)`,
      `0 1px 3px rgba(0,0,0,0.07)`,
    ].join(', '),
  };
}

/** Secondary dashboard tiles — liquid glass, no colored bloom. */
function dashTileGlass(dark: boolean) {
  return {
    glow: null as const,
    /* Match Glass default (0.06 light / 0.44 dark) — near-transparent in light so
       background hues show through the frosted surface. */
    tint: dark ? 0.44 : 0.06,
    blur: dark ? 36 : 22,
  };
}

/**
 * Glassmorphic icon badge — frosted fill, driver-colored border + icon, no solid soft fill.
 * Light: ~38% white + strong saturate lets background bleed through.
 * Dark:  ~20% neutral dark — glassy, not opaque.
 */
function iconBadgeStyle(dc: typeof DRIVER_COLORS[keyof typeof DRIVER_COLORS], dark: boolean): CSSProperties {
  return {
    width: 36,
    height: 36,
    borderRadius: 12,
    flexShrink: 0,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: dc.primary,
    backdropFilter: 'blur(10px) saturate(200%)',
    WebkitBackdropFilter: 'blur(10px) saturate(200%)',
    background: dark
      ? 'rgba(10, 10, 14, 0.22)'
      : 'rgba(255, 255, 255, 0.28)',
    border: `1px solid color-mix(in oklab, ${dc.primary} 32%, rgba(255,255,255,0.45))`,
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.35)',
  };
}

/** Small round controls (scenario arrows) — same glass + lift language as icon badges */
function roundGlassControlStyle(dc: DriverColors, dark: boolean): CSSProperties {
  return {
    border: `1px solid color-mix(in oklab, ${dc.primary} 42%, rgba(255,255,255,0.5))`,
    background: dark ? 'rgba(10,10,14,0.30)' : 'rgba(255,255,255,0.42)',
    backdropFilter: 'blur(12px) saturate(240%)',
    WebkitBackdropFilter: 'blur(12px) saturate(240%)',
    boxShadow: [
      'inset 0 1px 0 rgba(255,255,255,0.58)',
      'inset 0 -1px 0 rgba(0,0,0,0.05)',
      dark
        ? '0 6px 14px -5px rgba(0,0,0,0.5)'
        : '0 8px 16px -8px rgba(15,14,20,0.16), 0 2px 6px rgba(15,14,20,0.08)',
    ].join(', '),
  };
}

export function HomeScreen() {
  const { go } = useNavigation();
  const { profile } = useProfile();
  const { user } = useSession();
  const { setScenario } = useScenario();
  const [pickIndex, setPickIndex] = useState(0);
  const [scoringInfoOpen, setScoringInfoOpen] = useState(false);
  const { resolvedTheme } = useTheme();
  const dark = resolvedTheme === 'dark';

  if (!profile) return null;

  const driver = ECHO_DRIVERS[profile.primary];
  const driverColors = DRIVER_COLORS[profile.primary];
  const todaysPick = SEED_SCENARIOS[pickIndex];
  const total = SEED_SCENARIOS.length;
  const initials = getDisplayInitials(user);
  const displayName = getDisplayName(user);

  const startTodaysPick = () => {
    setScenario(todaysPick);
    go('chat');
  };

  return (
    <>
      <TopBar
        center={
          <div className="min-w-0 pr-1">
            <div
              style={{
                fontSize: 16,
                fontWeight: 600,
                letterSpacing: '-0.02em',
                lineHeight: 1.2,
                color: 'var(--pbt-text)',
                marginBottom: 3,
              }}
            >
              {displayName ? `Good day, ${displayName}.` : 'Good day.'}
            </div>
            <div
              className="flex items-center gap-2"
              style={{ minWidth: 0 }}
            >
              <span
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: '50%',
                  flexShrink: 0,
                  background: driverColors.primary,
                  boxShadow: `0 0 10px color-mix(in oklab, ${driverColors.primary} 75%, transparent)`,
                }}
              />
              <span
                style={{
                  fontFamily: 'var(--pbt-font-mono)',
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: '0.12em',
                  textTransform: 'uppercase',
                  color: 'var(--pbt-text)',
                  opacity: 0.92,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                ECHO Driver · {driver.name}
              </span>
            </div>
          </div>
        }
        trailing={
          initials ? (
            <Glass
              radius={9999}
              padding={0}
              tint={0.3}
              shine={false}
              onClick={() => go('settings')}
              ariaLabel="Profile"
              className="flex h-9 w-9 items-center justify-center"
              style={{
                background: driverAvatarGradient(driverColors),
                color: '#fff',
                fontFamily: 'var(--pbt-font-mono)',
                fontSize: 11,
                fontWeight: 700,
                border: 'none',
              }}
            >
              {initials}
            </Glass>
          ) : undefined
        }
      />
      <Page withTabBar>
        {/* Desktop-only top row: larger heading + profile button */}
        <div className="hidden lg:flex items-start justify-between gap-4 mb-8">
          <div>
            <div
              style={{
                fontSize: 15,
                fontWeight: 600,
                letterSpacing: '-0.02em',
                color: 'var(--pbt-text)',
                opacity: 0.92,
                marginBottom: 6,
              }}
            >
              {displayName ? `Good day, ${displayName}.` : 'Good day.'}
            </div>
            <h1
              style={{
                margin: 0,
                fontSize: 42,
                fontWeight: 400,
                letterSpacing: '-0.025em',
                lineHeight: 1.05,
                color: 'var(--pbt-text)',
                whiteSpace: 'pre-line',
              }}
            >
              {`What pushback are\nyou ready for today?`}
            </h1>
          </div>
          {initials && (
            <Glass
              radius={9999}
              padding={0}
              tint={0.3}
              shine={false}
              onClick={() => go('settings')}
              ariaLabel="Profile"
              className="flex h-11 w-11 items-center justify-center flex-shrink-0"
              style={{
                background: driverAvatarGradient(driverColors),
                color: '#fff',
                fontFamily: 'var(--pbt-font-mono)',
                fontSize: 12,
                fontWeight: 700,
                border: 'none',
              }}
            >
              {initials}
            </Glass>
          )}
        </div>

        {/*
         * Two-column grid on desktop; single column on mobile.
         * Left col (55%): headline + driver pill + hero card.
         * Right col (45%): save banner + quick actions + library + ACT + ECHO.
         * On mobile both divs stack in JSX order → identical to original layout.
         */}
        <div className="lg:grid lg:grid-cols-[55fr_45fr] lg:gap-8 lg:items-start">

          {/* ── Left column ── */}
          <div>
            {/* Mobile-only greeting + headline (hidden on desktop; desktop version is above) */}
            <div className="lg:hidden">
              <h1
                style={{
                  margin: '0 0 14px',
                  fontSize: 36,
                  fontWeight: 400,
                  letterSpacing: '-0.025em',
                  lineHeight: 1.05,
                  color: 'var(--pbt-text)',
                  whiteSpace: 'pre-line',
                }}
              >
                {`What pushback are\nyou ready for today?`}
              </h1>

              <SaveProgressBanner />
            </div>

            {/* Driver pill — desktop only (mobile: TopBar) */}
            <div
              className="mb-[18px] hidden lg:inline-flex"
              style={{
                alignItems: 'center',
                gap: 8,
              }}
            >
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: driverColors.primary,
                  boxShadow: `0 0 10px ${driverColors.primary}`,
                }}
              />
              <span
                style={{
                  fontFamily: 'var(--pbt-font-mono)',
                  fontSize: 11,
                  letterSpacing: '0.10em',
                  textTransform: 'uppercase',
                  color: 'var(--pbt-text-muted)',
                }}
              >
                ECHO Driver · {driver.name}
              </span>
            </div>

            {/* Hero scenario card */}
            <Glass
              radius={RADII.xl}
              padding={22}
              glow={driverColors.primary}
              tint={dark ? 0.38 : 0.08}
              blur={dark ? 36 : 22}
              style={{ minHeight: 200, position: 'relative', marginBottom: 14, overflow: 'hidden' }}
            >
              <div
                style={{
                  position: 'absolute',
                  top: 52,
                  right: 16,
                  opacity: 0.85,
                  pointerEvents: 'none',
                  zIndex: 0,
                  width: 104,
                  height: 104,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {/* Ripple rings — emanating waves (no separate synth wave elsewhere) */}
                {[0, 1, 2].map((i) => (
                  <motion.div
                    key={i}
                    aria-hidden
                    style={{
                      position: 'absolute',
                      inset: 0,
                      borderRadius: '50%',
                      border: `1.5px solid ${driverColors.primary}`,
                      boxShadow: `0 0 10px color-mix(in oklab, ${driverColors.primary} 40%, transparent)`,
                      willChange: 'transform, opacity',
                    }}
                    initial={{ scale: 1, opacity: 0 }}
                    animate={{
                      scale: [1, 2.75],
                      opacity: [0, 0.34, 0.24, 0.07, 0],
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
                {/* Soft glow halo — pulses with driver color */}
                <motion.div
                  aria-hidden
                  style={{
                    position: 'absolute',
                    inset: '-22%',
                    borderRadius: '50%',
                    background: `radial-gradient(closest-side, color-mix(in oklab, ${driverColors.primary} 26%, transparent), transparent 72%)`,
                    filter: 'blur(12px)',
                    pointerEvents: 'none',
                  }}
                  animate={{ opacity: [0.26, 0.5, 0.26] }}
                  transition={{ duration: 3.6, repeat: Infinity, ease: 'easeInOut' }}
                />
                {/* Breathing orb — slightly larger; Orb halo handles pulse */}
                <motion.div
                  style={{ position: 'relative' }}
                  animate={{ scale: [1.0, 1.045, 1.0] }}
                  transition={{ duration: 3.6, repeat: Infinity, ease: 'easeInOut' }}
                >
                  <Orb size={88} driver={profile.primary} pulse />
                </motion.div>
              </div>

              {/*
               * Do not pad the whole column for the orb — only constrain title/subcopy.
               * Otherwise prev/next + info align to a narrow column instead of the card edge.
               */}
              <div style={{ position: 'relative', zIndex: 1 }}>
              {/* Header row: title left, flexible gap, switcher flush to card inner edge */}
              <div
                className="flex w-full min-w-0 items-center"
                style={{ marginBottom: 8, gap: 12 }}
              >
                <div
                  style={{
                    fontFamily: 'var(--pbt-font-mono)',
                    fontSize: 10,
                    letterSpacing: '0.14em',
                    textTransform: 'uppercase',
                    color: 'var(--pbt-text-muted)',
                    whiteSpace: 'nowrap',
                    flexShrink: 0,
                  }}
                >
                  Scenario library
                </div>
                <div aria-hidden style={{ flex: 1, minWidth: 8 }} />
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    onClick={() => setPickIndex((i) => (i - 1 + total) % total)}
                    aria-label="Previous scenario"
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: '50%',
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: driverColors.primary,
                      ...roundGlassControlStyle(driverColors, dark),
                    }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
                  </button>
                  <span
                    style={{
                      fontFamily: 'var(--pbt-font-mono)',
                      fontSize: 10,
                      letterSpacing: '0.10em',
                      color: 'var(--pbt-text-muted)',
                      minWidth: 32,
                      textAlign: 'center',
                    }}
                  >
                    {pickIndex + 1}/{total}
                  </span>
                  <button
                    onClick={() => setPickIndex((i) => (i + 1) % total)}
                    aria-label="Next scenario"
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: '50%',
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: driverColors.primary,
                      ...roundGlassControlStyle(driverColors, dark),
                    }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6"/></svg>
                  </button>
                </div>
              </div>

              <h2
                style={{
                  margin: '0 0 6px',
                  fontSize: 20,
                  fontWeight: 400,
                  letterSpacing: '-0.02em',
                  color: 'var(--pbt-text)',
                  maxWidth: 240,
                  paddingRight: 108,
                  transition: 'opacity 0.2s',
                }}
              >
                {(() => {
                  const words = todaysPick.pushback.title.split(' ');
                  return words.length > 4
                    ? words.slice(0, 4).join(' ') + '…'
                    : todaysPick.pushback.title;
                })()}
              </h2>
              <p
                style={{
                  margin: '0 0 18px',
                  fontSize: 13,
                  color: 'var(--pbt-text-muted)',
                  maxWidth: 280,
                  paddingRight: 108,
                }}
              >
                {todaysPick.breed}, {todaysPick.age}. Driver: {todaysPick.suggestedDriver}.
              </p>
              <div className="flex w-full min-w-0 items-center justify-between gap-4">
                <PillButton
                  onClick={startTodaysPick}
                  icon={<Icon.arrow />}
                  style={{
                    ...pillSolidDriverStyle(driverColors),
                    flexShrink: 0,
                    whiteSpace: 'nowrap',
                  }}
                >
                  Start scenario
                </PillButton>
                <button
                  type="button"
                  aria-label="How sessions are scored"
                  onClick={(e) => { e.stopPropagation(); setScoringInfoOpen(true); }}
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: '50%',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: driverColors.primary,
                    flexShrink: 0,
                    ...roundGlassControlStyle(driverColors, dark),
                  }}
                >
                  <Icon.info style={{ width: 18, height: 18 }} aria-hidden />
                </button>
              </div>
              </div>
            </Glass>
          </div>

          {/* ── Right column: quick actions + library + ACT guide + ECHO profile ── */}
          <div>
            {/* Desktop-only save progress banner */}
            <div className="hidden lg:block mb-4">
              <SaveProgressBanner />
            </div>

            <div className="grid grid-cols-2 gap-3" style={{ marginBottom: 14 }}>
              <Glass
                radius={RADII.lg}
                padding={16}
                {...dashTileGlass(dark)}
                onClick={() => go('create')}
                ariaLabel="Build a scenario"
              >
                <div className="flex items-start gap-3">
                  <div style={iconBadgeStyle(driverColors, dark)}>
                    <Icon.plus />
                  </div>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>
                      Build a scenario
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--pbt-text-muted)' }}>
                      Custom pushback
                    </div>
                  </div>
                </div>
              </Glass>
              <Glass
                radius={RADII.lg}
                padding={16}
                {...dashTileGlass(dark)}
                onClick={() => go('analyzer')}
                ariaLabel="Pet Analyzer"
              >
                <div className="flex items-start gap-3">
                  <div style={iconBadgeStyle(driverColors, dark)}>
                    <Icon.paw />
                  </div>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>
                      Pet Analyzer
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--pbt-text-muted)' }}>
                      BCS · MCS · kcal
                    </div>
                  </div>
                </div>
              </Glass>
            </div>

            <Glass
              radius={RADII.lg}
              padding={16}
              {...dashTileGlass(dark)}
              onClick={() => go('resources')}
              ariaLabel="Library"
              style={{ marginBottom: 10 }}
            >
              <div className="flex items-center gap-3">
                <div style={iconBadgeStyle(driverColors, dark)}>
                  <Icon.fileText />
                </div>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 15 }}>
                    Clinical library
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--pbt-text-muted)' }}>
                    WSAVA · BCS · MCS · calorie targets
                  </div>
                </div>
              </div>
            </Glass>

            <Glass
              radius={RADII.lg}
              padding={16}
              {...dashTileGlass(dark)}
              onClick={() => go('actGuide')}
              ariaLabel="ACT Guide"
              style={{ marginBottom: 14 }}
            >
              <div className="flex items-center gap-3">
                <div style={iconBadgeStyle(driverColors, dark)}>
                  <Icon.layers />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 15 }}>
                    ACT Guide
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--pbt-text-muted)' }}>
                    Acknowledge · Clarify · Transform
                  </div>
                </div>
                <div
                  style={{
                    fontFamily: 'var(--pbt-font-mono)',
                    fontSize: 9,
                    letterSpacing: '0.14em',
                    textTransform: 'uppercase',
                    color: driverColors ? driverColors.primary : 'var(--pbt-text-muted)',
                    opacity: 0.8,
                  }}
                >
                  A.C.T.
                </div>
              </div>
            </Glass>

            <Glass
              radius={RADII.lg}
              padding={16}
              {...dashTileGlass(dark)}
              onClick={() => go('result')}
              ariaLabel="Your ECHO driver profile"
              style={{ marginBottom: 14, minHeight: 72 }}
            >
              <div className="relative flex items-center gap-3">
                <div style={iconBadgeStyle(driverColors, dark)}>
                  <Icon.spark />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 15, color: 'var(--pbt-text)' }}>
                    Your ECHO profile
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--pbt-text-muted)', fontWeight: 500 }}>
                    ECHO Driver · {profile.primary} · tap to review
                  </div>
                </div>
              </div>
            </Glass>
          </div>
        </div>
      </Page>
      <ScoringInfoModal open={scoringInfoOpen} onClose={() => setScoringInfoOpen(false)} />
    </>
  );
}

const SCORING_DIMENSIONS: Array<{ label: string; weight: string; description: string }> = [
  { label: 'Empathy & Tone', weight: '20%', description: 'Warm, non-judgmental language. Validate feelings before pivoting.' },
  { label: 'Active Listening', weight: '18%', description: 'Reflect back what the client said. Ask one specific clarifying question.' },
  { label: 'Objection Handling', weight: '18%', description: 'Acknowledge the concern, clarify the root cause, then transform with evidence.' },
  { label: 'Product Knowledge', weight: '14%', description: 'Cite Royal Canin specifics — 97% palatability, 12-week trial, BCS, MCS.' },
  { label: 'Confidence', weight: '12%', description: 'Speak with calm authority. No hedging, no shaming.' },
  { label: 'Closing', weight: '10%', description: 'Make a clear, specific recommendation the client can act on today.' },
  { label: 'Pacing', weight: '8%', description: 'Match the client’s rhythm. Don’t rush past the emotion.' },
];

function ScoringInfoModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.button
            type="button"
            aria-label="Close scoring guide"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 60,
              border: 'none',
              background: 'rgba(20, 12, 14, 0.32)',
              backdropFilter: 'blur(4px)',
              cursor: 'default',
            }}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="scoring-info-title"
            initial={{ opacity: 0, scale: 0.94, x: '-50%', y: '-48%' }}
            animate={{ opacity: 1, scale: 1, x: '-50%', y: '-50%' }}
            exit={{ opacity: 0, scale: 0.94, x: '-50%', y: '-48%' }}
            transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
            style={{
              position: 'fixed',
              top: '50%',
              left: '50%',
              zIndex: 61,
              width: 'min(94vw, 560px)',
              maxHeight: '88vh',
              overflowY: 'auto',
              borderRadius: 28,
            }}
          >
            <Glass radius={28} padding="28px 24px 24px" blur={26} tint={0.06}>
              {/* Header */}
              <div className="flex items-start justify-between gap-3" style={{ marginBottom: 14 }}>
                <div>
                  <div
                    style={{
                      fontFamily: 'var(--pbt-font-mono)',
                      fontSize: 9,
                      letterSpacing: '0.18em',
                      textTransform: 'uppercase',
                      color: 'var(--pbt-text-muted)',
                      marginBottom: 5,
                    }}
                  >
                    How you’re scored
                  </div>
                  <h2
                    id="scoring-info-title"
                    style={{
                      margin: 0,
                      fontSize: 20,
                      fontWeight: 600,
                      lineHeight: 1.2,
                      letterSpacing: '-0.02em',
                    }}
                  >
                    Seven dimensions, one overall score
                  </h2>
                </div>
                <button
                  type="button"
                  aria-label="Close"
                  onClick={onClose}
                  style={{
                    flexShrink: 0,
                    width: 30,
                    height: 30,
                    borderRadius: '50%',
                    border: '1px solid rgba(255,255,255,0.50)',
                    background: 'rgba(255,255,255,0.22)',
                    backdropFilter: 'blur(12px)',
                    WebkitBackdropFilter: 'blur(12px)',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'var(--pbt-text-muted)',
                  }}
                >
                  <Icon.close />
                </button>
              </div>

              {/* Intro */}
              <p style={{ margin: '0 0 14px', fontSize: 13.5, lineHeight: 1.6, color: 'var(--pbt-text)', fontWeight: 500 }}>
                Each session is scored 0–100 across seven dimensions and rolled into a weighted overall score.
                The fastest path to a high score: <strong style={{ fontWeight: 800 }}>Acknowledge → Clarify → Transform</strong> — don’t pitch product before the client feels heard.
              </p>

              {/* Example scorecard preview — first, sets the visual frame */}
              <div
                style={{
                  borderRadius: 18,
                  padding: 16,
                  background: 'linear-gradient(180deg, rgba(255,255,255,0.22), rgba(255,255,255,0.10))',
                  border: '1px solid rgba(255,255,255,0.42)',
                  marginBottom: 16,
                }}
              >
                <div
                  style={{
                    fontFamily: 'var(--pbt-font-mono)',
                    fontSize: 9,
                    letterSpacing: '0.18em',
                    textTransform: 'uppercase',
                    color: 'var(--pbt-text-muted)',
                    marginBottom: 10,
                  }}
                >
                  Example scorecard
                </div>
                <div className="flex items-center justify-between" style={{ marginBottom: 10 }}>
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--pbt-text-muted)', fontWeight: 600 }}>Overall</div>
                    <div style={{ fontSize: 30, fontWeight: 600, lineHeight: 1, letterSpacing: '-0.02em', color: 'oklch(0.58 0.18 145)' }}>
                      87
                    </div>
                  </div>
                  <span
                    style={{
                      padding: '5px 12px',
                      borderRadius: 9999,
                      fontFamily: 'var(--pbt-font-mono)',
                      fontSize: 10,
                      fontWeight: 700,
                      letterSpacing: '0.14em',
                      textTransform: 'uppercase',
                      color: '#fff',
                      background: 'oklch(0.58 0.18 145)',
                    }}
                  >
                    Strong
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5" style={{ marginBottom: 10 }}>
                  {[
                    { l: 'Empathy', v: 92 },
                    { l: 'Listening', v: 88 },
                    { l: 'Objection', v: 85 },
                    { l: 'Product', v: 82 },
                    { l: 'Confidence', v: 89 },
                    { l: 'Closing', v: 84 },
                    { l: 'Pacing', v: 86 },
                  ].map((m) => (
                    <span
                      key={m.l}
                      style={{
                        padding: '3px 9px',
                        borderRadius: 9999,
                        background: 'rgba(255,255,255,0.32)',
                        border: '1px solid rgba(255,255,255,0.5)',
                        fontSize: 11,
                        fontWeight: 600,
                        color: 'var(--pbt-text)',
                      }}
                    >
                      {m.l} <span style={{ color: 'oklch(0.58 0.18 145)', fontWeight: 700 }}>{m.v}</span>
                    </span>
                  ))}
                </div>
                <p style={{ margin: 0, fontSize: 12, lineHeight: 1.5, color: 'var(--pbt-text)', fontWeight: 500 }}>
                  <strong style={{ fontWeight: 800 }}>Coach note:</strong> Strong empathy opener and a clean Royal Canin Satiety pivot.
                  Next time, name the 12-week trial earlier to lift Closing.
                </p>
              </div>

              {/* Dimensions list */}
              <div
                style={{
                  fontFamily: 'var(--pbt-font-mono)',
                  fontSize: 9,
                  letterSpacing: '0.18em',
                  textTransform: 'uppercase',
                  color: 'var(--pbt-text-muted)',
                  marginBottom: 8,
                }}
              >
                The seven dimensions
              </div>
              <div style={{ marginBottom: 18 }}>
                {SCORING_DIMENSIONS.map((d) => (
                  <div
                    key={d.label}
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: 10,
                      padding: '10px 12px',
                      borderRadius: 14,
                      background: 'rgba(255,255,255,0.16)',
                      border: '1px solid rgba(255,255,255,0.32)',
                      marginBottom: 6,
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: 13,
                          fontWeight: 700,
                          color: 'var(--pbt-text)',
                          marginBottom: 2,
                          letterSpacing: '-0.005em',
                        }}
                      >
                        {d.label}
                      </div>
                      <div style={{ fontSize: 12, lineHeight: 1.45, color: 'var(--pbt-text-muted)' }}>
                        {d.description}
                      </div>
                    </div>
                    <span
                      style={{
                        flexShrink: 0,
                        fontFamily: 'var(--pbt-font-mono)',
                        fontSize: 10,
                        fontWeight: 700,
                        letterSpacing: '0.06em',
                        padding: '4px 8px',
                        borderRadius: 9999,
                        background: 'rgba(255,255,255,0.28)',
                        border: '1px solid rgba(255,255,255,0.45)',
                        color: 'var(--pbt-text)',
                      }}
                    >
                      {d.weight}
                    </span>
                  </div>
                ))}
              </div>

              {/* How sessions end */}
              <div
                style={{
                  fontFamily: 'var(--pbt-font-mono)',
                  fontSize: 9,
                  letterSpacing: '0.18em',
                  textTransform: 'uppercase',
                  color: 'var(--pbt-text-muted)',
                  marginBottom: 8,
                }}
              >
                How a scenario ends
              </div>
              <div
                style={{
                  borderRadius: 16,
                  padding: 14,
                  background: 'rgba(255,255,255,0.16)',
                  border: '1px solid rgba(255,255,255,0.32)',
                  marginBottom: 12,
                }}
              >
                <p style={{ margin: '0 0 10px', fontSize: 12.5, lineHeight: 1.55, color: 'var(--pbt-text)', fontWeight: 500 }}>
                  The customer’s receptiveness moves through three states. Watch the dot under the orb to see how
                  you’re doing in real time:
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {[
                    { c: 'oklch(0.55 0.22 18)', l: 'Red — Defensive', t: 'They start here. Push back, repeat the concern. Acknowledge feelings before anything else.' },
                    { c: 'oklch(0.72 0.19 80)', l: 'Yellow — Receptive', t: 'They feel heard. Ask one specific clarifying question to surface the real concern.' },
                    { c: 'oklch(0.58 0.18 145)', l: 'Green — Convinced', t: 'They’re ready to act. Offer a concrete Royal Canin recommendation and the 12-week trial — the session ends as “resolved.”' },
                  ].map((row) => (
                    <div key={row.l} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                      <span
                        style={{
                          flexShrink: 0,
                          width: 10,
                          height: 10,
                          marginTop: 4,
                          borderRadius: '50%',
                          background: row.c,
                          boxShadow: `0 0 8px 1px ${row.c}`,
                        }}
                      />
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--pbt-text)' }}>{row.l}</div>
                        <div style={{ fontSize: 11.5, lineHeight: 1.45, color: 'var(--pbt-text-muted)' }}>{row.t}</div>
                      </div>
                    </div>
                  ))}
                </div>
                <p style={{ margin: '10px 0 0', fontSize: 11.5, lineHeight: 1.5, color: 'var(--pbt-text-muted)', fontStyle: 'italic' }}>
                  If you can’t move them past Red after ~15 turns, the session ends as a “stalemate.” Either way,
                  the full transcript is scored against the seven dimensions above.
                </p>
              </div>

              <p
                style={{
                  margin: '4px 0 0',
                  fontSize: 11.5,
                  lineHeight: 1.5,
                  color: 'var(--pbt-text-muted)',
                  textAlign: 'center',
                  fontStyle: 'italic',
                }}
              >
                Bands: 85+ Strong · 70–84 On track · &lt;70 Needs work
              </p>
            </Glass>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
