/**
 * Consumer-side feature flag client.
 *
 * Calls the public `flags-resolve` Netlify function with an audience
 * descriptor (anon session id, optional auth user id, primary driver) and
 * receives a snapshot of resolved flag values + scenario overrides.
 *
 * Snapshots are cached in-memory for the session and refreshed on auth /
 * profile change. Default values come from this file too — they are the
 * fallback when the network is unavailable, and they document every flag
 * key the consumer app reads.
 */

export type FlagKey =
  | 'screen.analyzer.enabled'
  | 'screen.act_guide.enabled'
  | 'screen.resources.enabled'
  | 'screen.stats.enabled'
  | 'screen.history.enabled'
  | 'screen.create.enabled'
  | 'screen.voice.enabled'
  | 'nav.tab.home.enabled'
  | 'nav.tab.history.enabled'
  | 'nav.tab.resources.enabled'
  | 'nav.tab.settings.enabled'
  | 'nav.sidebar.create.enabled'
  | 'nav.sidebar.analyzer.enabled'
  | 'nav.sidebar.history.enabled'
  | 'nav.sidebar.resources.enabled'
  | 'component.home.save_progress_banner'
  | 'component.home.act_guide_card'
  | 'component.home.echo_profile_card'
  | 'component.home.library_card'
  | 'component.chat.coach_drawer'
  | 'component.stats.sentiment_chart'
  | 'field.home.headline'
  | 'field.home.welcome_eyebrow';

export const FLAG_DEFAULTS: Record<FlagKey, unknown> = {
  'screen.analyzer.enabled': true,
  'screen.act_guide.enabled': true,
  'screen.resources.enabled': true,
  'screen.stats.enabled': true,
  'screen.history.enabled': true,
  'screen.create.enabled': true,
  'screen.voice.enabled': true,
  'nav.tab.home.enabled': true,
  'nav.tab.history.enabled': true,
  'nav.tab.resources.enabled': true,
  'nav.tab.settings.enabled': true,
  'nav.sidebar.create.enabled': true,
  'nav.sidebar.analyzer.enabled': true,
  'nav.sidebar.history.enabled': true,
  'nav.sidebar.resources.enabled': true,
  'component.home.save_progress_banner': true,
  'component.home.act_guide_card': true,
  'component.home.echo_profile_card': true,
  'component.home.library_card': true,
  'component.chat.coach_drawer': false,
  'component.stats.sentiment_chart': true,
  'field.home.headline': '',
  'field.home.welcome_eyebrow': '',
};

export interface ScenarioOverride {
  scenario_id: string;
  visible: boolean;
  sort_order: number | null;
  title_override: string | null;
  context_override: string | null;
  opening_line_override: string | null;
  difficulty_override: number | null;
  persona_override: string | null;
  prompt_prefix: string | null;
  prompt_suffix: string | null;
  // Card-level overrides
  card_title_override: string | null;
  card_subtitle_override: string | null;
  info_modal_title: string | null;
  info_modal_body: string | null;
  start_button_label: string | null;
  card_driver_override: string | null;
  // Admin-authored scenario fields (only populated for `admin:<uuid>` rows)
  breed: string | null;
  life_stage: string | null;
  pushback_id: string | null;
  pushback_notes: string | null;
  suggested_driver: string | null;
  weight_kg: number | null;
}

export interface FlagSnapshot {
  flags: Record<string, unknown>;
  scenarioOverrides: ScenarioOverride[];
  fetchedAt: number;
}

export interface AudienceInput {
  user_id?: string | null;
  anon_session_id?: string | null;
  driver?: string | null;
  clinic_id?: string | null;
}

const ENDPOINT = '/.netlify/functions/flags-resolve';

/**
 * Fetch a fresh snapshot. Throws on network error — callers should fall
 * back to FLAG_DEFAULTS.
 */
export async function fetchFlagSnapshot(
  audience: AudienceInput,
): Promise<FlagSnapshot> {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(audience),
  });
  if (!res.ok) throw new Error(`flags-resolve failed (${res.status})`);
  return (await res.json()) as FlagSnapshot;
}

/** Pure helper: read a value from a snapshot with a typed fallback. */
export function readFlag<T>(
  snapshot: FlagSnapshot | null,
  key: FlagKey,
  fallback: T,
): T {
  if (!snapshot) return (FLAG_DEFAULTS[key] as T) ?? fallback;
  const v = snapshot.flags[key];
  if (v === undefined || v === null) return (FLAG_DEFAULTS[key] as T) ?? fallback;
  return v as T;
}

export function findOverride(
  snapshot: FlagSnapshot | null,
  scenarioId: string,
): ScenarioOverride | null {
  if (!snapshot) return null;
  return snapshot.scenarioOverrides.find((o) => o.scenario_id === scenarioId) ?? null;
}
