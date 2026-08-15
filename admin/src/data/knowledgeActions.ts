/**
 * Knowledge-screen helpers: the `update` fetcher plus the pure functions the
 * screen uses to present documents in human terms.
 *
 * Lives beside (not inside) `queries.ts` because it is Knowledge-specific and
 * mostly pure — the presentation vocabulary (type labels, focus resolution,
 * filtering) is testable without a DOM or a network.
 *
 * The focus-area vocabulary itself is shared with the scenario builder and the
 * Netlify functions: `src/shared/knowledge/focusAreas.ts`.
 */
import { postJson } from '../lib/api';
import { focusAreaLabel } from '../../../src/shared/knowledge/focusAreas';
import type { KnowledgeDocument } from './types';

// ─── Presentation vocabulary ────────────────────────────────────────────────

/** Human labels for the `knowledge_documents.category` enum. */
export const TYPE_LABELS: Record<string, string> = {
  driver: 'ECHO driver',
  pushback: 'Pushback guide',
  act: 'ACT method',
  clinical: 'Clinical reference',
  custom: 'Custom',
};

/** Categories an admin may pick when uploading (the rest are code-seeded). */
export const UPLOAD_CATEGORIES: Array<{ value: 'clinical' | 'custom'; label: string }> = [
  { value: 'clinical', label: 'Clinical reference' },
  { value: 'custom', label: 'Custom' },
];

export function categoryLabel(category: string): string {
  return TYPE_LABELS[category] ?? category;
}

/** 'code-seed' → Built-in, anything else → Uploaded. */
export function sourceLabel(source: string): 'Built-in' | 'Uploaded' {
  return source === 'code-seed' ? 'Built-in' : 'Uploaded';
}

export function isBuiltIn(doc: Pick<KnowledgeDocument, 'source'>): boolean {
  return doc.source === 'code-seed';
}

// ─── Metadata readers ───────────────────────────────────────────────────────

type Bag = Record<string, unknown>;

/**
 * The document's focus area, or null.
 *
 * Documents ingested through the uploader nest their tags under
 * `metadata.tags`; code-seeded ones keep them flat on `metadata`. The first
 * bundled-study pass also tagged the two communication papers
 * `{ topic: 'communication' }` — before `communication` was a focus area — so
 * that legacy shape reads as a focus here too (and the server migrates it on
 * the next update / re-index).
 */
export function resolveDocFocus(metadata: Bag | null | undefined): string | null {
  if (!metadata || typeof metadata !== 'object') return null;
  const nested =
    metadata.tags && typeof metadata.tags === 'object' ? (metadata.tags as Bag) : null;
  for (const bag of [nested, metadata]) {
    if (!bag) continue;
    if (typeof bag.focus === 'string' && bag.focus) return bag.focus;
    if (bag.topic === 'communication') return 'communication';
  }
  return null;
}

/** The document's citation line, or null. */
export function docCitation(metadata: Bag | null | undefined): string | null {
  if (!metadata || typeof metadata !== 'object') return null;
  const citation = metadata.citation;
  return typeof citation === 'string' && citation.trim() ? citation.trim() : null;
}

// ─── Filtering ──────────────────────────────────────────────────────────────

export interface KnowledgeFilters {
  /** Free-text search: title, focus label, citation, slug. */
  query?: string;
  /** Focus-area key, or 'all', or 'none' for untagged documents. */
  focus?: string;
  /** Category key, or 'all'. */
  category?: string;
}

/**
 * Search + filter + sort the document list.
 *
 * Search deliberately covers what the admin can SEE (title, focus label,
 * citation) plus the slug, which is now only visible in the detail modal but
 * is still the id people paste from a scenario's attachment list.
 */
export function filterKnowledgeDocs(
  docs: KnowledgeDocument[],
  filters: KnowledgeFilters = {},
): KnowledgeDocument[] {
  const q = (filters.query ?? '').trim().toLowerCase();
  const focus = filters.focus ?? 'all';
  const category = filters.category ?? 'all';

  const out = docs.filter((doc) => {
    const docFocus = resolveDocFocus(doc.metadata);
    if (focus === 'none' && docFocus) return false;
    if (focus !== 'all' && focus !== 'none' && docFocus !== focus) return false;
    if (category !== 'all' && doc.category !== category) return false;
    if (!q) return true;
    const haystack = [
      doc.title,
      doc.slug,
      categoryLabel(doc.category),
      focusAreaLabel(docFocus) ?? '',
      docCitation(doc.metadata) ?? '',
    ]
      .join(' ')
      .toLowerCase();
    return haystack.includes(q);
  });

  return out.sort((a, b) => {
    const cat = a.category.localeCompare(b.category);
    return cat !== 0 ? cat : a.title.localeCompare(b.title);
  });
}

/** Scenarios that pull from a document: attached by slug, or sharing its focus. */
export interface ScenarioLink {
  scenario_id: string;
  label: string;
  via: 'attached' | 'focus';
}

export function scenariosUsingDoc(
  doc: Pick<KnowledgeDocument, 'slug' | 'metadata'>,
  rows: Array<{ scenario_id: string; focus_area: string | null; knowledge_slugs: string[] | null }>,
  titleOf: (scenarioId: string) => string,
): ScenarioLink[] {
  const focus = resolveDocFocus(doc.metadata);
  const links: ScenarioLink[] = [];
  for (const row of rows) {
    const attached = Array.isArray(row.knowledge_slugs) && row.knowledge_slugs.includes(doc.slug);
    // An explicit attachment list overrides focus filtering at retrieval time,
    // so a scenario with attachments only "uses" this doc if it's in the list.
    const hasAttachments = Array.isArray(row.knowledge_slugs) && row.knowledge_slugs.length > 0;
    if (attached) {
      links.push({ scenario_id: row.scenario_id, label: titleOf(row.scenario_id), via: 'attached' });
    } else if (!hasAttachments && focus && row.focus_area === focus) {
      links.push({ scenario_id: row.scenario_id, label: titleOf(row.scenario_id), via: 'focus' });
    }
  }
  return links;
}

// ─── Fetchers ───────────────────────────────────────────────────────────────

export interface UpdateKnowledgeBody {
  slug: string;
  /** Admin-uploaded documents only — built-ins are rebuilt by re-seeding. */
  title?: string;
  category?: string;
  /** Focus-area key, or null to clear. Omit to leave unchanged. */
  focus?: string | null;
  /** Citation line, or null to clear. Omit to leave unchanged. */
  citation?: string | null;
}

export interface UpdateKnowledgeResult {
  ok: true;
  slug: string;
  focus: string | null;
  citation: string | null;
  chunks_updated: number;
}

/**
 * Save a document's cataloguing. Cheap: no re-extraction, no re-embedding —
 * it rewrites the document row and syncs its chunk tags so focus-filtered
 * retrieval sees the change.
 */
export function updateKnowledgeDocument(
  body: UpdateKnowledgeBody,
): Promise<UpdateKnowledgeResult> {
  return postJson<UpdateKnowledgeResult>('admin-knowledge', { op: 'update', ...body });
}
