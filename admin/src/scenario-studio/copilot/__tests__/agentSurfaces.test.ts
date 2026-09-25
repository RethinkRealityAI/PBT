/**
 * Trusted card builders — the A2UI half of the assistant's security model.
 *
 * Pins three things for every tool:
 *   1. the card is a valid surface (root exists, every child id resolves,
 *      only catalog components are used);
 *   2. PROPOSAL ROUND-TRIP — the card's `/proposal` re-normalises to exactly
 *      the action it was built from, so an untouched Apply applies what the
 *      assistant proposed;
 *   3. edits the admin makes on the card are what the confirm resolves, and
 *      illegal edits are rejected by the same gate the server uses.
 */
import { describe, it, expect } from 'vitest';
import {
  applySurfaceMessages,
  getPath,
  resolveContext,
  setPath,
  PBT_STUDIO_CATALOG_ID,
  type A2uiMessage,
  type SurfaceState,
} from '../../../lib/a2ui';
import {
  AGENT_FIELDS,
  normalizeAgentActions,
  normalizeFieldValue,
  type ScenarioAgentAction,
} from '../../../../../src/shared/ai/scenarioAgent';
import type { KnowledgeDocument } from '../../../data/types';
import { emptyAdminDraft, type StudioDraft } from '../../studioModel';
import {
  CARD_EVENTS,
  FIELD_MAX,
  buildActionSurface,
  fieldChangeKind,
  fieldOptions,
} from '../agentSurfaces';

const CATALOG = new Set([
  'Card',
  'Column',
  'List',
  'Row',
  'Text',
  'Divider',
  'Button',
  'TextField',
  'ChoicePicker',
  'CheckBox',
  'FieldChange',
  'DocOption',
  'DriverSwatch',
]);

function doc(slug: string, title: string, over: Partial<KnowledgeDocument> = {}): KnowledgeDocument {
  return {
    id: slug,
    slug,
    title,
    category: 'clinical',
    source: 'upload',
    metadata: { tags: { tools: ['roleplay', 'scoring'], focus: 'weight' } },
    content: '',
    updated_at: '2026-09-01T00:00:00Z',
    created_at: '2026-09-01T00:00:00Z',
    chunk_count: 8,
    ...over,
  };
}

const DOCS = [
  doc('study:weight', 'Weight-loss outcomes in dogs'),
  doc('custom:cat-obesity', 'Feline obesity notes', { category: 'custom', metadata: { tags: { tools: ['roleplay'] } } }),
];
const NORM = { knownSlugs: new Set(DOCS.map((d) => d.slug)) };

const DRAFT: StudioDraft = {
  ...emptyAdminDraft('admin:t1', 'dog'),
  breed: 'Labrador Retriever',
  life_stage: 'Adult (3-7)',
  difficulty_override: 2,
  prompt_prefix: 'Keep it friendly at first.',
  knowledge_slugs: ['study:existing'],
};
const CTX = { draft: DRAFT, docs: DOCS };

/** Normalise a raw model action — the builders only ever see these. */
function norm(raw: Record<string, unknown>): ScenarioAgentAction {
  const [action] = normalizeAgentActions([raw], NORM);
  if (!action) throw new Error(`fixture did not normalise: ${JSON.stringify(raw)}`);
  return action;
}

const ACTIONS: Record<string, ScenarioAgentAction> = {
  update_fields: norm({
    tool: 'update_fields',
    fields: {
      species: 'cat',
      breed: 'Maine Coon',
      life_stage: 'Puppy (<1)',
      difficulty_override: 3,
      suggested_driver: 'Analyzer',
      pushback_notes: 'He is just big-boned, that is all.',
    },
    note: 'A cat fits this pushback better.',
  }),
  set_ai_notes: norm({ tool: 'set_ai_notes', prompt_prefix: 'Stay firm on price.', prompt_suffix: null }),
  attach_documents: norm({ tool: 'attach_knowledge', mode: 'documents', slugs: ['study:weight', 'custom:cat-obesity'] }),
  attach_focus: norm({ tool: 'attach_knowledge', mode: 'focus', focus_area: 'weight' }),
  attach_library: norm({ tool: 'attach_knowledge', mode: 'library', note: 'Broad is fine here.' }),
  ask_field: norm({
    tool: 'ask',
    question: 'Is the patient a dog or a cat?',
    field: 'species',
    options: [
      { label: 'Dog', value: 'dog' },
      { label: 'Cat', value: 'cat' },
    ],
  }),
  ask_free: norm({ tool: 'ask', question: 'How tough should the owner be?', options: ['Gentle', 'Really tough'] }),
  offer_options: norm({
    tool: 'offer_options',
    field: 'opening_line_override',
    options: ['I read online grain-free is better.', 'Why would I pay more for this?', 'He eats fine.'],
  }),
  go_to_step: norm({ tool: 'go_to_step', step: 'knowledge', note: 'Next, pick what the AI reads.' }),
};

function build(action: ScenarioAgentAction, id = 'c1'): SurfaceState {
  return applySurfaceMessages({}, buildActionSurface(action, id, CTX))[id];
}

/** Every child/children id a component references must exist in the surface. */
function assertReducerValid(s: SurfaceState) {
  expect(s, 'surface').toBeDefined();
  expect(s.components.root, 'root').toBeDefined();
  expect(s.catalogId).toBe(PBT_STUDIO_CATALOG_ID);
  for (const c of Object.values(s.components)) {
    expect(CATALOG.has(c.component), `${c.id} uses ${c.component}`).toBe(true);
    if (typeof c.child === 'string') expect(s.components[c.child], `${c.id}.child`).toBeDefined();
    if (Array.isArray(c.children)) {
      for (const id of c.children) expect(s.components[id as string], `${c.id}.children → ${String(id)}`).toBeDefined();
    }
  }
}

type EventSpec = { name: string; context: Record<string, unknown> };
function eventOf(s: SurfaceState, id: string): EventSpec {
  return (s.components[id].action as { event: EventSpec }).event;
}

function textOf(s: SurfaceState, id: string): string {
  return String(s.components[id].text);
}

describe('buildActionSurface — every tool', () => {
  it.each(Object.entries(ACTIONS))('%s builds a reducer-valid surface from one message batch', (_name, action) => {
    const messages: A2uiMessage[] = buildActionSurface(action, 'c1', CTX);
    expect(messages[0].createSurface).toEqual({ surfaceId: 'c1', catalogId: PBT_STUDIO_CATALOG_ID });
    expect(messages.every((m) => m.version === 'v0.9.1')).toBe(true);
    assertReducerValid(build(action));
  });

  it.each(Object.entries(ACTIONS))('%s: the card’s /proposal round-trips through the normaliser unchanged', (_name, action) => {
    const s = build(action);
    const proposal = getPath(s.dataModel, '/proposal');
    expect(proposal).toEqual(action);
    const [again] = normalizeAgentActions([proposal], NORM);
    expect(again).toEqual(action);
  });

  it('keeps surfaces independent — the id is only the one it was given', () => {
    const surfaces = applySurfaceMessages(
      applySurfaceMessages({}, buildActionSurface(ACTIONS.update_fields, 'a', CTX)),
      buildActionSurface(ACTIONS.go_to_step, 'b', CTX),
    );
    expect(Object.keys(surfaces).sort()).toEqual(['a', 'b']);
  });
});

describe('update_fields card', () => {
  const s = build(ACTIONS.update_fields);

  it('shows one FieldChange per proposed field, in the vocabulary’s order', () => {
    const body = s.components.body.children as string[];
    expect(textOf(s, 'heading')).toBe('Suggested changes');
    expect(textOf(s, 'note')).toBe('A cat fits this pushback better.');
    const fieldIds = body.filter((id) => id.startsWith('f_'));
    expect(fieldIds).toEqual([
      'f_species',
      'f_breed',
      'f_life_stage',
      'f_pushback_notes',
      'f_suggested_driver',
      'f_difficulty_override',
    ]);
    for (const id of fieldIds) {
      const field = id.slice(2);
      expect(s.components[id].component).toBe('FieldChange');
      expect(s.components[id].value).toEqual({ path: `/proposal/fields/${field}` });
    }
  });

  it('“before” is the draft’s current value, formatted for a person', () => {
    expect(s.components.f_breed.before).toBe('Labrador Retriever');
    expect(s.components.f_species.before).toBe('Dog');
    expect(s.components.f_difficulty_override.before).toBe('2 · Skeptical');
    expect(s.components.f_pushback_notes.before).toBe('—'); // unset
  });

  it('enum fields are choices with legal values; prose is long; short text is text', () => {
    expect(s.components.f_species.kind).toBe('choice');
    expect(s.components.f_difficulty_override.kind).toBe('choice');
    expect(s.components.f_difficulty_override.options).toContainEqual({ label: '3 · Hostile', value: 3 });
    expect(s.components.f_breed.kind).toBe('text');
    expect(s.components.f_breed.maxLength).toBe(80);
    expect(s.components.f_pushback_notes.kind).toBe('long');
    // Life stage labels follow the PROPOSED species (a cat → Kitten).
    expect(s.components.f_life_stage.options).toContainEqual({ label: 'Kitten (<1)', value: 'Puppy (<1)' });
  });

  it('previews the proposed driver with a swatch bound to the same field', () => {
    expect(s.components.driverSwatch.component).toBe('DriverSwatch');
    expect(s.components.driverSwatch.driver).toEqual({ path: '/proposal/fields/suggested_driver' });
    const body = s.components.body.children as string[];
    expect(body.indexOf('driverSwatch')).toBe(body.indexOf('f_suggested_driver') + 1);
  });

  it('Apply resolves the EDITED proposal at click time; Not now cancels', () => {
    const apply = eventOf(s, 'applyBtn');
    expect(apply.name).toBe(CARD_EVENTS.confirm);
    expect(textOf(s, 'applyBtnLabel')).toBe('Apply');
    expect(eventOf(s, 'dismissBtn').name).toBe(CARD_EVENTS.cancel);
    expect(textOf(s, 'dismissBtnLabel')).toBe('Not now');

    const edited = setPath(s.dataModel, '/proposal/fields/breed', 'Norwegian Forest Cat');
    const ctx = resolveContext(apply.context, edited);
    const [action] = normalizeAgentActions([ctx.proposal], NORM);
    expect(action).toMatchObject({ tool: 'update_fields', fields: { breed: 'Norwegian Forest Cat', species: 'cat' } });
  });

  it('illegal edits are rejected on re-normalisation', () => {
    let model = setPath(s.dataModel, '/proposal/fields/difficulty_override', 9);
    model = setPath(model, '/proposal/fields/species', 'hamster');
    model = setPath(model, '/proposal/fields/breed', '   ');
    const [action] = normalizeAgentActions([getPath(model, '/proposal')], NORM);
    expect(action?.tool).toBe('update_fields');
    const fields = (action as Extract<ScenarioAgentAction, { tool: 'update_fields' }>).fields;
    expect(fields.difficulty_override).toBeUndefined();
    expect(fields.species).toBeUndefined();
    expect(fields.breed).toBeUndefined();
    expect(fields.suggested_driver).toBe('Analyzer'); // the untouched ones survive

    // A card whose ONLY field is made illegal proposes nothing at all.
    const lone = build(norm({ tool: 'update_fields', fields: { difficulty_override: 2 } }), 'lone');
    const bad = setPath(lone.dataModel, '/proposal/fields/difficulty_override', 'extreme');
    expect(normalizeAgentActions([getPath(bad, '/proposal')], NORM)).toEqual([]);
  });

  it('a tampered tool name cannot smuggle an unknown action through', () => {
    const tampered = setPath(s.dataModel, '/proposal/tool', 'delete_everything');
    expect(normalizeAgentActions([getPath(tampered, '/proposal')], NORM)).toEqual([]);
  });
});

describe('set_ai_notes card', () => {
  const s = build(ACTIONS.set_ai_notes);

  it('shows an editable, multiline field per note the proposal touches', () => {
    expect(s.components.prefixField).toMatchObject({
      component: 'TextField',
      label: 'Opening notes for the AI',
      value: { path: '/proposal/prompt_prefix' },
      multiline: true,
      maxLength: 1500,
    });
    // prompt_suffix: null is an explicit "clear" — still shown, empty.
    expect(s.components.suffixField).toMatchObject({
      label: 'Final reminders for the AI',
      value: { path: '/proposal/prompt_suffix' },
    });
    expect(textOf(s, 'wrapHint')).toBe('These wrap the AI’s standard briefing — they never change scoring.');
    expect(textOf(s, 'prefixNow')).toContain('Keep it friendly at first.');
  });

  it('only the notes present in the proposal get a field', () => {
    const only = build(norm({ tool: 'set_ai_notes', prompt_suffix: 'Never agree on the first turn.' }), 'n2');
    expect(only.components.prefixField).toBeUndefined();
    expect(only.components.suffixField).toBeDefined();
    assertReducerValid(only);
  });

  it('an edited note is what the confirm applies; an over-long one is clamped', () => {
    const edited = setPath(s.dataModel, '/proposal/prompt_prefix', 'Mention the price twice.');
    const [a] = normalizeAgentActions([getPath(edited, '/proposal')], NORM);
    expect(a).toMatchObject({ tool: 'set_ai_notes', prompt_prefix: 'Mention the price twice.', prompt_suffix: null });

    const long = setPath(s.dataModel, '/proposal/prompt_prefix', 'x'.repeat(5000));
    const [b] = normalizeAgentActions([getPath(long, '/proposal')], NORM);
    expect((b as { prompt_prefix: string }).prompt_prefix).toHaveLength(1500);
  });
});

describe('attach_knowledge cards', () => {
  it('documents: one ticked DocOption per suggested document, titled from the library', () => {
    const s = build(ACTIONS.attach_documents);
    expect(s.components.doc_0).toMatchObject({
      component: 'DocOption',
      title: 'Weight-loss outcomes in dogs',
      value: { path: '/picked/0' },
    });
    expect(String(s.components.doc_0.meta)).toContain('Clinical reference');
    expect(String(s.components.doc_0.meta)).toContain('Weight management');
    expect(s.components.doc_1.title).toBe('Feline obesity notes');
    expect(s.dataModel.picked).toEqual([true, true]);
    expect(s.dataModel.slugsAll).toEqual(['study:weight', 'custom:cat-obesity']);
    // The draft already has one document attached — the card says it adds.
    expect(textOf(s, 'docsHint')).toContain('Adds to the 1 document already attached');
  });

  it('documents: Apply resolves the ticked rows alongside the proposal', () => {
    const s = build(ACTIONS.attach_documents);
    const apply = eventOf(s, 'applyBtn');
    const unticked = setPath(s.dataModel, '/picked/0', false);
    const ctx = resolveContext(apply.context, unticked);
    expect(ctx.picked).toEqual([false, true]);
    expect(ctx.slugsAll).toEqual(['study:weight', 'custom:cat-obesity']);
    expect(ctx.proposal).toEqual(ACTIONS.attach_documents);
  });

  it('documents: a made-up slug edited into the card is dropped by the gate', () => {
    const s = build(ACTIONS.attach_documents);
    const tampered = setPath(s.dataModel, '/proposal/slugs', ['study:weight', 'secret:scoring-only']);
    const [a] = normalizeAgentActions([getPath(tampered, '/proposal')], NORM);
    expect(a).toEqual({ tool: 'attach_knowledge', mode: 'documents', slugs: ['study:weight'] });
    const allFake = setPath(s.dataModel, '/proposal/slugs', ['nope']);
    expect(normalizeAgentActions([getPath(allFake, '/proposal')], NORM)).toEqual([]);
  });

  it('documents: a slug the library list doesn’t hold falls back to the slug as title', () => {
    const s = applySurfaceMessages(
      {},
      buildActionSurface(ACTIONS.attach_documents, 'x', { draft: DRAFT, docs: [] }),
    ).x;
    expect(s.components.doc_0.title).toBe('study:weight');
  });

  it('focus and library modes say what will happen and what is there now', () => {
    const focus = build(ACTIONS.attach_focus, 'f');
    expect(textOf(focus, 'heading')).toBe('Focus the AI on Weight management');
    expect(textOf(focus, 'now')).toBe('Now: 1 attached document');
    const library = build(ACTIONS.attach_library, 'l');
    expect(textOf(library, 'heading')).toBe('Let the AI search the whole library');
    expect(textOf(library, 'note')).toBe('Broad is fine here.');

    const tampered = setPath(focus.dataModel, '/proposal/focus_area', 'astrology');
    expect(normalizeAgentActions([getPath(tampered, '/proposal')], NORM)).toEqual([]);
  });
});

describe('ask card', () => {
  it('asks the question with one answer button per option', () => {
    const s = build(ACTIONS.ask_field);
    expect(s.components.question).toMatchObject({ component: 'Text', variant: 'h4', text: 'Is the patient a dog or a cat?' });
    expect(eventOf(s, 'opt_1')).toEqual({ name: CARD_EVENTS.answer, context: { value: 'cat', label: 'Cat', field: 'species' } });
    expect(s.components.opt_0.variant).toBe('secondary');
    expect(textOf(s, 'typeHint')).toBe('Or type your own answer below.');
  });

  it('a free-form question carries no field', () => {
    const s = build(ACTIONS.ask_free);
    expect(eventOf(s, 'opt_0').context).toEqual({ value: 'Gentle', label: 'Gentle' });
  });

  it('tampered option values are re-validated against the field', () => {
    const s = build(ACTIONS.ask_field);
    const tampered = setPath(s.dataModel, '/proposal/options/1/value', 'hamster');
    // One legal option left → below the minimum → no question at all.
    expect(normalizeAgentActions([getPath(tampered, '/proposal')], NORM)).toEqual([]);
  });
});

describe('offer_options card', () => {
  it('shows each option in full as a button that picks it', () => {
    const s = build(ACTIONS.offer_options);
    expect(textOf(s, 'heading')).toBe('Opening line ideas');
    expect(textOf(s, 'pickHint')).toBe('Pick one — you can edit it after.');
    expect(textOf(s, 'opt_1Label')).toBe('Why would I pay more for this?');
    expect(eventOf(s, 'opt_1')).toEqual({
      name: CARD_EVENTS.pick,
      context: { field: 'opening_line_override', value: 'Why would I pay more for this?' },
    });
    expect(eventOf(s, 'dismissBtn').name).toBe(CARD_EVENTS.cancel);
  });

  it('a field outside the offer vocabulary is rejected', () => {
    const s = build(ACTIONS.offer_options);
    const tampered = setPath(s.dataModel, '/proposal/field', 'visible');
    expect(normalizeAgentActions([getPath(tampered, '/proposal')], NORM)).toEqual([]);
  });
});

describe('go_to_step card', () => {
  it('is a single primary button to the step', () => {
    const s = build(ACTIONS.go_to_step);
    expect(s.components.root.component).toBe('Column');
    expect(s.components.goBtn.variant).toBe('primary');
    expect(textOf(s, 'goBtnLabel')).toBe('Open Knowledge →');
    expect(eventOf(s, 'goBtn')).toEqual({ name: CARD_EVENTS.goToStep, context: { step: 'knowledge' } });
    expect(textOf(s, 'note')).toBe('Next, pick what the AI reads.');

    const tampered = setPath(s.dataModel, '/proposal/step', 'admin-panel');
    expect(normalizeAgentActions([getPath(tampered, '/proposal')], NORM)).toEqual([]);
  });
});

describe('field presentation vocabulary', () => {
  it('every proposable field has a kind; every choice option is a legal value', () => {
    for (const field of AGENT_FIELDS) {
      const kind = fieldChangeKind(field);
      expect(['text', 'long', 'choice']).toContain(kind);
      if (kind !== 'choice') continue;
      const options = fieldOptions(field, 'dog');
      expect(options.length, field).toBeGreaterThan(1);
      for (const o of options) expect(normalizeFieldValue(field, o.value), `${field}=${o.value}`).toBe(o.value);
    }
  });

  it('FIELD_MAX matches the cap the shared normaliser clamps to', () => {
    for (const [field, max] of Object.entries(FIELD_MAX)) {
      const clamped = normalizeFieldValue(field as never, 'x'.repeat((max ?? 0) + 25));
      expect(typeof clamped === 'string' ? clamped.length : -1, field).toBe(max);
    }
  });
});
