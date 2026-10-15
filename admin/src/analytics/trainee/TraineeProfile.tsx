import type { AnalyticsTabProps } from '../AnalyticsDestination';
import { ContextBar, ScreenShell } from '../../primitives/Shell';

export function TraineeProfile({ range, onRange }: AnalyticsTabProps & { userId: string }) {
  return (
    <>
      <ContextBar title="Trainee" range={range} onRange={onRange} />
      <ScreenShell>{null}</ScreenShell>
    </>
  );
}
