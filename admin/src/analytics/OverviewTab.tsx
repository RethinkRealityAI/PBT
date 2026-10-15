import type { AnalyticsTabProps } from './AnalyticsDestination';
import { ContextBar, ScreenShell } from '../primitives/Shell';

/** Placeholder — being built. */
export function OverviewTab({ range, onRange }: AnalyticsTabProps) {
  return (
    <>
      <ContextBar title="Overview" range={range} onRange={onRange} />
      <ScreenShell>{null}</ScreenShell>
    </>
  );
}
