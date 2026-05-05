import { useState } from 'react';
import { Glass } from '../design-system/Glass';
import { DriverWave } from '../design-system/DriverWave';
import { Segmented } from '../design-system/Segmented';
import { Icon } from '../design-system/Icon';
import { TopBar } from '../shell/TopBar';
import { Page } from '../shell/Page';
import { useNavigation } from '../app/providers/NavigationProvider';
import { useProfile } from '../app/providers/ProfileProvider';
import { useSession } from '../app/providers/SessionProvider';
import { useTheme, type ThemeMode } from '../app/providers/ThemeProvider';
import { ECHO_DRIVERS } from '../data/echoDrivers';
import { DRIVER_COLORS } from '../design-system/tokens';
import { clearAllStorage } from '../lib/storage';
import { AccountUpgradeModal } from '../features/auth/AccountUpgradeModal';
import { getSupabase } from '../features/auth/supabaseClient';

export function SettingsScreen() {
  const { go, replace } = useNavigation();
  const { profile, setProfile } = useProfile();
  const { theme, setTheme } = useTheme();
  const { user } = useSession();
  const [authMode, setAuthMode] = useState<'signup' | 'signin' | null>(null);

  if (!profile) {
    return (
      <>
        <TopBar showBack title="You" />
        <Page withTabBar>
          <Glass radius={22} padding={22}>
            <p style={{ color: 'var(--pbt-text-muted)' }}>Take the quiz to set up your profile.</p>
          </Glass>
        </Page>
      </>
    );
  }

  const driver = ECHO_DRIVERS[profile.primary];
  const driverColors = DRIVER_COLORS[profile.primary];

  // Derive display identity from auth user; fall back to anonymous session
  const userMeta = (user as { user_metadata?: { display_name?: string } } | null)?.user_metadata;
  const displayName = userMeta?.display_name?.trim()
    || (user?.email ? user.email.split('@')[0] : null);
  const headerName = displayName ?? 'Anonymous session';
  const headerSubtitle = user?.email ?? (user ? '' : 'Not signed in');
  const avatarText = displayName
    ? displayName.trim().slice(0, 2).toUpperCase()
    : profile.primary[0];

  return (
    <>
      <TopBar title="You" />
      <Page withTabBar>
        <Glass
          radius={22}
          padding={20}
          glow={driverColors.primary}
          style={{ position: 'relative', overflow: 'hidden', marginBottom: 16 }}
        >
          <div
            aria-hidden
            style={{
              position: 'absolute',
              bottom: 0,
              left: 0,
              right: 0,
              height: 60,
              opacity: 0.4,
              pointerEvents: 'none',
            }}
          >
            <DriverWave driver={profile.primary} height={60} />
          </div>
          <div className="relative flex items-center gap-4">
            <div
              style={{
                width: 64,
                height: 64,
                borderRadius: '50%',
                background:
                  'linear-gradient(180deg, oklch(0.66 0.22 22), oklch(0.56 0.24 18))',
                color: '#fff',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontFamily: 'var(--pbt-font-mono)',
                fontSize: 20,
                fontWeight: 700,
                boxShadow: '0 6px 16px -6px oklch(0.55 0.22 18 / 0.5)',
              }}
            >
              {avatarText}
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 16, wordBreak: 'break-word' }}>{headerName}</div>
              {headerSubtitle && (
                <div style={{ fontSize: 13, color: 'var(--pbt-text-muted)', wordBreak: 'break-all' }}>
                  {headerSubtitle}
                </div>
              )}
              <div
                style={{
                  fontFamily: 'var(--pbt-font-mono)',
                  fontSize: 11,
                  letterSpacing: '0.10em',
                  textTransform: 'uppercase',
                  color: driverColors.primary,
                  marginTop: 2,
                  fontWeight: 700,
                }}
              >
                {driver.name}
              </div>
            </div>
          </div>
        </Glass>

        <SectionHeader>Practice</SectionHeader>
        <Glass radius={20} padding={4} style={{ marginBottom: 16 }}>
          <Row label="Theme">
            <Segmented
              value={theme}
              onChange={(v) => setTheme(v as ThemeMode)}
              ariaLabel="Theme"
              options={[
                { value: 'light', label: 'Light' },
                { value: 'dark', label: 'Dark' },
                { value: 'system', label: 'System' },
              ]}
            />
          </Row>
          <Row label="Retake ECHO Quiz" onClick={() => { setProfile(null); replace('quiz'); }}>
            <span style={{ color: 'var(--pbt-text-muted)' }}>→</span>
          </Row>
        </Glass>

        <SectionHeader>Account</SectionHeader>
        <Glass radius={20} padding={4} style={{ marginBottom: 16 }}>
          {user ? (
            <>
              <Row label="Signed in as">
                <span style={{ color: 'var(--pbt-text-muted)', fontSize: 12 }}>
                  {user.email}
                </span>
              </Row>
              <Row
                label="Sign out"
                onClick={async () => {
                  const sb = getSupabase();
                  if (sb) await sb.auth.signOut();
                }}
              >
                <span style={{ color: 'oklch(0.55 0.24 18)' }}>→</span>
              </Row>
            </>
          ) : (
            <>
              <Row label="Save your progress" onClick={() => setAuthMode('signup')}>
                <span style={{ color: driverColors.primary, fontWeight: 600 }}>
                  Sign up
                </span>
              </Row>
              <Row label="Sign in" onClick={() => setAuthMode('signin')}>
                <span style={{ color: 'var(--pbt-text-muted)' }}>→</span>
              </Row>
            </>
          )}
        </Glass>

        <AccountUpgradeModal
          open={authMode !== null}
          initialMode={authMode ?? 'signup'}
          onClose={() => setAuthMode(null)}
        />

        <SectionHeader>About</SectionHeader>
        <Glass radius={20} padding={4} style={{ marginBottom: 16 }}>
          <Row label="Privacy & data" onClick={() => go('onboarding')}>
            <span style={{ color: 'var(--pbt-text-muted)' }}>→</span>
          </Row>
          <Row label="Version" >
            <span style={{ color: 'var(--pbt-text-muted)', fontFamily: 'var(--pbt-font-mono)', fontSize: 11 }}>
              0.0.1
            </span>
          </Row>
          <Row
            label="Reset all local data"
            onClick={() => {
              if (confirm('This clears your profile, sessions, and settings. Continue?')) {
                clearAllStorage();
                window.location.reload();
              }
            }}
          >
            <span style={{ color: 'oklch(0.55 0.24 18)' }}>
              <Icon.close />
            </span>
          </Row>
        </Glass>
      </Page>
    </>
  );
}

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontFamily: 'var(--pbt-font-mono)',
        fontSize: 10,
        letterSpacing: '0.18em',
        textTransform: 'uppercase',
        color: 'var(--pbt-text-muted)',
        marginBottom: 8,
        paddingLeft: 4,
      }}
    >
      {children}
    </div>
  );
}

function Row({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick?: () => void;
  children?: React.ReactNode;
}) {
  return (
    <div
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 8,
        padding: '12px 14px',
        cursor: onClick ? 'pointer' : 'default',
        borderBottom: '0.5px solid rgba(60,20,15,0.06)',
      }}
    >
      <span style={{ fontSize: 14 }}>{label}</span>
      {children}
    </div>
  );
}
