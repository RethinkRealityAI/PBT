import { describe, expect, it } from 'vitest';
import { PUSHBACK_LABELS } from '../../../../src/shared/scenarios/enums';
import { emptyGalleryState, galleryCreatePlan, type EmptyGalleryInput } from '../galleryEmpty';
import {
  ALL_CATEGORIES,
  ALL_OBJECTIONS,
  NO_CATEGORY,
  type GalleryObjectionRef,
  type GallerySelection,
  type StudioEntry,
} from '../studioModel';

function entry(id: string, source: StudioEntry['source'], species: 'dog' | 'cat' | null): StudioEntry {
  return {
    id,
    source,
    title: id,
    override: null,
    userScenario: null,
    manifest: null,
    draft: { scenario_id: id, species },
    status: source === 'user' ? 'trainee' : 'draft',
    editedAt: null,
  };
}

const DOGS = [entry('seed:0', 'library', null), entry('admin:a', 'admin', 'dog')];
const CATEGORIES = [
  { id: 'everyday-nutrition', name: 'Everyday nutrition' },
  { id: 'weight', name: 'Weight management' },
  { id: 'category:gi', name: 'GI' },
];
const TEAM: GalleryObjectionRef[] = [
  { id: 'team:hairballs', title: 'Hairballs are normal', categoryId: 'category:gi', species: ['cat'], visible: true },
  { id: 'team:walks', title: 'He gets enough walks', categoryId: 'weight', species: ['dog'], visible: true },
  { id: 'team:both', title: 'Probiotics are a fad', categoryId: 'category:gi', species: ['dog', 'cat'], visible: true },
  { id: 'team:old', title: 'Retired one', categoryId: 'category:gi', species: ['dog', 'cat'], visible: false },
  {
    id: 'team:long',
    title: 'My pet has eaten the same food for twelve years and has never once been ill',
    categoryId: 'category:gi',
    species: ['dog', 'cat'],
    visible: true,
  },
];

function sel(over: Partial<GallerySelection> = {}): GallerySelection {
  return { status: 'all', animal: 'all', category: ALL_CATEGORIES, objection: ALL_OBJECTIONS, ...over };
}

function input(over: Partial<EmptyGalleryInput> = {}): EmptyGalleryInput {
  return {
    selection: sel(),
    query: '',
    canWrite: true,
    entries: DOGS,
    draftsMatching: 0,
    team: TEAM,
    categories: CATEGORIES,
    ...over,
  };
}

describe('galleryCreatePlan', () => {
  it('offers the first cat scenario when the library has none', () => {
    expect(galleryCreatePlan(input({ selection: sel({ animal: 'cat' }) }))).toEqual({
      label: 'Create your first cat scenario',
      species: 'cat',
      pushbackId: null,
      categoryId: null,
    });
  });

  it('only says "first" when the team’s library really has none — trainees’ own don’t count', () => {
    const withTraineeCat = [...DOGS, entry('user:1', 'user', 'cat')];
    expect(galleryCreatePlan(input({ entries: withTraineeCat, selection: sel({ animal: 'cat' }) })).label).toBe(
      'Create your first cat scenario',
    );
    const withCat = [...DOGS, entry('admin:c', 'admin', 'cat')];
    expect(galleryCreatePlan(input({ entries: withCat, selection: sel({ animal: 'cat' }) })).label).toBe(
      'Create a cat scenario',
    );
    // A scenario with no species set is a dog.
    expect(galleryCreatePlan(input({ selection: sel({ animal: 'dog' }) })).label).toBe('Create a dog scenario');
  });

  it('opens on the filtered category', () => {
    expect(galleryCreatePlan(input({ selection: sel({ animal: 'cat', category: 'weight' }) }))).toEqual({
      label: 'Create a cat scenario in Weight management',
      species: 'cat',
      pushbackId: null,
      categoryId: 'weight',
    });
    expect(galleryCreatePlan(input({ selection: sel({ category: 'category:gi' }) })).label).toBe(
      'Create a scenario in GI',
    );
  });

  it('ignores a category it can’t name (deleted) and "not in a category"', () => {
    const gone = galleryCreatePlan(input({ selection: sel({ animal: 'cat', category: 'category:gone' }) }));
    expect(gone).toMatchObject({ categoryId: null, label: 'Create your first cat scenario' });
    const none = galleryCreatePlan(input({ selection: sel({ animal: 'cat', category: NO_CATEGORY }) }));
    expect(none).toMatchObject({ categoryId: null, pushbackId: null });
  });

  it('starts from a built-in objection', () => {
    expect(galleryCreatePlan(input({ selection: sel({ animal: 'cat', objection: 'cost' }) }))).toEqual({
      label: `Add a cat scenario for “${PUSHBACK_LABELS.cost}”`,
      species: 'cat',
      pushbackId: 'cost',
      categoryId: null,
    });
    expect(galleryCreatePlan(input({ selection: sel({ objection: 'cost' }) })).label).toBe(
      `Add a “${PUSHBACK_LABELS.cost}” scenario`,
    );
  });

  it('pins the animal of a one-animal team objection', () => {
    expect(galleryCreatePlan(input({ selection: sel({ objection: 'team:hairballs' }) }))).toEqual({
      label: 'Add a cat scenario for “Hairballs are normal”',
      species: 'cat',
      pushbackId: 'team:hairballs',
      categoryId: null,
    });
    // Both animals: nothing to pin.
    expect(galleryCreatePlan(input({ selection: sel({ objection: 'team:both' }) })).species).toBeNull();
  });

  it('never starts from an objection that can’t be picked — other animal, retired or unknown', () => {
    // Dog-only objection under the Cats filter: falls back to the category.
    expect(
      galleryCreatePlan(input({ selection: sel({ animal: 'cat', category: 'weight', objection: 'team:walks' }) })),
    ).toMatchObject({ pushbackId: null, categoryId: 'weight', label: 'Create a cat scenario in Weight management' });
    expect(galleryCreatePlan(input({ selection: sel({ objection: 'team:old' }) })).pushbackId).toBeNull();
    expect(galleryCreatePlan(input({ selection: sel({ objection: 'team:missing' }) })).pushbackId).toBeNull();
  });

  it('words "Something else" as its own objection', () => {
    expect(galleryCreatePlan(input({ selection: sel({ animal: 'dog', objection: 'custom' }) }))).toMatchObject({
      label: 'Add a dog scenario with its own objection',
      pushbackId: 'custom',
    });
  });

  it('keeps a long objection name short on the button', () => {
    const { label } = galleryCreatePlan(input({ selection: sel({ objection: 'team:long' }) }));
    expect(label).toMatch(/^Add a “My pet has eaten the same food for t.*…” scenario$/);
    expect(label.length).toBeLessThan(60);
  });
});

describe('emptyGalleryState', () => {
  it('first run: nothing at all — create your first scenario', () => {
    const s = emptyGalleryState(input({ entries: [] }));
    expect(s.title).toBe('No scenarios yet');
    expect(s.create?.label).toBe('Create your first scenario');
    expect(s.showAll).toBe(false);
    expect(emptyGalleryState(input({ entries: [], canWrite: false })).create).toBeNull();
  });

  it('names what the filters were looking for, and offers to create it', () => {
    const s = emptyGalleryState(input({ selection: sel({ animal: 'cat', category: 'weight' }) }));
    expect(s.title).toBe('No cat scenarios in Weight management yet');
    expect(s.create?.label).toBe('Create a cat scenario in Weight management');
    expect(s.showAll).toBe(true);
    expect(s.clearSearch).toBe(false);
  });

  it('says it plainly for an objection, and for "not in a category"', () => {
    expect(emptyGalleryState(input({ selection: sel({ animal: 'cat', objection: 'cost' }) })).title).toBe(
      `No cat scenarios for “${PUSHBACK_LABELS.cost}” yet`,
    );
    expect(emptyGalleryState(input({ selection: sel({ animal: 'cat', category: NO_CATEGORY }) })).title).toBe(
      'No cat scenarios outside a category yet',
    );
  });

  it('a read-only role gets the words but no create', () => {
    const s = emptyGalleryState(input({ canWrite: false, selection: sel({ animal: 'cat' }) }));
    expect(s.create).toBeNull();
    expect(s.showAll).toBe(true);
  });

  it('never offers to create a trainee-built scenario', () => {
    const s = emptyGalleryState(input({ selection: sel({ status: 'trainee', animal: 'cat' }) }));
    expect(s.title).toBe('No trainee-built cat scenarios');
    expect(s.create).toBeNull();
    expect(emptyGalleryState(input({ selection: sel({ status: 'trainee' }) })).title).toBe(
      'No trainee-built scenarios yet',
    );
  });

  it('built-in: none ship for cats — the team can write its own', () => {
    const s = emptyGalleryState(input({ selection: sel({ status: 'builtin', animal: 'cat' }) }));
    expect(s.title).toBe('No built-in cat scenarios');
    expect(s.create?.species).toBe('cat');
  });

  it('live: points at the drafts waiting rather than a new scenario', () => {
    const waiting = emptyGalleryState(input({ draftsMatching: 2, selection: sel({ status: 'live', animal: 'cat' }) }));
    expect(waiting.title).toBe('No cat scenarios are live yet');
    expect(waiting.draftsWaiting).toBe(2);
    expect(waiting.create).toBeNull();
    const none = emptyGalleryState(input({ selection: sel({ status: 'live' }) }));
    expect(none.title).toBe('Nothing is live yet');
    expect(none.create?.label).toBe('Create a scenario');
  });

  it('drafts: a new scenario starts as one', () => {
    const s = emptyGalleryState(input({ selection: sel({ status: 'drafts', animal: 'cat' }) }));
    expect(s.title).toBe('No cat scenarios in draft');
    expect(s.create?.label).toBe('Create your first cat scenario');
    expect(emptyGalleryState(input({ selection: sel({ status: 'drafts' }) })).title).toBe('No drafts right now');
  });

  it('a search that finds nothing offers to clear it — not to create', () => {
    const s = emptyGalleryState(input({ query: '  Persian ', selection: sel({ animal: 'cat' }) }));
    expect(s.title).toBe('Nothing matches “Persian”');
    expect(s.clearSearch).toBe(true);
    expect(s.showAll).toBe(true);
    expect(s.create).toBeNull();
    expect(emptyGalleryState(input({ query: 'x' })).showAll).toBe(false);
  });
});
