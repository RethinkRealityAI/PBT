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
import { apiFetch, postJson } from '../lib/api';
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
  /**
   * Chunks whose tag rewrite failed. The document row still saved, but those
   * sections keep their old focus tag — i.e. focus-filtered retrieval is
   * partially stale until the save is repeated.
   */
  chunk_failures?: string[];
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

/** A soft-deleted document, as listed by `GET admin-knowledge?trash=1`. */
export interface DeletedKnowledgeDocument {
  slug: string;
  title: string;
  category: string;
  deleted_at: string;
}

/** The "Recently deleted" drawer: soft-deleted documents, newest first. */
export function fetchDeletedKnowledge(): Promise<DeletedKnowledgeDocument[]> {
  return apiFetch<{ documents?: DeletedKnowledgeDocument[] }>('admin-knowledge', {
    trash: 1,
  }).then((res) => res.documents ?? []);
}

/** Undo a soft delete. Scenario links pruned at delete time do NOT come back. */
export function restoreKnowledgeDocument(
  slug: string,
): Promise<{ ok: true; slug: string }> {
  return postJson<{ ok: true; slug: string }>('admin-knowledge', {
    op: 'restore',
    slug,
  });
}

// ─── Consequence + outcome copy (pure — unit-tested) ────────────────────────

/**
 * What deleting this document actually costs, one concrete bullet per effect.
 *
 * The scenario list is the part people don't expect: a delete silently prunes
 * the slug out of every scenario that attached it, and restoring does not put
 * those attachments back.
 */
export function deleteConsequences(links: ScenarioLink[]): string[] {
  const out: string[] = [];
  const attached = links.filter((l) => l.via === 'attached');
  const viaFocus = links.filter((l) => l.via === 'focus');
  if (attached.length > 0) {
    out.push(
      `Detaches it from ${attached.length} scenario${attached.length === 1 ? '' : 's'}: ${attached
        .map((l) => l.label)
        .join(', ')} — restoring does not re-attach them.`,
    );
  }
  if (viaFocus.length > 0) {
    out.push(
      `${viaFocus.length} scenario${viaFocus.length === 1 ? '' : 's'} filtered to this focus area stop drawing on it: ${viaFocus
        .map((l) => l.label)
        .join(', ')}.`,
    );
  }
  if (links.length === 0) {
    out.push('No scenario attaches this document today.');
  }
  out.push('Recoverable from “Recently deleted” at the bottom of this screen.');
  return out;
}

export interface BatchOutcome {
  /** How many documents the run tried to index. */
  attempted: number;
  failures?: string[];
  /** Slugs left alone because they are in Recently deleted. */
  skippedDeleted?: string[];
  /** "documents", "studies" — plural noun for the message. */
  noun: string;
}

/**
 * Honest one-liner for a bulk run. A partial failure used to render as a plain
 * "✓ 13 documents ready", which is how a half-indexed corpus goes unnoticed.
 */
export function batchOutcomeMessage(o: BatchOutcome): {
  message: string;
  tone: 'success' | 'info' | 'error';
} {
  const failures = o.failures ?? [];
  const skipped = o.skippedDeleted ?? [];
  const ok = Math.max(0, o.attempted - failures.length);
  const skippedNote =
    skipped.length > 0
      ? ` ${skipped.length} skipped — still in Recently deleted.`
      : '';

  if (failures.length === 0) {
    return {
      message: `${o.attempted} ${o.noun} indexed.${skippedNote}`,
      tone: 'success',
    };
  }
  return {
    message: `${ok} of ${o.attempted} ${o.noun} indexed — ${failures.length} failed.${skippedNote}`,
    tone: ok === 0 ? 'error' : 'info',
  };
}
