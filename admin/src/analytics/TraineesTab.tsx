import type { AnalyticsTabProps } from './AnalyticsDestination';
import { ContextBar, ScreenShell } from '../primitives/Shell';

/** Placeholder — being built. */
export function TraineesTab({ range, onRange }: AnalyticsTabProps) {
  return (
    <>
      <ContextBar title="Trainees" range={range} onRange={onRange} />
      <ScreenShell>{null}</ScreenShell>
    </>
  );
}
