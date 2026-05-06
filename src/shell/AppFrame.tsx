import type { ReactNode } from 'react';
import { GradientBg } from '../design-system/GradientBg';
import { Sidebar } from './Sidebar';
import { useProfile } from '../app/providers/ProfileProvider';
import { DRIVER_COLORS } from '../design-system/tokens';

const BRAND_RED = 'oklch(0.62 0.22 25)';

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
        {/*
         * Global background: driver top-orbs (PBT-branded upper blooms) +
         * soft rainbow bottom wash. The top two bloom positions use the active
         * driver color; the bottom two use the balanced 4-driver palette so there
         * is no persistent warm-red accent and the rest of the UI feels multicolor.
         */}
        <GradientBg
          multicolor
          primaryColor={colors?.primary ?? BRAND_RED}
          secondaryColor={colors?.accent ?? BRAND_RED}
        />
      </div>

      {/*
       * Rail — no z-index → no new stacking context → backdrop-filter works.
       * Mobile/tablet: centered 440px column (flex-col).
       * Desktop (lg+):  full-width flex-row with sidebar + scrollable content.
       */}
      <div
        className={[
          'relative flex h-[100dvh] min-h-0 w-full overflow-x-hidden overflow-y-hidden flex-col',
          'mx-auto max-w-[var(--pbt-layout-max)]',
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
