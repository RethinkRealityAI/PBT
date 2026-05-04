import { Glass } from '../design-system/Glass';
import { Icon } from '../design-system/Icon';
import { TABS } from '../app/routes';
import { useNavigation } from '../app/providers/NavigationProvider';

export function TabBar() {
  const { current, go } = useNavigation();
  return (
    <div
      className="pointer-events-none fixed bottom-0 left-1/2 z-30 w-full max-w-[440px] -translate-x-1/2 px-4 pb-[max(env(safe-area-inset-bottom),14px)]"
    >
      <Glass
        radius={9999}
        padding={6}
        tint={0.32}
        blur={28}
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
                  border: 'none',
                  borderRadius: 9999,
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  background: active
                    ? 'linear-gradient(180deg, oklch(0.66 0.22 22), oklch(0.56 0.24 18))'
                    : 'transparent',
                  color: active ? '#fff' : 'var(--pbt-text)',
                  fontSize: 12,
                  fontWeight: 600,
                  fontFamily: 'var(--pbt-font-body)',
                  letterSpacing: '-0.01em',
                  boxShadow: active
                    ? '0 4px 12px -4px oklch(0.55 0.22 18 / 0.45)'
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
