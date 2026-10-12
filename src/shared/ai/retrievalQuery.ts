/**
 * Scenario → retrieval targeting, shared by the browser (`services/ragClient`)
 * and the Netlify AI functions (`_shared/ai.ts`), so text mode, voice mode
 * and the server all ask the knowledge base the same question with the same
 * filters. Dependency-free (types only).
 */
import type { Scenario } from '../../data/scenarios';
import { retrievalSpeciesFor, speciesOf } from '../scenarios/species';

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

/** How much of a custom pushback's notes stands in for its title. */
export const CUSTOM_NOTES_QUERY_CHARS = 160;

/**
 * What the objection is ABOUT, for the embedding: its title — except for a
 * `custom` ("Other pushback") scenario with notes, where the generic title
 * says nothing and the notes ARE the objection. A probiotics objection
 * written as "Other" must still find the probiotics documents. Whitespace is
 * collapsed so the query is one line.
 */
function pushbackTopic(scenario: Pick<Scenario, 'pushback' | 'pushbackNotes'>): string {
  if (scenario.pushback.id === 'custom') {
    const notes = (scenario.pushbackNotes ?? '').replace(/\s+/g, ' ').trim();
    if (notes) return notes.slice(0, CUSTOM_NOTES_QUERY_CHARS).trimEnd();
  }
  return scenario.pushback.title;
}

/**
 * The retrieval query for a scenario — the exact string text mode and voice
 * mode have always sent to `rag-retrieve`.
 *
 * A cat scenario says so ("… cat Maine Coon …"): the embedding should look
 * for passages about cats, and a breed name alone doesn't always carry the
 * species. Dog / species-less scenarios keep the historical string
 * byte-for-byte (cache keys and retrieval ranking stay as they were) — every
 * pushback but a `custom` one with notes (see `pushbackTopic`).
 */
export function scenarioRetrievalQuery(
  scenario: Pick<Scenario, 'pushback' | 'suggestedDriver' | 'breed' | 'age' | 'species'> &
    Partial<Pick<Scenario, 'pushbackNotes'>>,
): string {
  const animal = speciesOf(scenario.species) === 'cat' ? 'cat ' : '';
  return `${pushbackTopic(scenario)} ${scenario.suggestedDriver} owner ${animal}${scenario.breed} ${scenario.age}`;
}

/**
 * Derive retrieval targeting from the scenario the user is about to play.
 * Explicitly attached knowledge documents win over the broader focus area;
 * an unlinked scenario retrieves un-targeted, exactly as before.
 *
 * Every scenario carries its species as the HARD knowledge scope
 * (`retrievalSpeciesFor`: absent = dog, a dog under one year → `puppy`), so a
 * cat scenario never grounds on dog-only documents and a dog scenario never
 * grounds on cat-only ones. Documents keep the vocabulary default (every
 * species) unless someone narrows them, so this only ever removes passages
 * that were filed for the other animal.
 */
export function scenarioRetrievalFilters(
  scenario: Pick<Scenario, 'focusArea' | 'knowledgeSlugs' | 'species'> & {
    age?: Scenario['age'];
  },
): RetrievalFilters {
  const scope = { species: retrievalSpeciesFor(scenario.species, scenario.age) };
  if (scenario.knowledgeSlugs?.length) return { docSlugs: scenario.knowledgeSlugs, ...scope };
  if (scenario.focusArea) return { focus: scenario.focusArea, ...scope };
  return scope;
}
