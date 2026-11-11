import { Glass } from '../design-system/Glass';
import { Icon } from '../design-system/Icon';
import { Tooltip, type TooltipPlacement } from '../design-system/Tooltip';
import { useTheme } from '../app/providers/ThemeProvider';
import { useT } from '../i18n/useT';

/**
 * The round light/dark switch of the TopBar and the chromeless screens
 * (onboarding). Icon-only, so its action shows on hover / keyboard focus.
 */
export function ThemeIconButton({
  placement = 'bottom',
  className = 'flex h-9 w-9 items-center justify-center',
}: {
  placement?: TooltipPlacement;
  className?: string;
}) {
  const { resolvedTheme, toggle } = useTheme();
  const t = useT();
  const label =
    resolvedTheme === 'dark' ? t('chrome.themeToggle.toLight') : t('chrome.themeToggle.toDark');
  return (
    <Tooltip label={label} placement={placement}>
      <Glass
        radius={9999}
        padding={0}
        tint={0.3}
        shine={false}
        onClick={toggle}
        ariaLabel={label}
        className={className}
      >
        {resolvedTheme === 'dark' ? <Icon.sun /> : <Icon.moon />}
      </Glass>
    </Tooltip>
  );
}
