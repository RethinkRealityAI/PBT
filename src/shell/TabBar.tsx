import { Glass } from '../design-system/Glass';
import { Icon } from '../design-system/Icon';
import { TABS } from '../app/routes';
import { useNavigation } from '../app/providers/NavigationProvider';
import { useProfile } from '../app/providers/ProfileProvider';
import { useTheme } from '../app/providers/ThemeProvider';
import { DRIVER_COLORS } from '../design-system/tokens';

const FALLBACK_TAB_BG =
  'linear-gradient(180deg, oklch(0.66 0.22 22), oklch(0.56 0.24 18))';
const FALLBACK_TAB_SHADOW = '0 4px 12px -4px oklch(0.55 0.22 18 / 0.45)';

export function TabBar() {
  const { current, go } = useNavigation();
  const { profile } = useProfile();
  const { resolvedTheme } = useTheme();
  const dark = resolvedTheme === 'dark';
  const dc = profile ? DRIVER_COLORS[profile.primary] : null;
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
          {TABS.map((tab) => {
            const active = current === tab.screen;
            const IconCmp = Icon[tab.iconKey];
            return (
              <button
                key={tab.screen}
                onClick={() => go(tab.screen)}
                aria-label={tab.label}
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
                {active && <span>{tab.label}</span>}
              </button>
            );
          })}
        </div>
      </Glass>
    </div>
  );
}
