import { useState, useEffect, useRef, type CSSProperties, type MouseEvent } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Glass } from '../design-system/Glass';
import { DriverWave } from '../design-system/DriverWave';
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
import { LIBRARY_SCENARIOS, type Scenario } from '../data/scenarios';
import { ScenarioHints } from '../features/scenarios/ScenarioHints';
import { useResolvedLibraryScenarios } from '../data/useResolvedScenarios';
import { useFlag, useFlagValue, IfFlag } from '../app/providers/FlagProvider';
import { SaveProgressBanner } from '../features/auth/SaveProgressBanner';
import { useTheme } from '../app/providers/ThemeProvider';
import { readStorage, writeStorage, type StorageKeyDef } from '../lib/storage';

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
    glow: null,
    /* Match Glass default tint (0.18 light / 0.44 dark). */
    tint: dark ? 0.44 : 0.18,
    blur: dark ? 36 : 22,
  };
}

/**
 * Glassmorphic icon badge — transparent liquid glass, driver-colored border + icon.
 * Light: low white tint + strong saturate lets background bleed through.
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
      ? 'rgba(10, 10, 14, 0.18)'
      : 'rgba(255, 255, 255, 0.12)',
    border: `1px solid color-mix(in oklab, ${dc.primary} 38%, rgba(255,255,255,0.28))`,
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.28)',
  };
}

/** Small round controls (scenario arrows) — same glass + lift language as icon badges */
function roundGlassControlStyle(dc: DriverColors, dark: boolean): CSSProperties {
  return {
    border: `1px solid color-mix(in oklab, ${dc.primary} 42%, rgba(255,255,255,0.5))`,
    background: dark ? 'rgba(10,10,14,0.22)' : 'rgba(255,255,255,0.16)',
    backdropFilter: 'blur(12px) saturate(240%)',
    WebkitBackdropFilter: 'blur(12px) saturate(240%)',
    boxShadow: [
      'inset 0 1px 0 rgba(255,255,255,0.58)',
      'inset 0 -1px 0 rgba(0,0,0,0.05)',
      dark
        ? '0 6px 14px -5px rgba(0,0,0,0.44)'
        : '0 8px 16px -10px rgba(15,14,20,0.12), 0 1px 4px rgba(15,14,20,0.04)',
    ].join(', '),
  };
}

/** Subtitle animation: Acknowledge → dot → Clarify → dot → Transform, once per dashboard visit. */
const ACT_SUBTITLE_PARTS = ['Acknowledge', '·', 'Clarify', '·', 'Transform'] as const;

function AcTGuideCard({
  driverColors,
  dark,
  onClick,
}: {
  driverColors: typeof DRIVER_COLORS[keyof typeof DRIVER_COLORS];
  dark: boolean;
  onClick: () => void;
}) {
  return (
    <Glass
      radius={RADII.lg}
      padding="13px 16px"
      {...dashTileGlass(dark)}
      onClick={onClick}
      ariaLabel="ACT Guide"
      style={{ marginBottom: 14 }}
    >
      <div className="flex items-center gap-3">
        <div style={iconBadgeStyle(driverColors, dark)}>
          <Icon.layers />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 600, fontSize: 15, lineHeight: 1.15 }}>ACT Guide</div>
          <div
            style={{ fontSize: 12, lineHeight: 1.25, color: 'var(--pbt-text-muted)', whiteSpace: 'nowrap' }}
          >
            {ACT_SUBTITLE_PARTS.map((part, i) => (
              <motion.span
                key={`${part}-${i}`}
                initial={{ opacity: 0, x: part === '·' ? 0 : -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.34, ease: 'easeOut', delay: i * 0.22 }}
                style={{
                  display: 'inline-block',
                  color: part === '·' ? 'var(--pbt-text-muted)' : undefined,
                  padding: part === '·' ? '0 5px' : 0,
                }}
              >
                {part}
              </motion.span>
            ))}
          </div>
        </div>
      </div>
    </Glass>
  );
}

const DASHBOARD_WELCOMED_KEY: StorageKeyDef<boolean> = {
  key: 'dashboard_welcomed',
  fallback: false,
  validate: (v): v is boolean => typeof v === 'boolean',
};

const SEEN_START_HERE_KEY: StorageKeyDef<boolean> = {
  key: 'seen_start_here',
  fallback: false,
  validate: (v): v is boolean => typeof v === 'boolean',
};

export function HomeScreen() {
  const { go } = useNavigation();
  const { profile } = useProfile();
  const { user } = useSession();
  const { setScenario } = useScenario();
  const [pickIndex, setPickIndex] = useState(0);
  const [scoringInfoOpen, setScoringInfoOpen] = useState(false);
  const [scenarioInfoOpen, setScenarioInfoOpen] = useState(false);
  const { resolvedTheme } = useTheme();
  const dark = resolvedTheme === 'dark';
  const resolvedLibrary = useResolvedLibraryScenarios();
  const headlineOverride = useFlagValue<string>('field.home.headline', '');
  const showActCard = useFlag('component.home.act_guide_card', true);
  const showLibraryCard = useFlag('component.home.library_card', true);
  const showEchoCard = useFlag('component.home.echo_profile_card', true);
  const [welcomeOpen, setWelcomeOpen] = useState(() => !readStorage(DASHBOARD_WELCOMED_KEY));
  const [beaconActive, setBeaconActive] = useState(false);
  /** Ripples / Orb CSS pulse / breathing — off until Start Here → scoring modal is closed. */
  const [heroOrbMotion, setHeroOrbMotion] = useState(() => readStorage(SEEN_START_HERE_KEY));
  const pendingStartHereRef = useRef(false);

  useEffect(() => {
    const welcomed = readStorage(DASHBOARD_WELCOMED_KEY);
    const seenStart = readStorage(SEEN_START_HERE_KEY);
    if (!welcomed) {
      const closeT = window.setTimeout(() => {
        setWelcomeOpen(false);
        writeStorage(DASHBOARD_WELCOMED_KEY, true);
        if (!readStorage(SEEN_START_HERE_KEY)) setBeaconActive(true);
      }, 1800);
      return () => { window.clearTimeout(closeT); };
    } else if (!seenStart) {
      setBeaconActive(true);
    }
    return undefined;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!profile) return null;

  const driver = ECHO_DRIVERS[profile.primary];
  const driverColors = DRIVER_COLORS[profile.primary];
  const total = resolvedLibrary.length;
  const safeIndex = total === 0 ? 0 : pickIndex % total;
  // If an admin hides every scenario, fall back to the canonical first entry
  // so the hero card stays renderable. The Start button still routes correctly.
  const resolvedSlot = resolvedLibrary[safeIndex];
  const todaysPick = resolvedSlot?.scenario ?? LIBRARY_SCENARIOS[0];
  const todaysOverride = resolvedSlot?.override ?? null;
  const cardDriverKey =
    (todaysOverride?.card_driver_override as
      | 'Activator'
      | 'Energizer'
      | 'Analyzer'
      | 'Harmonizer'
      | null) ?? todaysPick.suggestedDriver;
  // Card-level driver tint can be detached from the AI's scenario driver so
  // an admin can theme a card differently from the conversation behaviour.
  const cardDriverColors = DRIVER_COLORS[cardDriverKey] ?? driverColors;
  const initials = getDisplayInitials(user);
  const displayName = getDisplayName(user);
  const headline = headlineOverride.trim() || `What pushback are\nyou ready for today?`;
  const cardTitle =
    todaysOverride?.card_title_override?.trim() ||
    todaysPick.pushback.title;
  const cardSubtitle =
    todaysOverride?.card_subtitle_override?.trim() ||
    `${todaysPick.breed}, ${todaysPick.age}. Driver: ${todaysPick.suggestedDriver}.`;
  const startButtonLabel =
    todaysOverride?.start_button_label?.trim() || 'Start scenario';
  const infoModalTitle = todaysOverride?.info_modal_title?.trim() || '';
  const infoModalBody = todaysOverride?.info_modal_body?.trim() || '';
  const hasScenarioInfo = infoModalBody.length > 0;

  const startTodaysPick = () => {
    setScenario(todaysPick);
    go('chat');
  };

  const dismissBeacon = () => {
    setBeaconActive(false);
    writeStorage(SEEN_START_HERE_KEY, true);
  };

  const handleScoringModalClosed = () => {
    setScoringInfoOpen(false);
    if (pendingStartHereRef.current) {
      pendingStartHereRef.current = false;
      dismissBeacon();
      setHeroOrbMotion(true);
    }
  };

  const openScoringInfo = (e: MouseEvent) => {
    e.stopPropagation();
    if (beaconActive) pendingStartHereRef.current = true;
    if (hasScenarioInfo) {
      setScenarioInfoOpen(true);
    } else {
      setScoringInfoOpen(true);
    }
  };

  return (
    <>
      <AnimatePresence>
        {welcomeOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4 }}
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 9999,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              backdropFilter: 'blur(24px) saturate(160%)',
              WebkitBackdropFilter: 'blur(24px) saturate(160%)',
              background: dark ? 'rgba(10,10,14,0.72)' : 'rgba(255,255,255,0.68)',
              gap: 28,
              padding: '0 24px',
            }}
          >
            {/*
              Post-quiz welcome only — driver orb is static here.
              The cycling “finding your driver” sequence runs on the quiz result screen (before results).
            */}
            <Orb driver={profile.primary} size={140} pulse={false} />
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15, duration: 0.45, ease: 'easeOut' }}
              style={{ textAlign: 'center' }}
            >
              <div
                style={{
                  fontSize: 26,
                  fontWeight: 400,
                  letterSpacing: '-0.02em',
                  color: 'var(--pbt-text)',
                  marginBottom: 8,
                }}
              >
                {displayName ? `Welcome, ${displayName}.` : 'Welcome, anonymous guest.'}
              </div>
              <div
                style={{
                  fontFamily: 'var(--pbt-font-mono)',
                  fontSize: 11,
                  letterSpacing: '0.14em',
                  textTransform: 'uppercase',
                  color: 'var(--pbt-text-muted)',
                }}
              >
                ECHO Driver &middot; {driver.name}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
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
      <Page withTabBar className="!pt-2 lg:!pt-6">
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
              {headline}
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
         * Right col (45%): save banner + quick actions + library + ECHO.
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
                {headline}
              </h1>

              <IfFlag flag="component.home.save_progress_banner">
                <SaveProgressBanner />
              </IfFlag>
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

            {/* ACT Guide — just above hero scenario card */}
            {showActCard && (
              <AcTGuideCard driverColors={driverColors} dark={dark} onClick={() => go('actGuide')} />
            )}

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
                  top: 58,
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
                {/* Ripple rings — gated until Start Here tour completes */}
                {heroOrbMotion &&
                  [0, 1, 2].map((i) => (
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
                {heroOrbMotion ? (
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
                ) : (
                  <div
                    aria-hidden
                    style={{
                      position: 'absolute',
                      inset: '-22%',
                      borderRadius: '50%',
                      background: `radial-gradient(closest-side, color-mix(in oklab, ${driverColors.primary} 22%, transparent), transparent 72%)`,
                      filter: 'blur(12px)',
                      pointerEvents: 'none',
                      opacity: 0.36,
                    }}
                  />
                )}
                <motion.div
                  style={{ position: 'relative' }}
                  animate={
                    heroOrbMotion ? { scale: [1.0, 1.045, 1.0] } : { scale: 1 }
                  }
                  transition={
                    heroOrbMotion
                      ? { duration: 3.6, repeat: Infinity, ease: 'easeInOut' }
                      : { duration: 0 }
                  }
                >
                  <Orb size={88} driver={profile.primary} pulse={heroOrbMotion} />
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
                  const title = cardTitle.replace('Switching brands', 'Switching\u00A0brands');
                  const words = title.split(' ');
                  return words.length > 4
                    ? words.slice(0, 4).join(' ') + '…'
                    : title;
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
                {cardSubtitle}
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
                  {startButtonLabel}
                </PillButton>
                <motion.div
                  style={{
                    flexShrink: 0,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 8,
                    borderRadius: 9999,
                    padding: beaconActive ? '4px 6px 4px 10px' : 0,
                  }}
                  animate={
                    beaconActive ? { scale: [1, 1.045, 1] } : { scale: 1 }
                  }
                  transition={
                    beaconActive
                      ? { duration: 1.15, repeat: Infinity, ease: 'easeInOut' }
                      : {}
                  }
                >
                  <AnimatePresence>
                    {beaconActive && (
                      <motion.span
                        initial={{ opacity: 0, x: 6 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 4 }}
                        transition={{ duration: 0.3, ease: 'easeOut' }}
                        style={{
                          fontFamily: 'var(--pbt-font-mono)',
                          fontSize: 10,
                          letterSpacing: '0.12em',
                          textTransform: 'uppercase',
                          fontWeight: 700,
                          color: driverColors.primary,
                          whiteSpace: 'nowrap',
                          pointerEvents: 'none',
                        }}
                      >
                        Start here →
                      </motion.span>
                    )}
                  </AnimatePresence>
                  <button
                    type="button"
                    aria-label="How sessions are scored"
                    onClick={openScoringInfo}
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
                </motion.div>
              </div>
              </div>
            </Glass>
          </div>

          {/* ── Right column: quick actions + library + ACT guide + ECHO profile ── */}
          <div>
            {/* Desktop-only save progress banner */}
            <IfFlag flag="component.home.save_progress_banner">
              <div className="hidden lg:block mb-4">
                <SaveProgressBanner />
              </div>
            </IfFlag>

            <div className="grid grid-cols-2 gap-3" style={{ marginBottom: 14 }}>
              {([
                { label: 'Build a scenario', sub: 'Custom pushback', icon: <Icon.plus />, screen: 'create' as const },
                { label: 'Pet Analyzer',     sub: 'BCS · MCS · kcal', icon: <Icon.paw />,  screen: 'analyzer' as const },
              ] as const).map(({ label, sub, icon, screen }) => (
                <Glass
                  key={screen}
                  radius={RADII.lg}
                  padding="12px 14px"
                  {...dashTileGlass(dark)}
                  onClick={() => go(screen)}
                  ariaLabel={label}
                >
                  <div className="flex items-start gap-2" style={{ minWidth: 0 }}>
                    <div style={{ ...iconBadgeStyle(driverColors, dark), flexShrink: 0, marginTop: 1 }}>
                      {icon}
                    </div>
                    <div style={{ minWidth: 0 }}>
                      {/* Title: wraps freely up to 2 lines, never truncates */}
                      <div
                        style={{
                          fontWeight: 600,
                          fontSize: 13,
                          lineHeight: 1.3,
                          display: '-webkit-box',
                          WebkitBoxOrient: 'vertical' as never,
                          WebkitLineClamp: 2,
                          overflow: 'hidden',
                        }}
                      >
                        {label}
                      </div>
                      {/* Subtitle: single line, ellipsis only if truly too long */}
                      <div
                        style={{
                          fontSize: 11,
                          color: 'var(--pbt-text-muted)',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          lineHeight: 1.3,
                          marginTop: 2,
                        }}
                      >
                        {sub}
                      </div>
                    </div>
                  </div>
                </Glass>
              ))}
            </div>

            {showLibraryCard && (
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
            )}

            {showEchoCard && (
            <Glass
              radius={RADII.lg}
              padding={16}
              {...dashTileGlass(dark)}
              onClick={() => go('result')}
              ariaLabel="Your ECHO driver profile"
              style={{ marginBottom: 14, minHeight: 72, position: 'relative', overflow: 'hidden' }}
            >
              {/* Driver wave at the bottom of the ECHO profile card */}
              <div
                aria-hidden
                style={{
                  position: 'absolute',
                  left: 0,
                  right: 0,
                  bottom: 0,
                  height: 52,
                  zIndex: 0,
                  pointerEvents: 'none',
                  overflow: 'hidden',
                  borderBottomLeftRadius: RADII.lg,
                  borderBottomRightRadius: RADII.lg,
                }}
              >
                <DriverWave
                  driver={profile.primary}
                  height={52}
                  opacity={dark ? 0.38 : 0.3}
                  speed={0.6}
                  amplitude={0.9}
                />
              </div>
              <div className="relative flex items-center gap-3" style={{ zIndex: 1 }}>
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
            )}
          </div>
        </div>
      </Page>
      <ScoringInfoModal open={scoringInfoOpen} onClose={handleScoringModalClosed} />
      <ScenarioInfoModal
        open={scenarioInfoOpen}
        title={infoModalTitle || cardTitle}
        body={infoModalBody}
        scenario={todaysPick}
        onClose={() => setScenarioInfoOpen(false)}
      />
    </>
  );
}

function ScenarioInfoModal({
  open,
  title,
  body,
  scenario,
  onClose,
}: {
  open: boolean;
  title: string;
  body: string;
  /** Scenario for surfacing the same ACT-aligned hints the Begin
   *  Simulation modal shows — gives the trainee a preview of what
   *  earns credit before they start. */
  scenario?: Scenario;
  onClose: () => void;
}) {
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.button
            type="button"
            aria-label="Close scenario info"
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
            initial={{ opacity: 0, scale: 0.94, x: '-50%', y: '-48%' }}
            animate={{ opacity: 1, scale: 1, x: '-50%', y: '-50%' }}
            exit={{ opacity: 0, scale: 0.94, x: '-50%', y: '-48%' }}
            transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
            className="pbt-scroll"
            style={{
              position: 'fixed',
              top: '50%',
              left: '50%',
              zIndex: 61,
              width: 'min(94vw, 480px)',
              maxHeight: '88vh',
              overflowY: 'auto',
              borderRadius: 28,
            }}
          >
            <Glass radius={28} padding="24px 22px" blur={26} tint={0.06}>
              <div className="flex items-start justify-between gap-3" style={{ marginBottom: 12 }}>
                <h2
                  style={{
                    margin: 0,
                    fontSize: 18,
                    fontWeight: 600,
                    lineHeight: 1.25,
                    letterSpacing: '-0.02em',
                  }}
                >
                  {title}
                </h2>
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
              {body && (
                <div
                  style={{
                    fontSize: 14,
                    lineHeight: 1.6,
                    color: 'var(--pbt-text)',
                    whiteSpace: 'pre-wrap',
                    fontWeight: 500,
                    marginBottom: scenario ? 14 : 0,
                  }}
                >
                  {body}
                </div>
              )}
              {scenario && <ScenarioHints scenario={scenario} />}
            </Glass>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

const SCORING_DIMENSIONS: Array<{ label: string; weight: string; description: string }> = [
  { label: 'Empathy & Tone', weight: '20%', description: 'Warm, non-judgmental language. Validate feelings before pivoting.' },
  { label: 'Active Listening', weight: '18%', description: 'Reflect back what the client said. Ask one specific clarifying question.' },
  { label: 'Objection Handling', weight: '18%', description: 'Acknowledge the concern, clarify the root cause, then transform with evidence.' },
  { label: 'Product Knowledge', weight: '14%', description: 'Cite Royal Canin specifics — 97% palatability, 12-week trial, BCS, MCS.' },
  { label: 'Confidence', weight: '12%', description: 'Speak with calm authority. No hedging, no shaming.' },
  { label: 'Closing', weight: '10%', description: 'Make a clear, specific recommendation the client can act on today.' },
  { label: 'Pacing', weight: '8%', description: "Match the client's rhythm. Don't rush past the emotion." },
];

/** OKLCH hues per dimension — pills + row accents (aligned with brand cherry / analyzer / harmonizer family). */
function hueForDimensionLabel(label: string): number {
  const h: Record<string, number> = {
    'Empathy & Tone': 24,
    'Active Listening': 238,
    'Objection Handling': 72,
    'Product Knowledge': 292,
    Confidence: 148,
    Closing: 168,
    Pacing: 258,
    Empathy: 24,
    Listening: 238,
    Objection: 72,
    Product: 292,
  };
  return h[label] ?? 28;
}

function exampleScorecardPillStyle(shortLabel: string, dark: boolean): CSSProperties {
  const hue = hueForDimensionLabel(shortLabel);
  return {
    padding: '5px 11px',
    borderRadius: 9999,
    fontSize: 11,
    fontWeight: 600,
    color: 'var(--pbt-text)',
    background: dark
      ? `color-mix(in oklab, oklch(0.48 0.1 ${hue}) 42%, oklch(0.20 0.04 20) 58%)`
      : `color-mix(in oklab, oklch(0.95 0.05 ${hue}) 62%, white)`,
    border: dark
      ? `1px solid color-mix(in oklab, oklch(0.62 0.14 ${hue}) 50%, oklch(0.35 0.04 20))`
      : `1px solid color-mix(in oklab, oklch(0.78 0.1 ${hue}) 70%, white)`,
    boxShadow: dark
      ? 'inset 0 1px 0 rgba(255,255,255,0.08)'
      : 'inset 0 1px 0 rgba(255,255,255,0.75), 0 1px 2px rgba(20,12,14,0.04)',
  };
}

function exampleScoreValueColor(shortLabel: string, dark: boolean): string {
  const hue = hueForDimensionLabel(shortLabel);
  return dark ? `oklch(0.78 0.12 ${hue})` : `oklch(0.40 0.16 ${hue})`;
}

/** Returns only the per-row accent override — layout/glass comes from className="pbt-glass-card". */
function dimensionAccentBorder(label: string): CSSProperties {
  const hue = hueForDimensionLabel(label);
  return {
    borderLeft: `4px solid color-mix(in oklab, oklch(0.62 0.15 ${hue}) 72%, transparent)`,
    marginBottom: 6,
  };
}

function ScoringInfoModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { resolvedTheme } = useTheme();
  const dark = resolvedTheme === 'dark';

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
            className="pbt-scroll"
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
                    How you're scored
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

              {/* How scenarios work */}
              <div className="pbt-glass-card" style={{ marginBottom: 16, padding: '13px 15px' }}>
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
                  How scenarios work
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                    <span
                      style={{
                        fontFamily: 'var(--pbt-font-mono)',
                        fontSize: 10,
                        letterSpacing: '0.1em',
                        textTransform: 'uppercase',
                        color: 'var(--pbt-text)',
                        opacity: dark ? 0.85 : 0.72,
                        fontWeight: 700,
                        paddingTop: 2,
                        flexShrink: 0,
                        minWidth: 44,
                      }}
                    >
                      Voice
                    </span>
                    <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.6, color: 'var(--pbt-text)', fontWeight: 550 }}>
                      A live conversation — the AI customer speaks and listens in real time. Respond naturally, as you would on the clinic floor.
                    </p>
                  </div>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                    <span
                      style={{
                        fontFamily: 'var(--pbt-font-mono)',
                        fontSize: 10,
                        letterSpacing: '0.1em',
                        textTransform: 'uppercase',
                        color: 'var(--pbt-text)',
                        opacity: dark ? 0.85 : 0.72,
                        fontWeight: 700,
                        paddingTop: 2,
                        flexShrink: 0,
                        minWidth: 44,
                      }}
                    >
                      Chat
                    </span>
                    <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.6, color: 'var(--pbt-text)', fontWeight: 550 }}>
                      Turn-based — the AI sends a message, you reply, and so on. Take your time crafting each response.
                    </p>
                  </div>
                  <p
                    style={{
                      margin: 0,
                      fontSize: 13,
                      lineHeight: 1.6,
                      color: 'var(--pbt-text)',
                      fontWeight: 500,
                      opacity: dark ? 0.88 : 0.92,
                    }}
                  >
                    The session ends automatically once the AI determines the conversation has reached a natural close — usually after you have acknowledged the concern, clarified the facts, and reframed the value.
                  </p>
                </div>
              </div>

              {/* Intro */}
              <div className="pbt-glass-card" style={{ marginBottom: 16, padding: '13px 15px' }}>
                <p style={{ margin: 0, fontSize: 14, lineHeight: 1.65, color: 'var(--pbt-text)', fontWeight: 540 }}>
                  Each session is scored 0–100 across seven dimensions and rolled into a weighted overall score.
                  The fastest path to a high score: <strong style={{ fontWeight: 800 }}>Acknowledge → Clarify → Transform</strong> — don't pitch product before the client feels heard.
                </p>
              </div>

              {/* Example scorecard preview */}
              <div className="pbt-glass-card" style={{ marginBottom: 16, padding: 16 }}>
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
                <div className="flex flex-wrap gap-2" style={{ marginBottom: 10 }}>
                  {[
                    { l: 'Empathy', v: 92 },
                    { l: 'Listening', v: 88 },
                    { l: 'Objection', v: 85 },
                    { l: 'Product', v: 82 },
                    { l: 'Confidence', v: 89 },
                    { l: 'Closing', v: 84 },
                    { l: 'Pacing', v: 86 },
                  ].map((m) => (
                    <span key={m.l} style={exampleScorecardPillStyle(m.l, dark)}>
                      {m.l}{' '}
                      <span style={{ color: exampleScoreValueColor(m.l, dark), fontWeight: 800 }}>{m.v}</span>
                    </span>
                  ))}
                </div>
                <p style={{ margin: 0, fontSize: 13, lineHeight: 1.55, color: 'var(--pbt-text)', fontWeight: 540 }}>
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
                {SCORING_DIMENSIONS.map((d) => {
                  const hue = hueForDimensionLabel(d.label);
                  return (
                    <div
                      key={d.label}
                      className="pbt-glass-card flex items-start gap-2.5"
                      style={dimensionAccentBorder(d.label)}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          style={{
                            fontSize: 13.5,
                            fontWeight: 700,
                            color: 'var(--pbt-text)',
                            marginBottom: 3,
                            letterSpacing: '-0.005em',
                          }}
                        >
                          {d.label}
                        </div>
                        <div
                          style={{
                            fontSize: 12.5,
                            lineHeight: 1.5,
                            color: 'var(--pbt-text-muted)',
                          }}
                        >
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
                          padding: '5px 9px',
                          borderRadius: 9999,
                          background: dark
                            ? `color-mix(in oklab, oklch(0.42 0.1 ${hue}) 38%, transparent)`
                            : `color-mix(in oklab, oklch(0.94 0.06 ${hue}) 72%, white)`,
                          border: `1px solid color-mix(in oklab, oklch(0.62 0.12 ${hue}) 44%, transparent)`,
                          color: 'var(--pbt-text)',
                        }}
                      >
                        {d.weight}
                      </span>
                    </div>
                  );
                })}
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
              <div className="pbt-glass-card" style={{ marginBottom: 12, padding: 15 }}>
                <p style={{ margin: '0 0 11px', fontSize: 13, lineHeight: 1.58, color: 'var(--pbt-text)', fontWeight: 540 }}>
                  The customer's receptiveness moves through three states. Watch the dot under the orb to see how
                  you're doing in real time:
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                  {[
                    { c: 'oklch(0.55 0.22 18)', l: 'Red — Defensive', t: 'They start here. Push back, repeat the concern. Acknowledge feelings before anything else.' },
                    { c: 'oklch(0.72 0.19 80)', l: 'Yellow — Receptive', t: 'They feel heard. Ask one specific clarifying question to surface the real concern.' },
                    { c: 'oklch(0.58 0.18 145)', l: 'Green — Convinced', t: "They're ready to act. Offer a concrete Royal Canin recommendation and the 12-week trial — the session ends as resolved." },
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
                        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--pbt-text)', marginBottom: 2 }}>{row.l}</div>
                        <div style={{ fontSize: 12.5, lineHeight: 1.5, color: 'var(--pbt-text-muted)' }}>
                          {row.t}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                <p
                  style={{
                    margin: '11px 0 0',
                    fontSize: 12.5,
                    lineHeight: 1.55,
                    color: 'var(--pbt-text)',
                    fontStyle: 'italic',
                    opacity: dark ? 0.88 : 0.9,
                    fontWeight: 480,
                  }}
                >
                  If you can't move them past Red after ~15 turns, the session ends as a "stalemate." Either way,
                  the full transcript is scored against the seven dimensions above.
                </p>
              </div>

              <p
                style={{
                  margin: '4px 0 0',
                  fontSize: 12,
                  lineHeight: 1.5,
                  color: 'var(--pbt-text)',
                  textAlign: 'center',
                  fontStyle: 'italic',
                  opacity: dark ? 0.72 : 0.78,
                  fontWeight: 500,
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
