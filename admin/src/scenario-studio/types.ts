/**
 * Scenario Studio — the prop contracts between the editor shell and the
 * pieces it hosts (steps, assistant panel, test drive). Each piece is built
 * against these and nothing else, so they can evolve independently.
 */
import type { KnowledgeDocument } from '../data/types';
import type { StudioContext, StudioDraft, StudioSource, StudioStepKey } from './studioModel';
import type { CopilotTranscript } from './copilot/types';

/** What every step component receives. */
export interface StepProps {
  /** The working copy — already hydrated with the scenario's current values. */
  draft: StudioDraft;
  /** Merge a partial change into the draft (marks it unsaved). */
  patch: (p: StudioDraft) => void;
  source: StudioSource;
  /** False for read-only roles: render values, disable every control. */
  canWrite: boolean;
  /**
   * The built-in values for a library scenario (what "Revert" would restore),
   * or null for admin/user scenarios. Steps may show "Built-in: X" hints.
   */
  base: StudioDraft | null;
  /** Readiness context (tested, knowledge health). */
  ctx: StudioContext;
  /** Jump to another step. */
  goTo: (step: StudioStepKey) => void;
  /**
   * Hand a message to the assistant panel (opens it if closed) — for
   * "✦ Write three opening lines for me"-style buttons inside a step.
   */
  askAssistant: (message: string) => void;
  /** The knowledge library (roleplay scope + status), shared across steps. */
  knowledge: KnowledgeState;
}

export interface KnowledgeState {
  docs: KnowledgeDocument[];
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

/** Extra props for the Test drive step. */
export interface TestDriveProps extends StepProps {
  scenarioId: string;
  /** Called once a simulated conversation reaches its end (token, cap, or End). */
  onTested: () => void;
}

/** The assistant panel. */
export interface CopilotPanelProps {
  scenarioId: string;
  draft: StudioDraft;
  step: StudioStepKey;
  canWrite: boolean;
  knowledge: KnowledgeState;
  /**
   * Apply an already-validated change to the draft. `summary` is what the
   * shell may toast ("Applied: breed, life stage").
   */
  onPatch: (p: StudioDraft, summary: string) => void;
  onGoToStep: (step: StudioStepKey) => void;
  /** Lifted so the shell can persist it with the local draft. */
  transcript: CopilotTranscript;
  onTranscriptChange: (next: CopilotTranscript) => void;
  /**
   * A message queued by the rest of the UI (home composer, step buttons).
   * The panel sends it once and calls `onPendingConsumed`. `id` changes for
   * every new request, so the same text can be sent twice.
   */
  pendingPrompt: { id: number; text: string } | null;
  onPendingConsumed: () => void;
  /** 'docked' = right column; 'drawer' = slide-over on narrow screens. */
  variant: 'docked' | 'drawer';
  onClose?: () => void;
}
