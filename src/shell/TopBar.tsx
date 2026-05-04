import type { ReactNode } from 'react';
import { Glass } from '../design-system/Glass';
import { Icon } from '../design-system/Icon';
import { useNavigation } from '../app/providers/NavigationProvider';

export interface TopBarProps {
  title?: string;
  showBack?: boolean;
  trailing?: ReactNode;
}

export function TopBar({ title, showBack = false, trailing }: TopBarProps) {
  const { back } = useNavigation();
  return (
    <div className="sticky top-0 z-20 flex items-center justify-between gap-3 px-4 pt-[max(env(safe-area-inset-top),14px)] pb-3">
      <div style={{ width: 36 }}>
        {showBack && (
          <Glass
            radius={9999}
            padding={0}
            blur={20}
            tint={0.45}
            onClick={back}
            ariaLabel="Back"
            shine={false}
            className="flex h-9 w-9 items-center justify-center"
          >
            <Icon.back />
          </Glass>
        )}
      </div>
      {title && (
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
      )}
      <div style={{ minWidth: 36 }} className="flex items-center gap-2">
        {trailing}
      </div>
    </div>
  );
}
