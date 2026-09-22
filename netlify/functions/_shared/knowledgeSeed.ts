/**
 * The built-in ("code-seed") knowledge corpus, and the rules that decide what
 * a re-sync is allowed to overwrite.
 *
 * Extracted from `admin-knowledge.ts` so that ONE implementation serves every
 * caller:
 *
 *   • `admin-knowledge { op: 'seed' }`        — the legacy admin button
 *   • `scripts/knowledge-sync.ts`             — `npm run knowledge:sync` and
 *                                               the Netlify deploy plugin
 *
 * Dependency-light on purpose: the data modules plus the scope vocabulary, no
 * Supabase, no Gemini, no `Request`/`Response`. That keeps it importable from
 * a plain Node script and unit-testable without mocks.
 *
 * ── Precedence (the part that is easy to get wrong) ────────────────────────
 * A re-sync rebuilds a document's BODY from code, but an admin's cataloguing
 * is not in the code. `buildSeedCatalogue(existingRows)` captures what the
 * database already says and hands back `tagsFor` / `citationFor` / `deletedAt`
 * so every writer resolves it identically:
 *
 *   focus     admin edit  ▸ the seed's own default ▸ none
 *   citation  admin edit  ▸ the seed's own default ▸ null
 *   tools     admin edit  ▸ the seed's own default ▸ DEFAULT_KNOWLEDGE_TOOLS
 *   species   admin edit  ▸ the seed's own default ▸ ALL_KNOWLEDGE_SPECIES
 *   deleted   a soft-deleted slug STAYS deleted and gets no chunks
 *
 * The scope is never absent: an untagged chunk is invisible to scoped
 * retrieval, which is a delete wearing a disguise.
 */
import {
  normalizeKnowledgeSpecies,
  normalizeKnowledgeTools,
} from '../../../src/shared/knowledge/knowledgeScopes';
import { DRIVER_KNOWLEDGE } from '../../../src/data/knowledge/driverProfiles';
import { PUSHBACK_KNOWLEDGE } from '../../../src/data/knowledge/pushbackTaxonomy';
import { ACT_STEPS } from '../../../src/data/knowledge/actGuide';
import {
  BCS_BLURB,
  CALORIE_FORMULA_BLURB,
  MCS_BLURB,
  NON_SHAMING_FRAMING,
  PRODUCT_ANCHORS,
} from '../../../src/data/knowledge/clinicalReference';
import {
  FECAL_CHARTS,
  FECAL_SPECIES,
  buildFecalChartMarkdown,
  fecalChartChunks,
  fecalChartCitation,
  fecalKnowledgeSlug,
} from '../../../src/data/knowledge/fecalCharts';

export type Bag = Record<string, unknown>;

/** The `source` value every built-in document carries. */
export const CODE_SEED_SOURCE = 'code-seed';

/**
 * Read the focus area out of a document/chunk tag bag.
 *
 * Legacy fallback: the first bundled-study pass tagged the two communication
 * papers `{ topic: 'communication' }`, which predates `communication` becoming
 * a real focus area. Treat it as a focus so those documents aren't invisible
 * to focus-filtered retrieval before they're re-ingested.
 */
export function readFocus(tags: unknown): string | null {
  if (!tags || typeof tags !== 'object') return null;
  const bag = tags as Bag;
  if (typeof bag.focus === 'string' && bag.focus) return bag.focus;
  return bag.topic === 'communication' ? 'communication' : null;
}

/**
 * A scope list the admin CHOSE, or null when the stored bag never had one.
 *
 * The distinction matters on re-sync: "the admin filed this for the coach
 * only" must survive, while "this document predates scopes" must pick up the
 * defaults rather than be frozen at whatever the code once wrote.
 */
export function readScopeList(
  tags: unknown,
  key: 'tools' | 'species',
  normalize: (v: unknown) => string[],
): string[] | null {
  if (!tags || typeof tags !== 'object') return null;
  const raw = (tags as Bag)[key];
  if (raw === undefined || raw === null) return null;
  if (Array.isArray(raw) && raw.length === 0) return null;
  return normalize(raw);
}

/** Write the chosen scope lists onto a tag bag. `null` = leave as stored. */
export function applyScope(tags: Bag, tools: string[] | null, species: string[] | null): Bag {
  const next: Bag = { ...tags };
  if (tools) next.tools = tools;
  if (species) next.species = species;
  return next;
}

/** Set (or clear) the focus key on a tag bag, dropping the legacy `topic` key. */
export function applyFocus(tags: unknown, focus: string | null): Bag {
  const next: Bag = tags && typeof tags === 'object' ? { ...(tags as Bag) } : {};
  if (focus) next.focus = focus;
  else delete next.focus;
  if (next.topic === 'communication') delete next.topic;
  return next;
}

export interface SeedDoc {
  slug: string;
  title: string;
  category: 'driver' | 'pushback' | 'act' | 'clinical';
  content: string;
  metadata: Record<string, unknown>;
  /**
   * Default catalogue tags for this document (and its chunks). Most seed docs
   * ship without a clinical focus and get filed by an admin; the fecal charts
   * arrive already filed, and scoped to the Fecal Scan alone.
   * An admin's own focus / scope edit still wins — see `buildSeedCatalogue`.
   * `tools` / `species` default to the training-session scope when omitted.
   */
  tags?: Record<string, unknown>;
  /** Default citation. An admin's own citation edit wins. */
  citation?: string;
  /**
   * Explicit embedding units, overriding `chunkMarkdown(content)`.
   *
   * `chunkMarkdown` packs paragraphs up to ~800 tokens, which is right for
   * prose but wrong for a reference table: a whole fecal chart is ~370 tokens
   * and would collapse into ONE chunk, so every query would retrieve the same
   * passage and per-score similarity ranking would be meaningless.
   */
  chunks?: string[];
}

/** Serialise the code knowledge modules into embedder-ready documents. */
export function buildSeedDocs(): SeedDoc[] {
  const docs: SeedDoc[] = [];

  for (const [key, d] of Object.entries(DRIVER_KNOWLEDGE)) {
    docs.push({
      slug: `driver:${key}`,
      title: `ECHO driver — ${key}`,
      category: 'driver',
      content: [
        `# ${key}`,
        `Motivation: ${d.motivation}`,
        `Communication style:\n${d.communicationStyle.map((s) => `- ${s}`).join('\n')}`,
        `Strengths:\n${d.strengths.map((s) => `- ${s}`).join('\n')}`,
        `Under stress: ${d.stressSignature}`,
        `Recognition cues:\n${d.recognitionCues.map((s) => `- ${s}`).join('\n')}`,
        `Flexing tips:\n${d.flexingTips.map((s) => `- ${s}`).join('\n')}`,
        `Sample customer phrasings:\n${d.customerSamplePhrasings.map((s) => `- ${s}`).join('\n')}`,
      ].join('\n\n'),
      metadata: { driver: key },
    });
  }

  for (const [id, p] of Object.entries(PUSHBACK_KNOWLEDGE)) {
    docs.push({
      slug: `pushback:${id}`,
      title: `Pushback — ${p.title}`,
      category: 'pushback',
      content: [
        `# ${p.title}`,
        `Examples:\n${p.examples.map((s) => `- ${s}`).join('\n')}`,
        `Root concerns:\n${p.rootConcerns.map((s) => `- ${s}`).join('\n')}`,
        `Acknowledge patterns:\n${p.acknowledgePatterns.map((s) => `- ${s}`).join('\n')}`,
        `Clarify questions:\n${p.clarifyQuestions.map((s) => `- ${s}`).join('\n')}`,
        `Take-action patterns:\n${p.takeActionPatterns.map((s) => `- ${s}`).join('\n')}`,
        `Watch-outs:\n${p.watchOuts.map((s) => `- ${s}`).join('\n')}`,
      ].join('\n\n'),
      metadata: { pushback_id: id },
    });
  }

  for (const step of ACT_STEPS) {
    docs.push({
      slug: `act:${step.key}`,
      title: `ACT method — ${step.label}`,
      category: 'act',
      content: [
        `# ${step.label}`,
        `Goal: ${step.goal}`,
        `Techniques:\n${step.techniques.map((s) => `- ${s}`).join('\n')}`,
        `Do:\n${step.doExamples.map((s) => `- ${s}`).join('\n')}`,
        `Don't:\n${step.dontExamples.map((s) => `- ${s}`).join('\n')}`,
      ].join('\n\n'),
      metadata: { act_step: step.key },
    });
  }

  docs.push({
    slug: 'clinical:reference',
    title: 'Clinical reference — BCS / MCS / calories / product anchors',
    category: 'clinical',
    content: [
      `BCS: ${BCS_BLURB}`,
      `MCS: ${MCS_BLURB}`,
      `Calories: ${CALORIE_FORMULA_BLURB}`,
      `Framing: ${NON_SHAMING_FRAMING}`,
      `Product anchors: ${PRODUCT_ANCHORS.satietySupport.name} — ${PRODUCT_ANCHORS.satietySupport.keyClaims.join('; ')}`,
    ].join('\n\n'),
    metadata: { anchors: Object.keys(PRODUCT_ANCHORS) },
  });

  // Royal Canin fecal scoring charts — one document per chart, one paragraph
  // per score, so each score becomes its own retrievable chunk. This is the
  // only knowledge `ai-fecal-scan` is allowed to ground on.
  for (const species of FECAL_SPECIES) {
    docs.push({
      slug: fecalKnowledgeSlug(species),
      title: FECAL_CHARTS[species].title,
      category: 'clinical',
      content: buildFecalChartMarkdown(species),
      metadata: {},
      // `tools: ['fecal-scan']` is the whole point: these charts must be
      // unreachable from a roleplay / scoring / coach prompt.
      tags: { focus: 'gi', topic: 'fecal-scoring', tools: ['fecal-scan'], species: [species] },
      citation: fecalChartCitation(species),
      // One embedded chunk per score — see SeedDoc.chunks.
      chunks: fecalChartChunks(species),
    });
  }

  return docs;
}

/** True for the built-in documents that are the fecal charts. */
export function isFecalSeedSlug(slug: string): boolean {
  return slug.startsWith('fecal:');
}

/** A stored row, as far as the precedence rules care. */
export interface KnowledgeRow {
  slug: string;
  metadata?: unknown;
  deleted_at?: string | null;
}

/** The subset of a desired document the precedence rules read. */
export interface CataloguedDoc {
  slug: string;
  tags?: Record<string, unknown>;
  citation?: string;
}

export interface SeedCatalogue {
  /** Effective tag bag (focus + scope) for a document about to be written. */
  tagsFor(doc: CataloguedDoc): Bag;
  /** Effective citation, or null. */
  citationFor(doc: CataloguedDoc): string | null;
  /** The stored `deleted_at` for a slug (so a re-sync is never an undelete). */
  deletedAt(slug: string): string | null;
  isDeleted(slug: string): boolean;
}

/**
 * Freeze the admin's cataloguing out of the rows currently in the database.
 *
 * Pass every row you might write (the caller decides whether to filter by
 * `source`); slugs that aren't in the desired set are simply never asked for.
 */
export function buildSeedCatalogue(existing: readonly KnowledgeRow[]): SeedCatalogue {
  const keptFocus = new Map<string, string>();
  const keptCitation = new Map<string, string>();
  const keptTools = new Map<string, string[]>();
  const keptSpecies = new Map<string, string[]>();
  const keptDeleted = new Map<string, string>();

  for (const row of existing ?? []) {
    const meta = (row.metadata ?? {}) as Bag;
    const focus = readFocus(meta.tags);
    if (focus) keptFocus.set(row.slug, focus);
    if (typeof meta.citation === 'string' && meta.citation) {
      keptCitation.set(row.slug, meta.citation);
    }
    const tools = readScopeList(meta.tags, 'tools', (v) => normalizeKnowledgeTools(v));
    if (tools) keptTools.set(row.slug, tools);
    const species = readScopeList(meta.tags, 'species', (v) => normalizeKnowledgeSpecies(v));
    if (species) keptSpecies.set(row.slug, species);
    if (row.deleted_at) keptDeleted.set(row.slug, String(row.deleted_at));
  }

  return {
    tagsFor(doc) {
      const focus =
        keptFocus.get(doc.slug) ?? (typeof doc.tags?.focus === 'string' ? doc.tags.focus : '');
      const bag: Bag = { ...(doc.tags ?? {}) };
      if (focus) bag.focus = focus;
      bag.tools = keptTools.get(doc.slug) ?? normalizeKnowledgeTools(doc.tags?.tools);
      bag.species = keptSpecies.get(doc.slug) ?? normalizeKnowledgeSpecies(doc.tags?.species);
      return bag;
    },
    citationFor(doc) {
      return keptCitation.get(doc.slug) ?? doc.citation ?? null;
    },
    deletedAt(slug) {
      return keptDeleted.get(slug) ?? null;
    },
    isDeleted(slug) {
      return keptDeleted.has(slug);
    },
  };
}
