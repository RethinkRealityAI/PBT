import type { DriverKey } from '../lib/tokens';

export interface AdminUser {
  user_id: string;
  display_name: string | null;
  echo_primary: DriverKey | null;
  echo_secondary: DriverKey | null;
  is_admin: boolean;
  created_at: string;
}

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
  is_public: boolean;
  plays: number;
  avg_score: number | null;
  created_at: string;
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
  updated_by: string | null;
  updated_at: string;
}

export interface AuditLogRow {
  id: string;
  actor_id: string | null;
  entity_type: 'flag' | 'flag_rule' | 'scenario_override';
  entity_id: string;
  action: 'create' | 'update' | 'delete' | 'revert';
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  note: string | null;
  created_at: string;
}
