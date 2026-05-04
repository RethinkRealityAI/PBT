import { useState } from 'react';
import { motion } from 'motion/react';
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
                {/* Ripple rings */}
                {[0, 1, 2].map((i) => (
                  <motion.div
                    key={i}
                    aria-hidden
                    style={{
                      position: 'absolute',
                      inset: 0,
                      borderRadius: '50%',
                      border: `1px solid ${driverColors.primary}`,
                      opacity: 0,
                    }}
                    animate={{ scale: [1, 2.2], opacity: [0.35, 0] }}
                    transition={{ duration: 2.8, repeat: Infinity, delay: i * 0.9, ease: 'easeOut' }}
                  />
                ))}
                {/* Breathing orb */}
                <motion.div
                  animate={{ scale: [1.0, 1.04, 1.0] }}
                  transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
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
              {/* Wave sits in bottom half only */}
              <div
                style={{
                  position: 'absolute',
                  bottom: 0,
                  left: 0,
                  right: 0,
                  height: '70%',
                  pointerEvents: 'none',
                }}
              >
                <DriverWave
                  driver={profile.primary}
                  height={52}
                  synthwave
                  amplitude={1.1}
                  speed={0.85}
                  opacity={0.6}
                />
              </div>
              {/* Gradient shield: opaque at top, transparent at bottom */}
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  background: 'linear-gradient(to bottom, var(--pbt-glass-bg, rgba(255,255,255,0.72)) 55%, transparent 100%)',
                  pointerEvents: 'none',
                }}
              />
              <div className="relative flex items-center gap-3" style={{ padding: 16 }}>
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 12,
                    flexShrink: 0,
                    background: `color-mix(in oklab, ${driverColors.primary} 22%, transparent)`,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: driverColors.primary,
                  }}
                >
                  <Icon.spark />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 15 }}>
                    Your ECHO profile
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--pbt-text-muted)' }}>
                    {profile.primary} driver · tap to review
                  </div>
                </div>
                <div
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    background: driverColors.primary,
                    boxShadow: `0 0 8px 2px ${driverColors.primary}`,
                    flexShrink: 0,
                  }}
                />
              </div>
            </Glass>
          </div>
        </div>
      </Page>
    </>
  );
}
