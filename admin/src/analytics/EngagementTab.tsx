import type { AnalyticsTabProps } from './AnalyticsDestination';
import { ContextBar, ScreenShell } from '../primitives/Shell';

/** Placeholder — being built. */
export function EngagementTab({ range, onRange }: AnalyticsTabProps) {
  return (
    <>
      <ContextBar title="Engagement" range={range} onRange={onRange} />
      <ScreenShell>{null}</ScreenShell>
    </>
  );
}
