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
 *   KNOWLEDGE_TOOL_LABELS    ← KNOWLEDGE_TOOLS,   src/shared/knowledge/knowledgeScopes.ts
 *   KNOWLEDGE_SPECIES_LABELS ← KNOWLEDGE_SPECIES, src/shared/knowledge/knowledgeScopes.ts
 *   EVENT_TYPE_LABELS  ← `NavEventType`, src/lib/analytics.ts
 *   ACTION_LABELS      ← `target` values passed to logEvent() across src/
 *   CALL_TYPE_LABELS   ← `CallType`, src/services/aiTelemetry.ts
 *   PUSHBACK_LABELS    ← PUSHBACK_CATEGORIES[].title, src/data/scenarios.ts
 *   FOCUS_AREA_LABELS  ← FOCUS_AREAS[].label, src/shared/knowledge/focusAreas.ts
 *   ENDED_REASON_LABELS ← `endedReason` union, src/features/chat/useTextChat.ts
 *   ENTITY_LABELS      ← admin_audit_log.entity_type CHECK
 *   DEVICE_LABELS      ← DEVICE_CLASSES, src/lib/deviceContext.ts   (app_open meta.device)
 *   OS_LABELS          ← OS_FAMILIES,    src/lib/deviceContext.ts   (app_open meta.os)
 *   INSTALL_LABELS     ← app_open meta.installed (boolean, + its words)
 *   THEME_LABELS       ← STORAGE_KEYS.theme values, src/lib/storage.ts (app_open meta.theme)
 *   LOCALE_LABELS      ← `Locale` union, src/i18n/locales.ts           (app_open meta.locale)
 *
 * __tests__/labels.test.ts pins ACTION, ENDED_REASON, DEVICE, OS, THEME and
 * LOCALE against those sources.
 *
 * Use `labelOf()` rather than indexing directly: an unrecognised value (a new
 * screen shipped by the consumer app before this map is updated) degrades to a
 * readable title-cased string instead of rendering a raw key or vanishing.
 */
import {
  KNOWLEDGE_SPECIES,
  KNOWLEDGE_TOOLS,
} from '../../../src/shared/knowledge/knowledgeScopes';

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
  fecalScan: 'Fecal scan',
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
  fecal_scan: 'Scanned a stool photo',
  platform_report: 'Reported a problem',
  app_open: 'Opened the app',
};

/** What the AI was doing when it was called. */
export const CALL_TYPE_LABELS: Record<string, string> = {
  roleplay: 'Playing the client',
  evaluate: 'Scoring a session',
  voice: 'Voice conversation',
  hint: 'Writing a coach hint',
  vision: 'Analysing a pet photo',
  fecal_scan: 'Scoring a stool photo',
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

/**
 * A pushback id as a person reads it — built-in or team-authored. Team
 * objections (`team:<slug>`, authored on the Studio's Categories tab) are
 * named by their own title when `team` holds them; otherwise by their slug in
 * words, so a raw `team:` id never reaches the screen.
 */
export function pushbackLabel(
  id: string | null | undefined,
  team: ReadonlyArray<{ id: string; title: string }> = [],
  fallback = 'Unknown',
): string {
  if (id == null || id === '') return fallback;
  if (PUSHBACK_LABELS[id]) return PUSHBACK_LABELS[id];
  const hit = team.find((t) => t.id === id);
  if (hit) return hit.title;
  if (id.startsWith('team:')) return humanize(id.slice('team:'.length)) || 'Team objection';
  return humanize(id);
}

/** Knowledge focus areas — mirrors FOCUS_AREAS[].label. */
export const FOCUS_AREA_LABELS: Record<string, string> = {
  weight: 'Weight management',
  gi: 'Digestive health (GI)',
  dermatitis: 'Skin & coat',
  urinary: 'Urinary health',
  aging: 'Senior care',
  communication: 'Client communication',
};

/**
 * Which tool may retrieve a knowledge document — derived from the shared
 * vocabulary rather than re-typed, so a new tool key can never reach the
 * screen as a raw identifier.
 */
export const KNOWLEDGE_TOOL_LABELS: Record<string, string> = Object.fromEntries(
  KNOWLEDGE_TOOLS.map((t) => [t.key, t.label]),
);

/** Which animals a knowledge document applies to. Same source, same rule. */
export const KNOWLEDGE_SPECIES_LABELS: Record<string, string> = Object.fromEntries(
  KNOWLEDGE_SPECIES.map((s) => [s.key, s.label]),
);

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
  user_exit: 'Left early',
  timeout: 'Timed out',
  error: 'Ended by an error',
};

/** How the trainee held the conversation. */
export const MODE_LABELS: Record<string, string> = {
  text: 'Typed',
  voice: 'Spoken',
};

// ─── Trainee device context (the trainee app's `app_open` event) ─────────

/** What kind of device — `app_open` meta.device. */
export const DEVICE_LABELS: Record<string, string> = {
  mobile: 'Phone',
  tablet: 'Tablet',
  desktop: 'Computer',
};

/** Operating system family — `app_open` meta.os. */
export const OS_LABELS: Record<string, string> = {
  ios: 'iPhone / iPad',
  android: 'Android',
  macos: 'Mac',
  windows: 'Windows',
  linux: 'Linux',
  chromeos: 'Chromebook',
  other: 'Other',
};

/**
 * Installed app or browser tab — `app_open` meta.installed is a boolean;
 * keyed by its string form too (`String(true)`), and by words for a
 * pre-bucketed breakdown.
 */
export const INSTALL_LABELS: Record<string, string> = {
  installed: 'Installed app',
  browser: 'In the browser',
  true: 'Installed app',
  false: 'In the browser',
};

/** The trainee's theme preference — `app_open` meta.theme. */
export const THEME_LABELS: Record<string, string> = {
  light: 'Light',
  dark: 'Dark',
  system: 'Follows device',
};

/** The trainee app's language — `app_open` meta.locale. */
export const LOCALE_LABELS: Record<string, string> = {
  en: 'English',
  fr: 'Français',
};

/** What kind of thing an audit-log entry changed. */
export const ENTITY_LABELS: Record<string, string> = {
  flag: 'Feature switch',
  flag_rule: 'Feature switch targeting rule',
  scenario_override: 'Scenario edit',
  simulation_config: 'AI tuning settings',
  user: 'Person',
  role: 'Role',
  invite: 'Invitation',
  email_settings: 'Email settings',
  email_template: 'Email template',
  knowledge_document: 'Knowledge document',
  report: 'Problem report',
  scenario_objection: 'Scenario objection',
  scenario_objection_category: 'Objection category',
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
