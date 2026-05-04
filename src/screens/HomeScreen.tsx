import { useState } from 'react';
import { Glass } from '../design-system/Glass';
import { Orb } from '../design-system/Orb';
import { Icon } from '../design-system/Icon';
import { PillButton } from '../design-system/PillButton';
import { DriverWave } from '../design-system/DriverWave';
import { TopBar } from '../shell/TopBar';
import { Page } from '../shell/Page';
import { useNavigation } from '../app/providers/NavigationProvider';
import { useProfile } from '../app/providers/ProfileProvider';
import { useTheme } from '../app/providers/ThemeProvider';
import { useScenario } from '../app/providers/ScenarioProvider';
import { ECHO_DRIVERS } from '../data/echoDrivers';
import { DRIVER_COLORS } from '../design-system/tokens';
import { SEED_SCENARIOS } from '../data/scenarios';
import { SaveProgressBanner } from '../features/auth/SaveProgressBanner';

export function HomeScreen() {
  const { go } = useNavigation();
  const { profile } = useProfile();
  const { resolvedTheme, toggle } = useTheme();
  const { setScenario } = useScenario();
  if (!profile) return null;

  const driver = ECHO_DRIVERS[profile.primary];
  const driverColors = DRIVER_COLORS[profile.primary];
  const [pickIndex, setPickIndex] = useState(0);
  const todaysPick = SEED_SCENARIOS[pickIndex];
  const total = SEED_SCENARIOS.length;

  const startTodaysPick = () => {
    setScenario(todaysPick);
    go('chat');
  };

  return (
    <>
      <TopBar
        trailing={
          <>
            <Glass
              radius={9999}
              padding={0}
              tint={0.45}
              shine={false}
              onClick={toggle}
              ariaLabel={`Switch to ${resolvedTheme === 'dark' ? 'light' : 'dark'} mode`}
              className="flex h-9 w-9 items-center justify-center"
            >
              {resolvedTheme === 'dark' ? <Icon.sun /> : <Icon.moon />}
            </Glass>
            <Glass
              radius={9999}
              padding={0}
              tint={0.45}
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
              {profile.primary[0]}
            </Glass>
          </>
        }
      />
      <Page withTabBar>
        <div style={{ marginBottom: 4, fontSize: 14, color: 'var(--pbt-text-muted)' }}>
          Good day
        </div>
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

        <Glass
          radius={26}
          padding={22}
          glow={driverColors.primary}
          style={{ minHeight: 200, position: 'relative', marginBottom: 14 }}
        >
          <div
            style={{
              position: 'absolute',
              top: 14,
              right: 14,
              opacity: 0.85,
            }}
          >
            <Orb size={84} />
          </div>

          {/* Header row: eyebrow + scenario counter */}
          <div className="flex items-center justify-between" style={{ marginBottom: 8 }}>
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
                  border: 'none',
                  background: 'rgba(255,255,255,0.45)',
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
                  border: 'none',
                  background: 'rgba(255,255,255,0.45)',
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
            <PillButton variant="glass" onClick={() => go('create')}>
              Custom
            </PillButton>
          </div>
        </Glass>

        <div className="grid grid-cols-2 gap-3" style={{ marginBottom: 14 }}>
          <Glass
            radius={20}
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
                  background: 'rgba(255,255,255,0.5)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--pbt-text)',
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
            radius={20}
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
                  background: 'rgba(255,255,255,0.5)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--pbt-text)',
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
          radius={20}
          padding={16}
          onClick={() => go('resources')}
          ariaLabel="Library"
          style={{ marginBottom: 14 }}
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
          radius={20}
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
      </Page>
    </>
  );
}
