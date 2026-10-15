/**
 * Trainees — per-person analytics. Without a record id it is the roster (who
 * is practising, who needs a nudge); `#/analytics/trainees/<userId>` opens
 * that person's profile.
 */
import type { AnalyticsTabProps } from './AnalyticsDestination';
import { TraineeRoster } from './trainee/TraineeRoster';
import { TraineeProfile } from './trainee/TraineeProfile';

export function TraineesTab(props: AnalyticsTabProps) {
  return props.recordId ? <TraineeProfile {...props} userId={props.recordId} /> : <TraineeRoster {...props} />;
}
