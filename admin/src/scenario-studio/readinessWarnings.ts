/**
 * Readiness WARNINGS — the places where the AI will quietly be generic.
 *
 * They advise, they never block: every item built here is `recommended`, so
 * `canPublish` is unchanged by them. Two gaps are spotted:
 *
 *   1. A TEAM objection with no hidden concerns (`coaching.rootConcerns`).
 *      Those lines are what the AI owner keeps under the surface (revealed
 *      only when the trainee asks good questions) and the scorer's answer key
 *      for "did the trainee surface the real concern". Without them the owner
 *      has nothing to reveal and the scorecard judges in general terms.
 *      Built-in objections always carry the hand-written taxonomy
 *      (src/data/knowledge/pushbackTaxonomy.ts) — never warned about.
 *   2. A scenario that INHERITS its category's documents when none of them is
 *      filed for session scoring AND for the scenario's animal (tool and
 *      species are HARD retrieval scopes). The scorer then falls back to the
 *      rest of the library, so the scorecard never cites the category's
 *      documents. Said only once the library has loaded — never a guess.
 *
 * Pure — no React, no fetches. Unit-tested in ./__tests__/readinessWarnings.test.ts.
 */
import { readKnowledgeScope } from '../../../src/shared/knowledge/knowledgeScopes';
import {
  categoryKnowledgeFor,
  effectiveKnowledge,
  objectionCategoryId,
  type ObjectionCategory,
} from '../../../src/shared/scenarios/objectionCategories';
import { isTeamObjectionId, type ObjectionCoaching } from '../../../src/shared/scenarios/objections';
import { retrievalSpeciesFor } from '../../../src/shared/scenarios/species';
import type { ReadinessItem, StudioContext } from './studioModel';

// ─────────────────────────────────────────────────────────────
// 1 · Objections without hidden concerns
// ─────────────────────────────────────────────────────────────

/** The one-line warning on an objection row (Categories tab). */
export const NO_HIDDEN_CONCERNS = 'No hidden concerns — the AI owner and the scoring will be generic';

/** Why the "What the owner is really worried about" box matters (objection editor). */
export const HIDDEN_CONCERNS_WHY =
  'The AI owner keeps these under the surface and reveals them only when the trainee asks good questions, and the scoring uses them to judge whether the trainee found the real concern. Without any, the owner has nothing to reveal and the scorecard can only judge in general terms. (Trainee hints come from the other boxes.)';

/** How many hidden concerns an objection carries (blank lines don't count). */
export function hiddenConcernCount(o: { coaching?: ObjectionCoaching | null }): number {
  return (o.coaching?.rootConcerns ?? []).filter((l) => typeof l === 'string' && l.trim() !== '').length;
}

/**
 * A TEAM objection with nothing under the surface. Always false for a
 * built-in (coached by the taxonomy) and for "Something else".
 */
export function lacksHiddenConcerns(o: { id: string; coaching?: ObjectionCoaching | null }): boolean {
  return isTeamObjectionId(o.id) && hiddenConcernCount(o) === 0;
}

export interface ObjectionConcerns {
  title: string;
  /** Hidden concerns it carries (0 = the AI owner and the scorer go generic). */
  count: number;
}

/**
 * The draft's TEAM objection and how many hidden concerns it carries — null
 * for a built-in, "Something else", none, or a team id that isn't in the
 * loaded list (deleted / unknown / not loaded yet: other checks say so).
 * Retired and other-animal objections still play, so they are counted.
 */
export function objectionConcernsFor(
  pushbackId: string | null | undefined,
  team: ReadonlyArray<{ id: string; title: string; coaching?: ObjectionCoaching | null }>,
): ObjectionConcerns | null {
  if (!isTeamObjectionId(pushbackId)) return null;
  const hit = team.find((o) => o.id === pushbackId);
  return hit ? { title: hit.title, count: hiddenConcernCount(hit) } : null;
}

// ─────────────────────────────────────────────────────────────
// 2 · Inherited category knowledge the scorer can't read
// ─────────────────────────────────────────────────────────────

export type RetrievalAnimal = 'dog' | 'puppy' | 'cat';

const ANIMAL_PLURAL: Record<RetrievalAnimal, string> = {
  dog: 'dogs',
  puppy: 'puppies',
  cat: 'cats',
};

export interface CategoryScoringReach {
  /** The category's name. */
  name: string;
  /** The scenario's retrieval species (a HARD scope). */
  animal: RetrievalAnimal;
  /** Documents attached to the category. */
  attached: number;
  /** Of those, the ones filed for `scoring` and for `animal`. */
  readable: number;
}

/**
 * Can session scoring read the documents this scenario INHERITS from its
 * category, for its animal? Null when there is nothing to say: the library
 * isn't loaded (`docs` null), the scenario picked its own knowledge, its
 * category has no documents attached (a topic alone is a soft filter over the
 * whole library), or it has no category.
 */
export function categoryScoringReach(args: {
  draft: {
    pushback_id?: string | null;
    focus_area?: string | null;
    knowledge_slugs?: readonly string[] | null;
    species?: unknown;
    life_stage?: string | null;
  };
  team: ReadonlyArray<{ id: string; categoryId: string }>;
  categories: readonly ObjectionCategory[];
  docs: ReadonlyArray<{ slug: string; metadata?: unknown }> | null;
}): CategoryScoringReach | null {
  const { draft, team, categories, docs } = args;
  if (!docs) return null;
  const categoryId = objectionCategoryId(draft.pushback_id, team);
  const category = categoryId ? categories.find((c) => c.id === categoryId) ?? null : null;
  if (!category || category.knowledgeSlugs.length === 0) return null;
  const used = effectiveKnowledge(
    { focusArea: draft.focus_area ?? null, knowledgeSlugs: draft.knowledge_slugs ?? null },
    categoryKnowledgeFor(draft.pushback_id, team, categories),
  );
  if (used.source !== 'category') return null;
  const animal = retrievalSpeciesFor(draft.species, draft.life_stage);
  const bySlug = new Map(docs.map((d) => [d.slug, d] as const));
  const readable = category.knowledgeSlugs.filter((slug) => {
    const doc = bySlug.get(slug);
    if (!doc) return false;
    const scope = readKnowledgeScope(doc.metadata);
    return scope.tools.includes('scoring') && scope.species.includes(animal);
  }).length;
  return { name: category.name, animal, attached: category.knowledgeSlugs.length, readable };
}

// ─────────────────────────────────────────────────────────────
// Checklist rows (all `recommended` — they never block publishing)
// ─────────────────────────────────────────────────────────────

/** The hidden-concerns row, for a scenario on a (resolvable) team objection. */
export function objectionConcernsReadiness(ctx: Pick<StudioContext, 'objectionConcerns'>): ReadinessItem[] {
  const c = ctx.objectionConcerns;
  if (!c) return [];
  const ok = c.count > 0;
  return [
    {
      key: 'objection-concerns',
      label: 'The objection says what the owner is really worried about',
      ok,
      level: 'recommended',
      detail: ok
        ? undefined
        : `“${c.title}” has no hidden concerns, so the AI owner has nothing under the surface to reveal and the scoring can’t check whether the trainee found the real worry. Add them in the objection’s Coaching: “What the owner is really worried about”.`,
      step: 'pushback',
    },
  ];
}

/** The scoring-reach row, for a scenario reading its category's documents. */
export function categoryScoringReadiness(ctx: Pick<StudioContext, 'categoryScoring'>): ReadinessItem[] {
  const r = ctx.categoryScoring;
  if (!r) return [];
  const ok = r.readable > 0;
  const animals = ANIMAL_PLURAL[r.animal];
  return [
    {
      key: 'category-scoring',
      label: `The scorecard can draw on the ${r.name} documents`,
      ok,
      level: 'recommended',
      detail: ok
        ? undefined
        : `None of the ${r.name} documents are filed for scoring for ${animals}, so the scorecard won’t cite them. In Knowledge, add “Session scoring” and ${animals} to at least one of them.`,
      step: 'knowledge',
    },
  ];
}

/** The open warnings of a checklist: what's advised and not yet done. */
export function readinessWarnings(items: readonly ReadinessItem[]): ReadinessItem[] {
  return items.filter((i) => !i.ok && i.level === 'recommended');
}
