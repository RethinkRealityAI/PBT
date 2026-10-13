/**
 * The assistant transcript — what the panel renders and what the shell
 * persists with a local draft. A2UI surfaces live beside the items (keyed by
 * surfaceId) so an item can point at an interactive card.
 */
import type { SurfaceState } from '../../lib/a2ui';

export type CopilotItem =
  /** Something the admin typed or tapped. */
  | { id: string; kind: 'user'; text: string; at: number }
  /** The assistant's words. `offline` = a local fallback, not the model. */
  | { id: string; kind: 'assistant'; text: string; at: number; offline?: boolean }
  /** An interactive A2UI card (proposal, question, options…). */
  | { id: string; kind: 'surface'; surfaceId: string; at: number }
  /**
   * The outcome of a card ("Applied: breed, life stage" / "Dismissed").
   * Rendered as a small centred pill; sent to the model as a
   * `[tool_result] …` user turn so it knows what happened.
   */
  | { id: string; kind: 'result'; text: string; ok: boolean; at: number };

export interface CopilotTranscript {
  items: CopilotItem[];
  surfaces: Record<string, SurfaceState>;
  /** Follow-up chips from the latest assistant turn. */
  suggestions: string[];
  /** Monotonic counter for item / surface ids. */
  seq: number;
}

export const EMPTY_TRANSCRIPT: CopilotTranscript = {
  items: [],
  surfaces: {},
  suggestions: [],
  seq: 0,
};
