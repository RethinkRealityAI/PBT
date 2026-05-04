import type { ReactNode } from 'react';
import { GradientBg } from '../design-system/GradientBg';
import { Sidebar } from './Sidebar';
import { useProfile } from '../app/providers/ProfileProvider';
import { DRIVER_COLORS } from '../design-system/tokens';

/**
 * Full-viewport ambient gradient + centered content rail.
 * Mobile/Tablet (< lg): 440px centered column (unchanged).
 * Desktop (≥ lg): sidebar + full-width content area side by side.
 *
 * The content rail has NO explicit z-index so it does NOT form its own
 * stacking context — essential for backdrop-filter on Glass elements to
 * sample the GradientBg bloom behind them.
 */
export function AppFrame({ children }: { children: ReactNode }) {
  const { profile } = useProfile();
  const colors = profile ? DRIVER_COLORS[profile.primary] : null;

  return (
    <div className="relative min-h-[100dvh] w-full" style={{ isolation: 'isolate' }}>
      <div
        className="pointer-events-none fixed inset-0"
        style={{ zIndex: 0 }}
        aria-hidden
      >
        <GradientBg
          primaryColor={colors?.primary ?? null}
          secondaryColor={colors?.accent ?? null}
        />
      </div>

      {/*
       * Rail — no z-index → no new stacking context → backdrop-filter works.
       * Mobile/tablet: centered 440px column (flex-col).
       * Desktop (lg+):  full-width flex-row with sidebar + scrollable content.
       */}
      <div
        className={[
          'relative flex h-[100dvh] min-h-0 w-full overflow-x-hidden overflow-y-hidden',
          // Mobile / tablet: centered narrow column
          'mx-auto max-w-[var(--pbt-layout-max)] flex-col',
          // Desktop: full-width side-by-side layout
          'lg:mx-0 lg:max-w-none lg:flex-row lg:overflow-x-visible',
        ].join(' ')}
        style={{
          fontFamily: 'var(--pbt-font-body)',
          color: 'var(--pbt-text)',
        }}
      >
        {/* Sidebar — hidden on mobile/tablet, 240px on desktop */}
        <Sidebar />

        {/* Content area — fills remaining space, maintains flex-col for screens */}
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {children}
        </div>
      </div>
    </div>
  );
}
