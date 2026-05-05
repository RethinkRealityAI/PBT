import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Glass } from '../design-system/Glass';
import { Orb } from '../design-system/Orb';
import { Icon } from '../design-system/Icon';
import { PillButton } from '../design-system/PillButton';
import { DriverWave } from '../design-system/DriverWave';
import { TopBar } from '../shell/TopBar';
import { Page } from '../shell/Page';
import { useNavigation } from '../app/providers/NavigationProvider';
import { useProfile } from '../app/providers/ProfileProvider';
import { useScenario } from '../app/providers/ScenarioProvider';
import { useSession } from '../app/providers/SessionProvider';
import { ECHO_DRIVERS } from '../data/echoDrivers';
import { DRIVER_COLORS, RADII } from '../design-system/tokens';
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
                background:
                  'linear-gradient(180deg, oklch(0.66 0.22 22), oklch(0.56 0.24 18))',
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
            {displayName ? (
              <div style={{ fontSize: 14, color: 'var(--pbt-text-muted)', marginBottom: 4 }}>
                Good day, {displayName}.
              </div>
            ) : (
              <div style={{ fontSize: 14, color: 'var(--pbt-text-muted)', marginBottom: 4 }}>
                Good day
              </div>
            )}
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
                background:
                  'linear-gradient(180deg, oklch(0.66 0.22 22), oklch(0.56 0.24 18))',
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
              {displayName ? (
                <div style={{ marginBottom: 4, fontSize: 14, color: 'var(--pbt-text-muted)' }}>
                  Good day, {displayName}.
                </div>
              ) : (
                <div style={{ marginBottom: 4, fontSize: 14, color: 'var(--pbt-text-muted)' }}>
                  Good day
                </div>
              )}
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

            {/* Driver pill */}
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                marginBottom: 18,
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
                Driver · {driver.name}
              </span>
            </div>

            {/* Hero scenario card */}
            <Glass
              radius={RADII.xl}
              padding={22}
              glow={driverColors.primary}
              style={{ minHeight: 200, position: 'relative', marginBottom: 14, overflow: 'hidden' }}
            >
              <div
                style={{
                  position: 'absolute',
                  top: 16,
                  right: 16,
                  opacity: 0.85,
                  pointerEvents: 'none',
                  zIndex: 0,
                  width: 72,
                  height: 72,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {/* Ripple rings — driver-colored, evenly staggered, smooth fade */}
                {[0, 1, 2].map((i) => (
                  <motion.div
                    key={i}
                    aria-hidden
                    style={{
                      position: 'absolute',
                      inset: 0,
                      borderRadius: '50%',
                      border: `1.5px solid ${driverColors.primary}`,
                      boxShadow: `0 0 12px ${driverColors.primary}`,
                      willChange: 'transform, opacity',
                    }}
                    initial={{ scale: 1, opacity: 0 }}
                    animate={{
                      scale: [1, 2.4],
                      opacity: [0, 0.55, 0.35, 0.12, 0],
                    }}
                    transition={{
                      duration: 3.6,
                      repeat: Infinity,
                      delay: i * 1.2,
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
                    inset: '-20%',
                    borderRadius: '50%',
                    background: `radial-gradient(closest-side, color-mix(in oklab, ${driverColors.primary} 30%, transparent), transparent 70%)`,
                    filter: 'blur(8px)',
                    pointerEvents: 'none',
                  }}
                  animate={{ opacity: [0.45, 0.85, 0.45] }}
                  transition={{ duration: 3.6, repeat: Infinity, ease: 'easeInOut' }}
                />
                {/* Breathing orb */}
                <motion.div
                  style={{ position: 'relative' }}
                  animate={{ scale: [1.0, 1.04, 1.0] }}
                  transition={{ duration: 3.6, repeat: Infinity, ease: 'easeInOut' }}
                >
                  <Orb size={72} />
                </motion.div>
              </div>

              <div style={{ position: 'relative', zIndex: 1, paddingRight: 92 }}>
              {/* Header row: eyebrow + scenario counter */}
              <div className="flex items-center justify-between gap-2" style={{ marginBottom: 8 }}>
                <div
                  style={{
                    fontFamily: 'var(--pbt-font-mono)',
                    fontSize: 10,
                    letterSpacing: '0.18em',
                    textTransform: 'uppercase',
                    color: 'var(--pbt-text-muted)',
                  }}
                >
                  Scenario library
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setPickIndex((i) => (i - 1 + total) % total)}
                    aria-label="Previous scenario"
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: '50%',
                      border: '1px solid rgba(255,255,255,0.45)',
                      background: 'rgba(255,255,255,0.22)',
                      backdropFilter: 'blur(12px)',
                      WebkitBackdropFilter: 'blur(12px)',
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'var(--pbt-text)',
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
                      border: '1px solid rgba(255,255,255,0.45)',
                      background: 'rgba(255,255,255,0.22)',
                      backdropFilter: 'blur(12px)',
                      WebkitBackdropFilter: 'blur(12px)',
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'var(--pbt-text)',
                    }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6"/></svg>
                  </button>
                </div>
              </div>

              <h2
                style={{
                  margin: '0 0 6px',
                  fontSize: 26,
                  fontWeight: 400,
                  letterSpacing: '-0.02em',
                  color: 'var(--pbt-text)',
                  maxWidth: 240,
                  transition: 'opacity 0.2s',
                }}
              >
                {todaysPick.pushback.title}
              </h2>
              <p
                style={{
                  margin: '0 0 18px',
                  fontSize: 13,
                  color: 'var(--pbt-text-muted)',
                  maxWidth: 280,
                }}
              >
                {todaysPick.breed}, {todaysPick.age}. Driver: {todaysPick.suggestedDriver}.
              </p>
              <div className="flex items-center gap-2">
                <PillButton onClick={startTodaysPick} icon={<Icon.arrow />}>
                  Start scenario
                </PillButton>
              </div>
              </div>
              {/* Info dot — opens scoring guide modal */}
              <button
                type="button"
                aria-label="How sessions are scored"
                onClick={(e) => { e.stopPropagation(); setScoringInfoOpen(true); }}
                style={{
                  position: 'absolute',
                  right: 14,
                  bottom: 14,
                  zIndex: 2,
                  width: 30,
                  height: 30,
                  borderRadius: '50%',
                  border: '1px solid rgba(255,255,255,0.55)',
                  background: 'rgba(255,255,255,0.28)',
                  backdropFilter: 'blur(16px) saturate(200%)',
                  WebkitBackdropFilter: 'blur(16px) saturate(200%)',
                  color: 'var(--pbt-text-muted)',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontFamily: 'var(--pbt-font-mono)',
                  fontSize: 13,
                  fontWeight: 700,
                  fontStyle: 'italic',
                  letterSpacing: 0,
                  boxShadow: '0 4px 12px -6px rgba(60,20,15,0.18)',
                }}
              >
                i
              </button>
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
                onClick={() => go('create')}
                ariaLabel="Build a scenario"
              >
                <div className="flex items-start gap-3">
                  <div
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 12,
                      background: 'rgba(255,255,255,0.28)',
                      border: '1px solid rgba(255,255,255,0.5)',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'var(--pbt-text)',
                      flexShrink: 0,
                    }}
                  >
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
                onClick={() => go('analyzer')}
                ariaLabel="Pet Analyzer"
              >
                <div className="flex items-start gap-3">
                  <div
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 12,
                      background: 'rgba(255,255,255,0.28)',
                      border: '1px solid rgba(255,255,255,0.5)',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'var(--pbt-text)',
                      flexShrink: 0,
                    }}
                  >
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
              onClick={() => go('resources')}
              ariaLabel="Library"
              style={{ marginBottom: 10 }}
            >
              <div className="flex items-center gap-3">
                <Icon.book />
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
              onClick={() => go('actGuide')}
              ariaLabel="ACT Guide"
              style={{ marginBottom: 14 }}
            >
              <div className="flex items-center gap-3">
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 12,
                    flexShrink: 0,
                    background: driverColors
                      ? `color-mix(in oklab, ${driverColors.soft} 80%, rgba(255,255,255,0.5))`
                      : 'rgba(255,255,255,0.5)',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: driverColors ? driverColors.primary : 'var(--pbt-text)',
                  }}
                >
                  <Icon.book />
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
              padding={0}
              onClick={() => go('result')}
              ariaLabel="Your ECHO driver profile"
              style={{ position: 'relative', overflow: 'hidden', marginBottom: 14, minHeight: 72 }}
            >
              {/* Wave + traveling dot — bottom zone, same stack order as other Glass cards */}
              <div
                style={{
                  position: 'absolute',
                  bottom: 0,
                  left: 0,
                  right: 0,
                  height: '70%',
                  pointerEvents: 'none',
                  zIndex: 0,
                }}
              >
                <DriverWave
                  driver={profile.primary}
                  height={52}
                  synthwave
                  amplitude={1.05}
                  speed={0.85}
                  opacity={dark ? 0.48 : 0.55}
                  travelingDot
                />
              </div>
              {/* Readability scrim: theme-aware (was light-only fallback and blew out dark glass) */}
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  zIndex: 1,
                  pointerEvents: 'none',
                  background: dark
                    ? 'linear-gradient(to bottom, color-mix(in oklab, var(--pbt-canvas) 94%, transparent) 0%, color-mix(in oklab, var(--pbt-canvas) 40%, transparent) 52%, transparent 100%)'
                    : 'linear-gradient(to bottom, rgba(255,255,255,0.85) 0%, rgba(255,255,255,0.28) 52%, transparent 100%)',
                }}
              />
              <div
                className="relative flex items-center gap-3"
                style={{ padding: 16, zIndex: 2 }}
              >
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 12,
                    flexShrink: 0,
                    background: `color-mix(in oklab, ${driverColors.soft} 80%, rgba(255,255,255,0.5))`,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: driverColors.primary,
                  }}
                >
                  <Icon.spark />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 15, color: 'var(--pbt-text)' }}>
                    Your ECHO profile
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--pbt-text-muted)', fontWeight: 500 }}>
                    {profile.primary} driver · tap to review
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
