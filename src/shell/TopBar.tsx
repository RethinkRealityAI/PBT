import type { ReactNode } from 'react';
import { Glass } from '../design-system/Glass';
import { Icon } from '../design-system/Icon';
import { useNavigation } from '../app/providers/NavigationProvider';
import { useTheme } from '../app/providers/ThemeProvider';

export interface TopBarProps {
  title?: string;
  showBack?: boolean;
  trailing?: ReactNode;
  /** Rich middle content (e.g. home greeting + driver). Overrides `title` when both are set. */
  center?: ReactNode;
}

export function TopBar({ title, showBack = false, trailing, center }: TopBarProps) {
  const { back } = useNavigation();
  const { resolvedTheme, toggle } = useTheme();

  const middle = center ?? (
    title ? (
      <h1
        style={{
          fontSize: 16,
          fontWeight: 600,
          letterSpacing: '-0.01em',
          margin: 0,
          color: 'var(--pbt-text)',
        }}
      >
        {title}
      </h1>
    ) : null
  );

  return (
    <div className="sticky top-0 z-20 flex items-center justify-between gap-3 px-4 pt-[max(env(safe-area-inset-top),22px)] pb-4 lg:hidden">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        {showBack && (
          <Glass
            radius={9999}
            padding={0}
            blur={20}
            tint={0.45}
            onClick={back}
            ariaLabel="Back"
            shine={false}
            className="flex h-9 w-9 shrink-0 items-center justify-center"
          >
            <Icon.back />
          </Glass>
        )}
        {middle && (
          <div className="min-w-0 flex-1 text-left">{middle}</div>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {trailing}
        <Glass
          radius={9999}
          padding={0}
          tint={0.3}
          shine={false}
          onClick={toggle}
          ariaLabel={`Switch to ${resolvedTheme === 'dark' ? 'light' : 'dark'} mode`}
          className="flex h-9 w-9 items-center justify-center"
        >
          {resolvedTheme === 'dark' ? <Icon.sun /> : <Icon.moon />}
        </Glass>
      </div>
    </div>
  );
}
