import { Glass } from '../design-system/Glass';
import { Icon } from '../design-system/Icon';
import { useTheme } from '../app/providers/ThemeProvider';
import { useNavigation } from '../app/providers/NavigationProvider';
import { SCREENS_WITH_TAB_BAR } from '../app/routes';

/**
 * Fixed bottom-right theme switch (within centered rail). Sits above the tab bar when visible.
 * Kept deliberately small (32px visual, 44px tap target via padding) so it never occludes
 * interactive content like quiz rows.
 */
export function ThemeToggle() {
  const { current } = useNavigation();
  const tabBarVisible = SCREENS_WITH_TAB_BAR.includes(current);
  const { resolvedTheme, toggle } = useTheme();

  const label =
    resolvedTheme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode';
  const IconCmp = resolvedTheme === 'dark' ? Icon.sun : Icon.moon;

  return (
    <div
      className="pointer-events-none fixed left-1/2 z-[35] w-full max-w-[var(--pbt-layout-max)] -translate-x-1/2"
      style={{
        bottom: tabBarVisible
          ? 'calc(env(safe-area-inset-bottom, 0px) + 76px)'
          : 'max(12px, env(safe-area-inset-bottom, 0px))',
      }}
    >
      <div className="flex justify-end px-3">
        {/* Opacity wrapper: recedes to 70% at rest, full on hover/focus */}
        <div className="pointer-events-auto opacity-70 transition-opacity duration-200 hover:opacity-100 focus-within:opacity-100">
          <Glass
            radius={9999}
            padding={6}
            tint={0.22}
            blur={28}
          >
            <button
              type="button"
              onClick={toggle}
              aria-label={label}
              className="flex size-8 cursor-pointer items-center justify-center rounded-full border-0 bg-transparent p-0 text-[var(--pbt-text)]"
            >
              <IconCmp aria-hidden className="size-4" />
            </button>
          </Glass>
        </div>
      </div>
    </div>
  );
}
