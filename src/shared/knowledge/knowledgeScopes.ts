// Knowledge scopes — WHO may retrieve a knowledge document, and for WHICH
// animals. Sits beside `focusAreas.ts` (WHAT clinical topic it is about) and
// is imported by the admin app, the consumer app and netlify/functions alike,
// so it stays dependency-free.
//
// Why this exists: every retrieval consumer (the roleplay customer, the
// scorer, the coach, the admin scenario-builder AI, the fecal scan) reads the
// same `knowledge_chunks` table. Without an explicit scope a cat stool chart
// tagged `focus: gi` is a legitimate hit for a GI roleplay, and a dog fecal
// scan could be grounded in a cat passage. Scope tags make the boundary a
// property of the DOCUMENT, chosen by the admin who filed it, and retrieval
// treats them as HARD filters (see `_shared/retrieval.ts`): a tool/species
// scope is never relaxed, only the clinical focus falls back.
//
// Stored on `knowledge_documents.metadata.tags` and on every
// `knowledge_chunks.tags` row as jsonb arrays — `{ tools: [...], species:
// [...] }` — so the `match_knowledge_chunks` containment filter
// (`tags @> '{"tools":["fecal-scan"]}'`) matches "array contains".

export interface KnowledgeTool {
  key: string;
  label: string;
  description: string;
}

/** The retrieval consumers. Keys are persisted in tags — never rename. */
export const KNOWLEDGE_TOOLS: KnowledgeTool[] = [
  {
    key: 'roleplay',
    label: 'Roleplay customer',
    description: 'The AI client in text and voice sessions (customer turns).',
  },
  {
    key: 'scoring',
    label: 'Session scoring',
    description: 'The ACT scorer that grades a finished session.',
  },
  {
    key: 'coach',
    label: 'Coach hints',
    description: 'In-chat coaching nudges during a text session.',
  },
  {
    key: 'scenario-builder',
    label: 'Scenario builder AI',
    description: 'Admin-side suggestions while building a scenario.',
  },
  {
    key: 'fecal-scan',
    label: 'Fecal Scan',
    description: 'Stool-photo scoring against the Royal Canin fecal charts.',
  },
];

export const KNOWLEDGE_TOOL_KEYS = KNOWLEDGE_TOOLS.map((t) => t.key);

/**
 * The scope a document gets when the admin does not choose one: everything
 * that runs a training session. Fecal Scan is deliberately NOT included — a
 * document only reaches the scan when someone files it there on purpose.
 */
export const DEFAULT_KNOWLEDGE_TOOLS: string[] = [
  'roleplay',
  'scoring',
  'coach',
  'scenario-builder',
];

export function isKnowledgeToolKey(value: unknown): value is string {
  return typeof value === 'string' && KNOWLEDGE_TOOL_KEYS.includes(value);
}

export function knowledgeToolLabel(key: string | null | undefined): string | null {
  if (!key) return null;
  return KNOWLEDGE_TOOLS.find((t) => t.key === key)?.label ?? key;
}

export interface KnowledgeSpecies {
  key: string;
  label: string;
  description: string;
}

/**
 * Species / life-stage vocabulary. Mirrors the Royal Canin chart split the
 * Fecal Scan uses (adult dog · puppy · cat) so a chart document and a scan
 * request speak the same words. Keys are persisted in tags — never rename.
 */
export const KNOWLEDGE_SPECIES: KnowledgeSpecies[] = [
  { key: 'dog', label: 'Adult dog', description: 'Dogs from one year of age.' },
  { key: 'puppy', label: 'Puppy', description: 'Puppies, eight weeks of age and older.' },
  { key: 'cat', label: 'Cat', description: 'Cats of any age.' },
];

export const KNOWLEDGE_SPECIES_KEYS = KNOWLEDGE_SPECIES.map((s) => s.key);

/** A document with no species restriction applies to every animal. */
export const ALL_KNOWLEDGE_SPECIES: string[] = [...KNOWLEDGE_SPECIES_KEYS];

export function isKnowledgeSpeciesKey(value: unknown): value is string {
  return typeof value === 'string' && KNOWLEDGE_SPECIES_KEYS.includes(value);
}

export function knowledgeSpeciesLabel(key: string | null | undefined): string | null {
  if (!key) return null;
  return KNOWLEDGE_SPECIES.find((s) => s.key === key)?.label ?? key;
}

/**
 * Normalise an arbitrary `tools` value from a tag bag into a validated,
 * de-duplicated list in vocabulary order. Unknown keys are dropped; an empty
 * or absent value yields `fallback` (default: the training-session set).
 */
export function normalizeKnowledgeTools(
  value: unknown,
  fallback: readonly string[] = DEFAULT_KNOWLEDGE_TOOLS,
): string[] {
  const raw = Array.isArray(value) ? value : typeof value === 'string' ? [value] : [];
  const picked = KNOWLEDGE_TOOL_KEYS.filter((k) => raw.includes(k));
  return picked.length ? picked : [...fallback];
}

/**
 * Same for `species`. A scalar (the first fecal seed wrote `species: 'dog'`)
 * is accepted and promoted to a one-element list. Empty → every species.
 */
export function normalizeKnowledgeSpecies(
  value: unknown,
  fallback: readonly string[] = ALL_KNOWLEDGE_SPECIES,
): string[] {
  const raw = Array.isArray(value) ? value : typeof value === 'string' ? [value] : [];
  const picked = KNOWLEDGE_SPECIES_KEYS.filter((k) => raw.includes(k));
  return picked.length ? picked : [...fallback];
}

/** The scope portion of a tag bag, read leniently (flat or nested `tags`). */
export interface KnowledgeScope {
  tools: string[];
  species: string[];
}

export function readKnowledgeScope(bag: unknown): KnowledgeScope {
  const b = bag && typeof bag === 'object' ? (bag as Record<string, unknown>) : {};
  const nested =
    b.tags && typeof b.tags === 'object' ? (b.tags as Record<string, unknown>) : null;
  const src = nested && ('tools' in nested || 'species' in nested) ? nested : b;
  return {
    tools: normalizeKnowledgeTools(src.tools),
    species: normalizeKnowledgeSpecies(src.species),
  };
}
