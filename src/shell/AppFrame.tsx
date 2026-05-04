import type { ReactNode } from 'react';
import { GradientBg } from '../design-system/GradientBg';
import { useProfile } from '../app/providers/ProfileProvider';
import { DRIVER_COLORS } from '../design-system/tokens';

export function AppFrame({ children }: { children: ReactNode }) {
  const { profile } = useProfile();
  const colors = profile ? DRIVER_COLORS[profile.primary] : null;

  return (
    <div
      className="relative mx-auto h-[100dvh] w-full max-w-[440px] overflow-hidden"
      style={{
        fontFamily: 'var(--pbt-font-body)',
        color: 'var(--pbt-text)',
      }}
    >
      {/* Background layer — purely visual, must not be an ancestor of scrollable content */}
      <GradientBg
        primaryColor={colors?.primary ?? null}
        secondaryColor={colors?.accent ?? null}
      />
      {/* Content layer — sibling of GradientBg so overflow:hidden on GradientBg can't trap scrollTop */}
      <div className="relative z-10 flex h-full w-full flex-col">{children}</div>
    </div>
  );
}
