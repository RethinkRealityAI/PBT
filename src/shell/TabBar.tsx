import { Glass } from '../design-system/Glass';
import { Icon } from '../design-system/Icon';
import { TABS } from '../app/routes';
import { useNavigation } from '../app/providers/NavigationProvider';
import { useProfile } from '../app/providers/ProfileProvider';
import { useTheme } from '../app/providers/ThemeProvider';
import { useFlags } from '../app/providers/FlagProvider';
import type { FlagKey } from '../services/flagsClient';
import { DRIVER_COLORS } from '../design-system/tokens';
import { useT } from '../i18n/useT';
import type { CatalogKey } from '../i18n/catalog';
import { logEvent } from '../lib/analytics';

const TAB_FLAG: Record<string, FlagKey> = {
  home: 'nav.tab.home.enabled',
  history: 'nav.tab.history.enabled',
  resources: 'nav.tab.resources.enabled',
  settings: 'nav.tab.settings.enabled',
};

/** Tab display labels — routes.ts keeps the English label as a stable id. */
const TAB_LABEL_KEY: Record<string, CatalogKey> = {
  home: 'tab.train',
  history: 'tab.history',
  resources: 'tab.library',
  settings: 'tab.you',
};

const FALLBACK_TAB_BG =
  'linear-gradient(180deg, oklch(0.66 0.22 22), oklch(0.56 0.24 18))';
const FALLBACK_TAB_SHADOW = '0 4px 12px -4px oklch(0.55 0.22 18 / 0.45)';

export function TabBar() {
  const { current, go } = useNavigation();
  const t = useT();
  const { profile } = useProfile();
  const { resolvedTheme } = useTheme();
  const { getFlag } = useFlags();
  const dark = resolvedTheme === 'dark';
  const dc = profile ? DRIVER_COLORS[profile.primary] : null;
  const visibleTabs = TABS.filter((t) => {
    const flag = TAB_FLAG[t.screen];
    return flag ? getFlag<boolean>(flag, true) : true;
  });
  const activeGradient = dc
    ? `linear-gradient(180deg, ${dc.primary}, ${dc.accent})`
    : FALLBACK_TAB_BG;
  const activeShadow = dc
    ? `0 4px 14px -4px color-mix(in oklab, ${dc.primary} 48%, transparent), 0 2px 6px -2px color-mix(in oklab, ${dc.accent} 28%, transparent)`
    : FALLBACK_TAB_SHADOW;

  return (
    <div
      className="pointer-events-none fixed bottom-0 left-1/2 z-30 w-full max-w-[var(--pbt-layout-max)] -translate-x-1/2 px-4 pb-[max(env(safe-area-inset-bottom),14px)] lg:hidden"
    >
      <Glass
        radius={9999}
        padding={6}
        tint={0.24}
        blur={40}
        className="pointer-events-auto"
      >
        <div className="flex items-center justify-between gap-1">
          {visibleTabs.map((tab) => {
            const active = current === tab.screen;
            const IconCmp = Icon[tab.iconKey];
            const label = TAB_LABEL_KEY[tab.screen]
              ? t(TAB_LABEL_KEY[tab.screen])
              : tab.label;
            return (
              <button
                key={tab.screen}
                onClick={() => {
                  if (tab.screen !== current) {
                    logEvent({ type: 'tab_change', screen: current, target: tab.screen });
                  }
                  go(tab.screen);
                }}
                aria-label={label}
                aria-pressed={active}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  height: 42,
                  flex: 1,
                  border: active
                    ? '1px solid color-mix(in oklab, var(--pbt-driver-primary) 35%, rgba(255,255,255,0.25))'
                    : '1px solid transparent',
                  borderRadius: 9999,
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  background: active ? activeGradient : 'transparent',
                  backdropFilter: undefined,
                  WebkitBackdropFilter: undefined,
                  color: active ? '#fff' : 'var(--pbt-text-muted)',
                  fontSize: 12,
                  fontWeight: 600,
                  fontFamily: 'var(--pbt-font-body)',
                  letterSpacing: '-0.01em',
                  boxShadow: active
                    ? [
                        '0 1px 0 rgba(255,255,255,0.38) inset',
                        '0 -1px 0 rgba(0,0,0,0.15) inset',
                        activeShadow,
                      ].join(', ')
                    : 'none',
                }}
              >
                <IconCmp />
                {active && <span>{label}</span>}
              </button>
            );
          })}
        </div>
      </Glass>
    </div>
  );
}
