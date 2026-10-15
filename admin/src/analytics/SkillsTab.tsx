import type { AnalyticsTabProps } from './AnalyticsDestination';
import { ContextBar, ScreenShell } from '../primitives/Shell';

/** Placeholder — being built. */
export function SkillsTab({ range, onRange }: AnalyticsTabProps) {
  return (
    <>
      <ContextBar title="Skills" range={range} onRange={onRange} />
      <ScreenShell>{null}</ScreenShell>
    </>
  );
}
