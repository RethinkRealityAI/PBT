import type { DriverKey } from '../lib/tokens';

export interface AdminUser {
  user_id: string;
  display_name: string | null;
  echo_primary: DriverKey | null;
  echo_secondary: DriverKey | null;
  is_admin: boolean;
  disabled: boolean;
  /** Role key, or null for a plain (non-admin) account. */
  admin_role: string | null;
  /** Per-user exceptions layered over the role. */
  permission_overrides: { grant?: string[]; revoke?: string[] };
  email: string | null;
  created_at: string;
}

/** Payloads for the admin-user-actions write endpoint. */
export type UserAction =
  | { op: 'set_role'; userId: string; roleKey: string | null }
  | { op: 'set_overrides'; userId: string; grant: string[]; revoke: string[] }
  | { op: 'set_disabled'; userId: string; value: boolean }
  | {
      op: 'create';
      email: string;
      password: string;
      displayName?: string;
      roleKey?: string | null;
    }
  | { op: 'delete'; userId: string };

export interface AdminSession {
  id: string;
  user_id: string;
  scenario: Record<string, unknown> | null;
  scenario_summary: string | null;
  pushback_id: string | null;
  driver: DriverKey | null;
  transcript: Array<{ role: string; text: string; timestamp?: number }> | null;
  score_report: Record<string, unknown> | null;
  score_overall: number | null;
  duration_seconds: number | null;
  mode: 'text' | 'voice' | null;
  completed: boolean;
  ended_reason: string | null;
  flagged: boolean;
  flag_reason: string | null;
  model_id: string | null;
  turns: number | null;
  created_at: string;
}

export interface AiCall {
  id: string;
  session_id: string | null;
  user_id: string | null;
  call_type: 'roleplay' | 'evaluate' | 'voice' | 'hint';
  model_id: string;
  latency_ms: number;
  tokens_in: number;
  tokens_out: number;
  cost_usd: number;
  refusal: boolean;
  off_topic: boolean;
  end_token_emitted: boolean;
  retries: number;
  error: string | null;
  created_at: string;
}

export interface UserScenario {
  id: string;
  creator_id: string;
  title: string;
  breed: string | null;
  life_stage: string | null;
  difficulty: number | null;
  pushback_id: string | null;
  pushback_notes: string | null;
  weight_kg: number | null;
  persona: string | null;
  suggested_driver: string | null;
  context: string | null;
  opening_line: string | null;
  scenario_summary: string | null;
  is_public: boolean;
  plays: number;
  avg_score: number | null;
  created_at: string;
  updated_at?: string | null;
}

export interface AnalyzerEvent {
  id: string;
  user_id: string | null;
  breed: string | null;
  weight_kg: number | null;
  bcs: number | null;
  mcs: number | null;
  activity: string | null;
  kcal_target: number | null;
  verdict: 'on_track' | 'watch' | 'adjust' | 'concern' | null;
  created_at: string;
}

export interface NavEvent {
  id: number;
  user_id: string | null;
  anon_session_id: string | null;
  event_type: string;
  screen: string | null;
  target: string | null;
  meta: Record<string, unknown> | null;
  dwell_ms: number | null;
  created_at: string;
}

export type Verdict = AnalyzerEvent['verdict'];

export interface SessionFeedbackRow {
  id: string;
  session_id: string | null;
  user_id: string | null;
  anon_session_id: string | null;
  realism: number | null;
  ai_quality: number | null;
  comfort: number | null;
  comment: string | null;
  scenario_summary: string | null;
  pushback_id: string | null;
  created_at: string;
}

export interface PlatformReportRow {
  id: string;
  user_id: string | null;
  anon_session_id: string | null;
  kind: 'bug' | 'suggestion';
  message: string;
  screen: string | null;
  user_agent: string | null;
  status: 'open' | 'triaged' | 'resolved' | 'dismissed';
  created_at: string;
}

export type FlagSurface = 'screen' | 'nav' | 'scenario' | 'component' | 'field' | 'ai';
export type FlagValueType = 'boolean' | 'string' | 'number' | 'json';

export interface FlagDef {
  key: string;
  surface: FlagSurface;
  value_type: FlagValueType;
  default_value: unknown;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export interface FlagAudience {
  drivers?: DriverKey[];
  user_ids?: string[];
  anon_session_ids?: string[];
  clinic_ids?: string[];
  percentage?: number;
}

export interface FlagRule {
  id: string;
  flag_key: string;
  priority: number;
  audience: FlagAudience;
  value: unknown;
  enabled: boolean;
  note: string | null;
  created_at: string;
  updated_at: string;
}

export interface ScenarioOverrideRow {
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
  card_title_override: string | null;
  card_subtitle_override: string | null;
  info_modal_title: string | null;
  info_modal_body: string | null;
  start_button_label: string | null;
  card_driver_override: DriverKey | null;
  breed: string | null;
  life_stage: string | null;
  pushback_id: string | null;
  pushback_notes: string | null;
  suggested_driver: DriverKey | null;
  weight_kg: number | null;
  /** Clinical focus area key (see src/shared/knowledge/focusAreas.ts). */
  focus_area: string | null;
  /** knowledge_documents.slug values explicitly attached to this scenario. */
  knowledge_slugs: string[] | null;
  deleted_at: string | null;
  created_by: string | null;
  updated_by: string | null;
  updated_at: string;
}

export interface KnowledgeDocument {
  id: string;
  slug: string;
  title: string;
  category: string;
  source: string;
  metadata: Record<string, unknown> | null;
  content: string;
  updated_at: string;
  created_at: string;
  chunk_count: number;
}

/** Entity kinds `writeAuditLog` can stamp. Keep in sync with `_shared/admin.ts`. */
export type AuditEntityType =
  | 'flag'
  | 'flag_rule'
  | 'scenario_override'
  | 'simulation_config'
  | 'user'
  | 'role'
  | 'invite'
  | 'email_settings'
  | 'email_template';

/** Entity kinds the revert endpoint can actually roll back. */
export const REVERTABLE_ENTITY_TYPES: ReadonlySet<AuditEntityType> = new Set<AuditEntityType>([
  'flag',
  'flag_rule',
  'scenario_override',
  'simulation_config',
]);

export interface AuditLogRow {
  id: string;
  actor_id: string | null;
  entity_type: AuditEntityType;
  entity_id: string;
  action: 'create' | 'update' | 'delete' | 'revert';
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  note: string | null;
  created_at: string;
}
