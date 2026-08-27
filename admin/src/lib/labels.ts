/**
 * Plain-English labels for every raw identifier the database hands the portal.
 *
 * The admin portal is read by practice managers, not engineers. Anything that
 * reaches the screen as a database value — a screen key, an event type, a
 * telemetry call type, a pushback id — has to be translated first, or the page
 * reads as a log file. These maps are the single place that translation lives.
 *
 * Every map is EXHAUSTIVE against its source union, and each one names that
 * source so the two stay in step:
 *
 *   SCREEN_LABELS      ← `Screen` union, src/app/routes.ts
 *   EVENT_TYPE_LABELS  ← `NavEventType`, src/lib/analytics.ts
 *   ACTION_LABELS      ← `target` values passed to logEvent() across src/
 *   CALL_TYPE_LABELS   ← `CallType`, src/services/aiTelemetry.ts
 *   PUSHBACK_LABELS    ← PUSHBACK_CATEGORIES[].title, src/data/scenarios.ts
 *   FOCUS_AREA_LABELS  ← FOCUS_AREAS[].label, src/shared/knowledge/focusAreas.ts
 *   ENTITY_LABELS      ← admin_audit_log.entity_type CHECK
 *
 * Use `labelOf()` rather than indexing directly: an unrecognised value (a new
 * screen shipped by the consumer app before this map is updated) degrades to a
 * readable title-cased string instead of rendering a raw key or vanishing.
 */

/** Trainee-app screens, named the way a practice manager would describe them. */
export const SCREEN_LABELS: Record<string, string> = {
  onboarding: 'Welcome',
  terms: 'Terms & conditions',
  quiz: 'Communication style quiz',
  result: 'Quiz result',
  home: 'Home',
  create: 'Build a scenario',
  chat: 'Training session',
  stats: 'Session scorecard',
  history: 'Past sessions',
  historyDetail: 'Past session detail',
  analyzer: 'Pet analyzer',
  resources: 'Resources',
  settings: 'Settings',
  actGuide: 'ACT method guide',
};

/** What kind of thing happened. */
export const EVENT_TYPE_LABELS: Record<string, string> = {
  screen_view: 'Opened a screen',
  card_click: 'Tapped a card',
  tab_change: 'Switched tab',
  modal_open: 'Opened a dialog',
  modal_close: 'Closed a dialog',
  cta_click: 'Pressed a button',
  filter_change: 'Changed a filter',
  dwell: 'Time spent on a screen',
  error: 'Saw an error',
  custom: 'Other activity',
};

/** Specific things people do, written as the action itself. */
export const ACTION_LABELS: Record<string, string> = {
  session_open: 'Started a training session',
  session_abandon: 'Left a session early',
  session_restart: 'Restarted a session',
  session_rescore: 'Retried scoring',
  session_feedback: 'Rated a session',
  coach_hint_request: 'Asked for a coach hint',
  library_scenario: 'Opened a library scenario',
  scenario_save: 'Saved their own scenario',
  analyzer_save: 'Saved a pet',
  vision_analyze: 'Analysed a pet photo',
  platform_report: 'Reported a problem',
};

/** What the AI was doing when it was called. */
export const CALL_TYPE_LABELS: Record<string, string> = {
  roleplay: 'Playing the client',
  evaluate: 'Scoring a session',
  voice: 'Voice conversation',
  hint: 'Writing a coach hint',
  vision: 'Analysing a pet photo',
  retrieval: 'Looking up knowledge',
};

/** Objection categories — mirrors PUSHBACK_CATEGORIES[].title. */
export const PUSHBACK_LABELS: Record<string, string> = {
  cost: 'Cost / price pushback',
  'breeder-advice': 'Friend / breeder said…',
  'raw-food': 'Grain-free / trend belief',
  'rx-diet': 'Skepticism on Rx diet',
  'brand-switch': 'Switching brands hesitation',
  'weight-denial': 'Weight / obesity denial',
  custom: 'Other pushback',
};

/** Knowledge focus areas — mirrors FOCUS_AREAS[].label. */
export const FOCUS_AREA_LABELS: Record<string, string> = {
  weight: 'Weight management',
  gi: 'Digestive health (GI)',
  dermatitis: 'Skin & coat',
  urinary: 'Urinary health',
  aging: 'Senior care',
  communication: 'Client communication',
};

/** Knowledge document categories as stored on knowledge_documents.category. */
export const KNOWLEDGE_CATEGORY_LABELS: Record<string, string> = {
  act: 'ACT method',
  clinical: 'Clinical reference',
  driver: 'Communication styles',
  pushback: 'Objection handling',
};

/** How a session ended. */
export const ENDED_REASON_LABELS: Record<string, string> = {
  completed: 'Finished',
  abandoned: 'Left early',
  error: 'Ended by an error',
};

/** How the trainee held the conversation. */
export const MODE_LABELS: Record<string, string> = {
  text: 'Typed',
  voice: 'Spoken',
};

/** What kind of thing an audit-log entry changed. */
export const ENTITY_LABELS: Record<string, string> = {
  flag: 'Feature switch',
  flag_rule: 'Feature switch targeting rule',
  scenario_override: 'Scenario edit',
  simulation_config: 'Simulation settings',
  user: 'Person',
  role: 'Role',
  invite: 'Invitation',
  email_settings: 'Email settings',
  email_template: 'Email template',
  knowledge_document: 'Knowledge document',
  report: 'Problem report',
};

/** What was done to it. */
export const AUDIT_ACTION_LABELS: Record<string, string> = {
  create: 'Created',
  update: 'Changed',
  delete: 'Removed',
  revert: 'Rolled back',
};

/**
 * Title-case an unmapped key so an unknown value still reads as English:
 * `historyDetail` → "History detail", `weight-denial` → "Weight denial".
 */
export function humanize(key: string): string {
  const spaced = key
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .trim();
  if (!spaced) return key;
  return spaced.charAt(0).toUpperCase() + spaced.slice(1).toLowerCase();
}

/**
 * Look a key up in a label map, falling back to a humanised version of the key.
 * Never returns an empty string — an absent key renders as the supplied
 * `fallback` (default "Unknown") so a table cell is never blank.
 */
export function labelOf(
  map: Record<string, string>,
  key: string | null | undefined,
  fallback = 'Unknown',
): string {
  if (key == null || key === '') return fallback;
  return map[key] ?? humanize(key);
}
