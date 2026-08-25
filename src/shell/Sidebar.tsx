import type { ReactElement, SVGAttributes } from 'react';
import { DriverWave } from '../design-system/DriverWave';
import { Icon } from '../design-system/Icon';
import { useNavigation } from '../app/providers/NavigationProvider';
import { useProfile } from '../app/providers/ProfileProvider';
import { useTheme } from '../app/providers/ThemeProvider';
import { LocaleToggle } from './LocaleToggle';
import { useFlags } from '../app/providers/FlagProvider';
import type { FlagKey } from '../services/flagsClient';
import { PRE_ONBOARDING_SCREENS, type Screen } from '../app/routes';
import { useT } from '../i18n/useT';
import type { CatalogKey } from '../i18n/catalog';
import { logEvent } from '../lib/analytics';

interface NavItem {
  screen: Screen;
  labelKey: CatalogKey;
  icon: (props: SVGAttributes<SVGSVGElement>) => ReactElement;
  flag?: FlagKey;
}

/** Train / History / Library share the tab-bar labels; the rest are sidebar-only. */
const NAV_ITEMS: NavItem[] = [
  { screen: 'home', labelKey: 'tab.train', icon: Icon.flame },
  { screen: 'create', labelKey: 'chrome.nav.create', icon: Icon.plus, flag: 'nav.sidebar.create.enabled' },
  { screen: 'history', labelKey: 'tab.history', icon: Icon.history, flag: 'nav.sidebar.history.enabled' },
  { screen: 'analyzer', labelKey: 'chrome.nav.analyzer', icon: Icon.paw, flag: 'nav.sidebar.analyzer.enabled' },
  { screen: 'resources', labelKey: 'tab.library', icon: Icon.book, flag: 'nav.sidebar.resources.enabled' },
  { screen: 'settings', labelKey: 'chrome.nav.profile', icon: Icon.user },
];

/**
 * Desktop-only left sidebar (hidden on < lg).
 * Handles navigation, driver wave, and theme toggle.
 * Must NOT create its own stacking context (no explicit z-index) so that
 * backdrop-filter inside Glass elements can sample the GradientBg behind it.
 */
export function Sidebar() {
  const { current, go } = useNavigation();
  const { profile } = useProfile();
  const { resolvedTheme, toggle } = useTheme();
  const { getFlag } = useFlags();
  const t = useT();
  const visibleNav = NAV_ITEMS.filter((n) => !n.flag || getFlag<boolean>(n.flag, true));

  // Hide the desktop sidebar until the user has completed onboarding: a locked
  // ECHO profile must exist AND we must be past the pre-onboarding flow
  // (onboarding / terms / quiz / result). Otherwise a first-time desktop user
  // sees nav to gated areas they haven't unlocked yet. Returning null lets the
  // content area take the full width during onboarding.
  if (!profile || PRE_ONBOARDING_SCREENS.includes(current)) return null;

  return (
    <aside
      className="hidden lg:flex flex-col"
      style={{
        width: 240,
        flexShrink: 0,
        height: '100dvh',
        position: 'sticky',
        top: 0,
        borderRight: '1px solid var(--pbt-glass-border)',
        backdropFilter: 'blur(24px) saturate(260%) brightness(1.03)',
        WebkitBackdropFilter: 'blur(24px) saturate(260%) brightness(1.03)',
        background:
          'linear-gradient(165deg, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0.06) 50%, rgba(255,255,255,0.10) 100%)',
        boxShadow: 'inset -1px 0 0 rgba(255,255,255,0.55)',
        overflowY: 'auto',
        overflowX: 'hidden',
      }}
    >
      {/* Logo area */}
      <div style={{ padding: '28px 20px 24px' }}>
        <div
          style={{
            fontFamily: 'var(--pbt-font-mono)',
            fontSize: 18,
            fontWeight: 700,
            letterSpacing: '-0.01em',
            color: 'var(--pbt-text)',
            lineHeight: 1,
          }}
        >
          PBT
        </div>
        <div
          style={{
            fontFamily: 'var(--pbt-font-mono)',
            fontSize: 9,
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
            color: 'var(--pbt-text-muted)',
            marginTop: 5,
          }}
        >
          {t('chrome.brand.tagline')}
        </div>
      </div>

      {/* Divider */}
      <div
        style={{
          margin: '0 20px 16px',
          height: 1,
          background: 'var(--pbt-glass-border)',
        }}
      />

      {/* Nav items */}
      <nav
        style={{
          flex: 1,
          padding: '0 12px',
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
        }}
      >
        {visibleNav.map(({ screen, labelKey, icon: IconCmp }) => {
          const active = current === screen;
          const label = t(labelKey);
          return (
            <button
              key={screen}
              type="button"
              onClick={() => {
                // Same navigation-analytics event the mobile TabBar emits, so
                // desktop navigation shows up in the admin Analytics screens.
                if (screen !== current) {
                  logEvent({ type: 'tab_change', screen: current, target: screen });
                }
                go(screen);
              }}
              aria-label={label}
              aria-current={active ? 'page' : undefined}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 11,
                padding: '10px 14px',
                borderRadius: 14,
                border: 'none',
                cursor: 'pointer',
                background: active
                  ? 'linear-gradient(180deg, oklch(0.66 0.22 22), oklch(0.56 0.24 18))'
                  : 'transparent',
                color: active ? '#fff' : 'var(--pbt-text)',
                fontFamily: 'var(--pbt-font-body)',
                fontSize: 14,
                fontWeight: active ? 600 : 400,
                letterSpacing: '-0.01em',
                boxShadow: active
                  ? '0 4px 12px -4px oklch(0.55 0.22 18 / 0.45)'
                  : 'none',
                transition: 'all 0.2s ease',
                textAlign: 'left',
                width: '100%',
              }}
            >
              <IconCmp
                style={{ flexShrink: 0, width: 18, height: 18 }}
                aria-hidden
              />
              {label}
            </button>
          );
        })}
      </nav>

      {/* Driver wave */}
      {profile && (
        <div
          aria-hidden
          style={{
            height: 52,
            margin: '12px 0 0',
            overflow: 'hidden',
            opacity: 0.65,
          }}
        >
          <DriverWave
            driver={profile.primary}
            height={52}
            amplitude={0.9}
            speed={0.7}
            opacity={0.9}
          />
        </div>
      )}

      {/* Bottom bar: theme label + toggle */}
      <div
        style={{
          padding: '12px 20px',
          paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 20px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
        }}
      >
        <span
          style={{
            fontFamily: 'var(--pbt-font-mono)',
            fontSize: 9,
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            color: 'var(--pbt-text-muted)',
          }}
        >
          {resolvedTheme === 'dark'
            ? t('chrome.theme.dark')
            : t('chrome.theme.light')}
        </span>
        <LocaleToggle />
        <button
          type="button"
          onClick={toggle}
          aria-label={
            resolvedTheme === 'dark'
              ? t('chrome.themeToggle.toLight')
              : t('chrome.themeToggle.toDark')
          }
          style={{
            width: 34,
            height: 34,
            borderRadius: '50%',
            border: '1px solid var(--pbt-glass-border)',
            background: 'rgba(255,255,255,0.22)',
            backdropFilter: 'blur(18px)',
            WebkitBackdropFilter: 'blur(18px)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--pbt-text)',
            flexShrink: 0,
          }}
        >
          {resolvedTheme === 'dark' ? (
            <Icon.sun style={{ width: 16, height: 16 }} />
          ) : (
            <Icon.moon style={{ width: 16, height: 16 }} />
          )}
        </button>
      </div>
    </aside>
  );
}
