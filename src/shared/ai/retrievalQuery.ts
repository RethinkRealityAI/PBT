/**
 * Scenario → retrieval targeting, shared by the browser (`services/ragClient`)
 * and the Netlify AI functions (`_shared/ai.ts`), so text mode, voice mode
 * and the server all ask the knowledge base the same question with the same
 * filters. Dependency-free (types only).
 */
import type { Scenario } from '../../data/scenarios';

/**
 * Scenario-derived retrieval targeting. `docSlugs` (explicit knowledge
 * attachments) wins over `focus` (clinical focus area) server-side.
 */
export interface RetrievalFilters {
  /** Clinical focus area — SOFT: relaxed when it matches nothing. */
  focus?: string;
  /** Explicit document attachment — wins over `focus`, never relaxed. */
  docSlugs?: string[];
  /**
   * The consumer asking (KNOWLEDGE_TOOL_KEYS) — HARD: only documents whose
   * `tools` scope lists it are ever returned. Every production caller sets it.
   */
  tool?: string;
  /** Species / life-stage scope (KNOWLEDGE_SPECIES_KEYS) — HARD, like `tool`. */
  species?: string;
}

/**
 * The retrieval query for a scenario — the exact string text mode and voice
 * mode have always sent to `rag-retrieve`.
 */
export function scenarioRetrievalQuery(
  scenario: Pick<Scenario, 'pushback' | 'suggestedDriver' | 'breed' | 'age'>,
): string {
  return `${scenario.pushback.title} ${scenario.suggestedDriver} owner ${scenario.breed} ${scenario.age}`;
}

/**
 * Derive retrieval targeting from the scenario the user is about to play.
 * Explicitly attached knowledge documents win over the broader focus area;
 * an unlinked scenario retrieves un-targeted, exactly as before.
 */
export function scenarioRetrievalFilters(
  scenario: Pick<Scenario, 'focusArea' | 'knowledgeSlugs'>,
): RetrievalFilters | undefined {
  if (scenario.knowledgeSlugs?.length) return { docSlugs: scenario.knowledgeSlugs };
  if (scenario.focusArea) return { focus: scenario.focusArea };
  return undefined;
}
