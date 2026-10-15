import type { AnalyticsTabProps } from './AnalyticsDestination';
import { ContextBar, ScreenShell } from '../primitives/Shell';

/** Placeholder — being built. */
export function SessionsTab({ range, onRange }: AnalyticsTabProps) {
  return (
    <>
      <ContextBar title="Sessions" range={range} onRange={onRange} />
      <ScreenShell>{null}</ScreenShell>
    </>
  );
}
