/**
 * Knowledge step — the pure rules behind "What should the AI know?".
 *
 * No React, no fetches: mode derivation and switching, per-document status
 * (searchable / readable by the roleplay / right species), topic counts, the
 * plain-words scope sentence for a preview, and the upload defaults. Every
 * rule here mirrors what retrieval really does server-side
 * (`netlify/functions/_shared/retrieval.ts`): tool + species are HARD scopes,
 * attached documents run INSIDE that scope, and a focus with nothing behind
 * it falls back to the whole library.
 */
import type { KnowledgeDocument } from '../../data/types';
import { resolveDocFocus, resolveDocScope } from '../../data/knowledgeActions';
import { focusAreaLabel, FOCUS_AREAS } from '../../../../src/shared/knowledge/focusAreas';
import {
  ALL_KNOWLEDGE_SPECIES,
  DEFAULT_KNOWLEDGE_TOOLS,
  KNOWLEDGE_SPECIES,
  normalizeKnowledgeTools,
} from '../../../../src/shared/knowledge/knowledgeScopes';
import { retrievalSpeciesFor } from '../../../../src/shared/scenarios/species';
import { SCENARIO_LIMITS } from '../../../../src/shared/scenarios/limits';
import type { KnowledgeMode } from '../../../../src/shared/ai/scenarioAgent';
import { hasText, type StudioDraft, type StudioStepKey } from '../studioModel';

export type { KnowledgeMode } from '../../../../src/shared/ai/scenarioAgent';

// ── Mode ─────────────────────────────────────────────────────

/**
 * Where the AI looks, read off the draft. Attached documents win over a
 * topic (retrieval ignores the focus once any are attached), a topic wins
 * over nothing, nothing means the whole library.
 */
export function knowledgeModeOf(draft: StudioDraft): KnowledgeMode {
  if ((draft.knowledge_slugs?.length ?? 0) > 0) return 'documents';
  if (hasText(draft.focus_area)) return 'focus';
  return 'library';
}

export interface ModeSwitch {
  /** What to merge into the draft. */
  patch: StudioDraft;
  /** One sentence saying what the switch removed, or null when nothing was. */
  cleared: string | null;
  /** Merging this puts the knowledge fields back exactly as they were. */
  undo: StudioDraft;
}

function docCount(n: number): string {
  return `${n} attached document${n === 1 ? '' : 's'}`;
}

/**
 * Switching mode clears the OTHER setting — a scenario searches one way at a
 * time, and a hidden leftover (a topic under attached documents) is exactly
 * the kind of setting nobody can explain later. The caller shows `cleared`
 * with an Undo built from `undo`.
 */
export function switchKnowledgeMode(draft: StudioDraft, mode: KnowledgeMode): ModeSwitch {
  const slugs = draft.knowledge_slugs ?? [];
  const focus = hasText(draft.focus_area) ? (draft.focus_area as string) : null;
  const undo: StudioDraft = {
    focus_area: draft.focus_area ?? null,
    knowledge_slugs: draft.knowledge_slugs ?? null,
  };
  const topicName = focus ? `the topic “${focusAreaLabel(focus)}”` : null;
  const docsName = slugs.length ? docCount(slugs.length) : null;

  if (mode === 'library') {
    const parts = [topicName, docsName].filter(Boolean) as string[];
    return {
      patch: { focus_area: null, knowledge_slugs: null },
      cleared: parts.length ? `Removed ${parts.join(' and ')}.` : null,
      undo,
    };
  }
  if (mode === 'focus') {
    return {
      patch: { knowledge_slugs: null },
      cleared: docsName ? `Detached ${docsName} — a topic search reads the whole library filtered to one subject.` : null,
      undo,
    };
  }
  return {
    patch: { focus_area: null },
    cleared: topicName
      ? `Cleared ${topicName} — with specific documents the AI reads only what you tick.`
      : null,
    undo,
  };
}

// ── Species scope ────────────────────────────────────────────

export type RetrievalSpecies = 'dog' | 'puppy' | 'cat';

/** The species scope retrieval will apply for this draft (undefined = none). */
export function draftRetrievalSpecies(draft: StudioDraft): RetrievalSpecies | undefined {
  return retrievalSpeciesFor(draft.species, draft.life_stage);
}

const SPECIES_PLURAL: Record<RetrievalSpecies, string> = {
  dog: 'dogs',
  puppy: 'puppies',
  cat: 'cats',
};

export function speciesPlural(species: RetrievalSpecies): string {
  return SPECIES_PLURAL[species];
}

const SCOPE_PLURAL: Record<string, string> = {
  dog: 'adult dogs',
  puppy: 'puppies',
  cat: 'cats',
};

function speciesListPhrase(keys: readonly string[]): string {
  const labels = keys.map(
    (k) => SCOPE_PLURAL[k] ?? KNOWLEDGE_SPECIES.find((s) => s.key === k)?.label.toLowerCase() ?? k,
  );
  if (labels.length <= 1) return labels[0] ?? '';
  return `${labels.slice(0, -1).join(', ')} and ${labels[labels.length - 1]}`;
}

// ── Per-document status ──────────────────────────────────────

export interface DocStatus {
  /** It has a search index (chunks) — otherwise nothing can be retrieved. */
  searchable: boolean;
  /** The roleplay customer is allowed to read it (tool scope). */
  usedByRoleplay: boolean;
  /** Set when the document's species scope excludes this scenario's animal. */
  speciesBlock: { label: string; reason: string } | null;
  /** Ticking it would actually change what the AI reads. */
  attachable: boolean;
}

export function docStatus(doc: KnowledgeDocument, scope: RetrievalSpecies | undefined): DocStatus {
  const docScope = resolveDocScope(doc.metadata);
  const usedByRoleplay = docScope.tools.includes('roleplay');
  let speciesBlock: DocStatus['speciesBlock'] = null;
  if (scope && !docScope.species.includes(scope)) {
    const plural = speciesPlural(scope);
    speciesBlock = {
      label: `Not for ${plural}`,
      reason: `It’s filed for ${speciesListPhrase(docScope.species)} only, so a scenario about ${plural} never reads it. Widen its species in Knowledge to use it here.`,
    };
  }
  return {
    searchable: doc.chunk_count > 0,
    usedByRoleplay,
    speciesBlock,
    attachable: usedByRoleplay && speciesBlock === null,
  };
}

/** Why a roleplay-blocked document is greyed out, and how to fix it. */
export const NOT_ROLEPLAY_REASON =
  'The AI customer isn’t allowed to read this document, so attaching it would do nothing. In Knowledge, add “Roleplay customer” to its “Used by” list first.';

export const NOT_SEARCHABLE_REASON =
  'It has no search index yet, so nothing can be read from it. In Knowledge, open it and press “Rebuild search index”.';

/**
 * How many documents the AI customer could actually read under each topic
 * for this scenario — roleplay-readable, indexed, right species. A topic
 * with zero does not narrow anything: retrieval finds nothing and falls back
 * to the whole library.
 */
export function focusCounts(
  docs: readonly KnowledgeDocument[],
  scope: RetrievalSpecies | undefined,
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const f of FOCUS_AREAS) counts.set(f.key, 0);
  for (const doc of docs) {
    const focus = resolveDocFocus(doc.metadata);
    if (!focus) continue;
    const s = docStatus(doc, scope);
    if (!s.attachable || !s.searchable) continue;
    counts.set(focus, (counts.get(focus) ?? 0) + 1);
  }
  return counts;
}

/** Documents the AI customer could read for this scenario in "Whole library" mode. */
export function readableDocCount(
  docs: readonly KnowledgeDocument[],
  scope: RetrievalSpecies | undefined,
): number {
  return docs.filter((d) => {
    const s = docStatus(d, scope);
    return s.attachable && s.searchable;
  }).length;
}

// ── Attaching ────────────────────────────────────────────────

export const KNOWLEDGE_CAP = SCENARIO_LIMITS.knowledgeSlugsMax;

/** Tick / untick one document. An empty list goes back to `null`. */
export function toggleSlug(selected: readonly string[], slug: string): string[] | null {
  const next = selected.includes(slug)
    ? selected.filter((s) => s !== slug)
    : [...selected, slug];
  return next.length ? next : null;
}

/**
 * The patch that attaches a freshly uploaded document: documents mode, the
 * new slug added once, the topic cleared (it would be ignored anyway).
 */
export function attachSlugPatch(draft: StudioDraft, slug: string): StudioDraft {
  const current = draft.knowledge_slugs ?? [];
  return {
    knowledge_slugs: current.includes(slug) ? [...current] : [...current, slug],
    focus_area: null,
  };
}

// ── Preview ──────────────────────────────────────────────────

const RETRIEVAL_FIELDS: Array<keyof StudioDraft> = [
  'species',
  'breed',
  'life_stage',
  'weight_kg',
  'pushback_id',
  'pushback_notes',
  'context_override',
  'suggested_driver',
  'persona_override',
  'difficulty_override',
  'opening_line_override',
  'focus_area',
  'knowledge_slugs',
];

const PROMPT_FIELDS: Array<keyof StudioDraft> = [
  ...RETRIEVAL_FIELDS,
  'prompt_prefix',
  'prompt_suffix',
];

/**
 * A fingerprint of the draft fields a preview depends on. When it changes
 * after a fetch, the preview on screen describes a draft that no longer
 * exists — the UI marks it stale rather than pretending.
 */
export function inspectSignature(draft: StudioDraft, kind: 'knowledge' | 'prompt'): string {
  const fields = kind === 'prompt' ? PROMPT_FIELDS : RETRIEVAL_FIELDS;
  const out: Record<string, unknown> = {};
  for (const f of fields) {
    const v = draft[f];
    out[f] = typeof v === 'string' ? v.trim() || null : (v ?? null);
  }
  return JSON.stringify(out);
}

/** Which step fixes a missing field (labels from `missingScenarioFields`). */
export function stepForMissing(label: string): StudioStepKey {
  const l = label.toLowerCase();
  if (l.includes('pushback')) return 'pushback';
  if (l.includes('driver') || l.includes('persona')) return 'customer';
  return 'pet';
}

function asStringList(v: unknown): string[] {
  if (Array.isArray(v)) return v.filter((x): x is string => typeof x === 'string');
  return typeof v === 'string' && v ? [v] : [];
}

/**
 * The applied retrieval scope in plain words:
 * "Searching: roleplay documents · cats · topic: Urinary health".
 * Tolerant of both filter spellings (`tools: [..]` as the database filter is
 * built, or a scalar `tool`).
 */
export function scopeSentence(
  applied: Record<string, unknown>,
  mode: KnowledgeMode,
  attachedCount: number,
): string {
  const tools = [...asStringList(applied.tools), ...asStringList(applied.tool)];
  const species = [...asStringList(applied.species)];
  const focus = typeof applied.focus === 'string' && applied.focus ? applied.focus : null;
  const slugCount = asStringList(applied.docSlugs).length || attachedCount;

  const parts: string[] = [
    tools.length === 0 || tools.includes('roleplay') ? 'roleplay documents' : `${tools.join(', ')} documents`,
  ];
  if (species.length) {
    parts.push(
      species
        .map((s) => (s === 'dog' || s === 'puppy' || s === 'cat' ? speciesPlural(s) : s))
        .join(', '),
    );
  } else {
    parts.push('every species');
  }
  if (mode === 'documents' && slugCount > 0) {
    parts.push(`only the ${slugCount} attached`);
  } else if (focus) {
    parts.push(`topic: ${focusAreaLabel(focus)}`);
  } else {
    parts.push('whole library');
  }
  return `Searching: ${parts.join(' · ')}`;
}

/** "78% match" — or null when the passage wasn't ranked. */
export function relevanceLabel(similarity: number | null | undefined): string | null {
  if (typeof similarity !== 'number' || !Number.isFinite(similarity)) return null;
  const pct = Math.round(Math.max(0, Math.min(1, similarity)) * 100);
  return `${pct}% match`;
}

// ── Upload defaults ──────────────────────────────────────────

/**
 * Tools a document uploaded from the Studio is filed for: the training set,
 * which always includes the roleplay customer and the scorer — uploading
 * "for this scenario" means both must be able to read it.
 */
export function studioUploadTools(): string[] {
  return normalizeKnowledgeTools([...DEFAULT_KNOWLEDGE_TOOLS, 'roleplay', 'scoring']);
}

/**
 * Default species for an upload: this scenario's animal (a dog scenario gets
 * adult dogs AND puppies — the life stage can change later), or every
 * species when the scenario never said.
 */
export function uploadSpeciesDefault(draft: StudioDraft): string[] {
  if (draft.species === 'cat') return ['cat'];
  if (draft.species === 'dog') return ['dog', 'puppy'];
  return [...ALL_KNOWLEDGE_SPECIES];
}

/** Toggle a species key, keeping vocabulary order. */
export function toggleSpeciesKey(selected: readonly string[], key: string): string[] {
  const next = selected.includes(key) ? selected.filter((k) => k !== key) : [...selected, key];
  return KNOWLEDGE_SPECIES.map((s) => s.key).filter((k) => next.includes(k));
}
