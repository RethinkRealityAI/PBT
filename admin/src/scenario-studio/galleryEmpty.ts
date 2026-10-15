/**
 * What the Studio gallery says — and offers — when its filters leave nothing.
 *
 * "Cats 0" is rarely a dead end: it usually means nobody has written a cat
 * scenario yet. So the empty state names what's missing in plain words
 * ("No cat scenarios in Weight management yet") and, when the admin can
 * write scenarios, offers to start exactly that one — the builder opens with
 * the animal (and the objection, or the category's objections) already
 * chosen. Where creating makes no sense it isn't offered: trainee-built
 * scenarios are made by trainees in the app, and a Live filter with drafts
 * waiting is better answered by those drafts.
 *
 * Pure — no React. Unit-tested in ./__tests__/galleryEmpty.test.ts.
 */
import type { ScenarioSpecies } from '../../../src/shared/scenarios/species';
import { speciesOf } from '../../../src/shared/scenarios/species';
import { isBuiltInObjectionId } from '../../../src/shared/scenarios/objections';
import type { ObjectionCategory } from '../../../src/shared/scenarios/objectionCategories';
import { objectionLabel } from './objections/objectionsModel';
import {
  ALL_CATEGORIES,
  ALL_OBJECTIONS,
  NO_CATEGORY,
  type GalleryObjectionRef,
  type GallerySelection,
  type StudioEntry,
} from './studioModel';

/** A new scenario that fits the filters on screen. */
export interface GalleryCreatePlan {
  /** The button's words: "Create your first cat scenario". */
  label: string;
  /** The animal the builder starts with (null = the admin picks it on step 1). */
  species: ScenarioSpecies | null;
  /** The objection the builder starts with (a usable built-in or team id). */
  pushbackId: string | null;
  /** With no single objection: the category the Pushback step opens on. */
  categoryId: string | null;
}

export interface EmptyGalleryState {
  title: string;
  body: string;
  /** The primary action, or null when creating doesn't fit (or the role can't). */
  create: GalleryCreatePlan | null;
  /** Live is empty but this many drafts match the other filters — offer to show them. */
  draftsWaiting: number;
  /** Some filter is narrowing the list — offer "Show all scenarios". */
  showAll: boolean;
  /** A search is narrowing the list — offer "Clear search". */
  clearSearch: boolean;
}

export interface EmptyGalleryInput {
  selection: GallerySelection;
  query: string;
  canWrite: boolean;
  /** Every scenario the Studio lists, before any search or filter. */
  entries: readonly StudioEntry[];
  /** How many drafts match the animal / category / objection filters (the Drafts chip's count). */
  draftsMatching: number;
  /** The team's objections (active + retired), with their animals and categories when known. */
  team: readonly GalleryObjectionRef[];
  /** Every live category (built-ins included), for names. */
  categories: readonly Pick<ObjectionCategory, 'id' | 'name'>[];
}

/** Objection names can be long sentences; a button shouldn't be. */
const LABEL_MAX = 40;

function clip(text: string): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > LABEL_MAX ? `${flat.slice(0, LABEL_MAX - 1).trimEnd()}…` : flat;
}

/**
 * The objection a new scenario can start from, or null when it can't: a
 * retired, deleted or unknown team objection, or one set up only for the
 * other animal. Returns the animal it pins down when it is for one only.
 */
function usableObjection(
  id: string,
  species: ScenarioSpecies | null,
  team: readonly GalleryObjectionRef[],
): { id: string; species: ScenarioSpecies | null } | null {
  if (isBuiltInObjectionId(id)) return { id, species };
  const hit = team.find((o) => o.id === id);
  if (!hit || hit.visible === false) return null;
  const animals = (hit.species ?? []).filter((s): s is ScenarioSpecies => s === 'dog' || s === 'cat');
  if (animals.length === 0) return { id, species };
  if (species) return animals.includes(species) ? { id, species } : null;
  return { id, species: animals.length === 1 ? animals[0] : null };
}

function categoryLabel(id: string, list: readonly Pick<ObjectionCategory, 'id' | 'name'>[]): string | null {
  return list.find((c) => c.id === id)?.name ?? null;
}

/**
 * The scenario to offer for these filters (ignoring the status chip, which
 * the caller decides about). Most specific first: the objection, then the
 * category, then the animal.
 */
export function galleryCreatePlan(input: Omit<EmptyGalleryInput, 'query' | 'canWrite' | 'draftsMatching'>): GalleryCreatePlan {
  const { selection: sel, entries, team, categories } = input;
  const species: ScenarioSpecies | null = sel.animal === 'all' ? null : sel.animal;
  const animal = species ? `${species} ` : '';

  if (sel.objection !== ALL_OBJECTIONS) {
    const usable = usableObjection(sel.objection, species, team);
    if (usable) {
      const pinned = usable.species ? `${usable.species} ` : '';
      return {
        label:
          usable.id === 'custom'
            ? `Add a ${pinned}scenario with its own objection`
            : pinned
              ? `Add a ${pinned}scenario for “${clip(objectionLabel(usable.id, team))}”`
              : `Add a “${clip(objectionLabel(usable.id, team))}” scenario`,
        species: usable.species,
        pushbackId: usable.id,
        categoryId: null,
      };
    }
  }

  const category = sel.category ?? ALL_CATEGORIES;
  if (category !== ALL_CATEGORIES && category !== NO_CATEGORY) {
    const name = categoryLabel(category, categories);
    if (name) {
      return { label: `Create a ${animal}scenario in ${clip(name)}`, species, pushbackId: null, categoryId: category };
    }
  }

  // "Your first" only when the team's library really has none of them —
  // trainees' own scenarios aren't the team's.
  const first = !entries.some(
    (e) => e.source !== 'user' && (species === null || speciesOf(e.draft.species) === species),
  );
  return {
    label: first ? `Create your first ${animal}scenario` : `Create a ${animal}scenario`,
    species,
    pushbackId: null,
    categoryId: null,
  };
}

/** "cat scenarios in Weight management" — what the filters are looking for. */
function scopeNoun(input: EmptyGalleryInput): { noun: string; narrowed: boolean } {
  const { selection: sel, team, categories } = input;
  const animal = sel.animal === 'all' ? '' : `${sel.animal} `;
  let qualifier = '';
  if (sel.objection !== ALL_OBJECTIONS) {
    qualifier =
      sel.objection === 'custom'
        ? ' with their own objection'
        : ` for “${clip(objectionLabel(sel.objection, team))}”`;
  } else if ((sel.category ?? ALL_CATEGORIES) === NO_CATEGORY) {
    qualifier = ' outside a category';
  } else if ((sel.category ?? ALL_CATEGORIES) !== ALL_CATEGORIES) {
    const name = categoryLabel(sel.category as string, categories);
    qualifier = ` in ${clip(name ?? 'this category')}`;
  }
  return { noun: `${animal}scenarios${qualifier}`, narrowed: Boolean(animal || qualifier) };
}

export function emptyGalleryState(input: EmptyGalleryInput): EmptyGalleryState {
  const { selection: sel, canWrite } = input;
  const q = input.query.trim();
  const filtered =
    sel.status !== 'all' ||
    sel.animal !== 'all' ||
    (sel.category ?? ALL_CATEGORIES) !== ALL_CATEGORIES ||
    sel.objection !== ALL_OBJECTIONS;
  const none: Omit<EmptyGalleryState, 'title' | 'body'> = {
    create: null,
    draftsWaiting: 0,
    showAll: filtered,
    clearSearch: false,
  };
  const plan = () => (canWrite ? galleryCreatePlan(input) : null);

  if (q) {
    return {
      ...none,
      title: `Nothing matches “${q}”`,
      body: filtered
        ? 'Try a breed, a pushback or a driver — or clear the search and the filters.'
        : 'Try a breed, a pushback or a driver — or clear the search.',
      clearSearch: true,
    };
  }

  if (!filtered) {
    return {
      ...none,
      title: 'No scenarios yet',
      body: canWrite
        ? 'Describe one above, or build it one step at a time.'
        : 'Nothing has been built yet.',
      create: canWrite ? { ...galleryCreatePlan(input), label: 'Create your first scenario' } : null,
    };
  }

  const { noun, narrowed } = scopeNoun(input);
  switch (sel.status) {
    case 'trainee':
      return {
        ...none,
        title: narrowed ? `No trainee-built ${noun}` : 'No trainee-built scenarios yet',
        body: 'When a trainee builds their own scenario in the app, it shows up here.',
      };
    case 'builtin':
      return {
        ...none,
        title: `No built-in ${noun}`,
        body: canWrite
          ? 'None ship with the app — your team can write its own.'
          : 'None ship with the app.',
        create: plan(),
      };
    case 'live': {
      const waiting = Math.max(0, input.draftsMatching);
      if (waiting > 0) {
        return {
          ...none,
          title: narrowed ? `No ${noun} are live yet` : 'Nothing is live yet',
          body:
            waiting === 1
              ? 'One is waiting as a draft — open it and publish it when it’s ready.'
              : `${waiting} are waiting as drafts — open one and publish it when it’s ready.`,
          draftsWaiting: waiting,
        };
      }
      return {
        ...none,
        title: narrowed ? `No ${noun} are live yet` : 'Nothing is live yet',
        body: 'Trainees can’t practise one until it’s published.',
        create: plan(),
      };
    }
    case 'drafts':
      return {
        ...none,
        title: narrowed ? `No ${noun} in draft` : 'No drafts right now',
        body: canWrite
          ? 'A new scenario stays a draft — hidden from trainees — until you publish it.'
          : 'Nothing is waiting to be published.',
        create: plan(),
      };
    default:
      return {
        ...none,
        title: `No ${noun} yet`,
        body: canWrite
          ? 'Start one now — it stays hidden from trainees until you publish it.'
          : 'Try another animal or objection — or show everything.',
        create: plan(),
      };
  }
}
