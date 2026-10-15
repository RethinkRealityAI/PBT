/**
 * The Analytics destination — one place for everything the portal measures.
 *
 * Replaces three destinations that repeated each other (Overview, Analytics
 * [Insights | Traffic | AI quality] and Activity [Sessions | Pet Analyzer]):
 *
 *   overview    the platform at a glance + what needs attention (landing tab)
 *   trainees    per-person analytics: roster → profile (`#/analytics/trainees/<id>`)
 *   sessions    every conversation; `#/analytics/sessions/<id>` opens one
 *   skills      how well the team handles pushback (was Insights)
 *   engagement  how the app is used (was Traffic)
 *   quality     AI failures, speed and cost
 *   analyzer    Pet Analyzer results
 *
 * The date range and search box are shared state owned by App, so a window
 * picked on one tab holds on the next; data is cached per window
 * (`./data.ts`), so moving between tabs doesn't refetch.
 */
import type { AdminScreen } from '../primitives/nav';
import type { Range } from './lib/period';
import { OverviewTab } from './OverviewTab';
import { TraineesTab } from './TraineesTab';
import { SessionsTab } from './SessionsTab';
import { SkillsTab } from './SkillsTab';
import { EngagementTab } from './EngagementTab';
import { QualityScreen } from '../screens/QualityScreen';
import { AnalyzerScreen } from '../screens/AnalyzerScreen';

export type AnalyticsTab =
  | 'overview'
  | 'trainees'
  | 'sessions'
  | 'skills'
  | 'engagement'
  | 'quality'
  | 'analyzer';

export interface AnalyticsTabProps {
  range: Range;
  onRange: (r: Range) => void;
  query: string;
  onQuery: (q: string) => void;
  /** The record the tab is open on (a trainee's user id, a session id), from the URL. */
  recordId: string | null;
  /** Go to an Analytics tab, optionally opened on one record. */
  onOpen: (tab: AnalyticsTab, id?: string | null) => void;
  /** Go anywhere else in the portal. */
  onNav: (screen: AdminScreen, tab?: string, id?: string | null) => void;
}

export function AnalyticsDestination({ tab, ...props }: AnalyticsTabProps & { tab: AnalyticsTab }) {
  switch (tab) {
    case 'overview':
      return <OverviewTab {...props} />;
    case 'trainees':
      return <TraineesTab {...props} />;
    case 'sessions':
      return <SessionsTab {...props} />;
    case 'skills':
      return <SkillsTab {...props} />;
    case 'engagement':
      return <EngagementTab {...props} />;
    case 'quality':
      return <QualityScreen range={props.range} onRange={props.onRange} />;
    case 'analyzer':
      return (
        <AnalyzerScreen range={props.range} onRange={props.onRange} query={props.query} onQuery={props.onQuery} />
      );
    default:
      return <OverviewTab {...props} />;
  }
}
