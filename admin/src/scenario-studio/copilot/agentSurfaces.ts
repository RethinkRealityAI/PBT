/**
 * Trusted A2UI card builders for the Scenario Studio assistant.
 *
 * The model never writes UI. It proposes typed actions
 * (`src/shared/ai/scenarioAgent.ts`); the server normalises them, the panel
 * normalises them AGAIN, and only then does a builder here turn one into an
 * A2UI v0.9.1 surface rendered by our own catalog (./A2uiSurface.tsx).
 *
 * Data-model contract (every card):
 *   { proposal: { tool, ...args }, ...display-only extras }
 * `/proposal` IS the action — the confirm handler re-normalises it verbatim
 * with `normalizeAgentActions([proposal], ctx)`. Every editable widget is
 * two-way bound under `/proposal/…`, so what the admin edits is exactly what
 * gets re-validated and applied. Nothing here applies anything.
 *
 * Pure: no React, no fetches. Unit-tested in ./__tests__/agentSurfaces.test.ts.
 */
import {
  A2UI_VERSION,
  PBT_STUDIO_CATALOG_ID,
  type A2uiComponent,
  type A2uiMessage,
} from '../../lib/a2ui';
import { categoryLabel, resolveDocFocus } from '../../data/knowledgeActions';
import type { KnowledgeDocument } from '../../data/types';
import type { StudioDraft } from '../studioModel';
import {
  AGENT_FIELDS,
  AGENT_FIELD_LABELS,
  SCENARIO_DRIVERS,
  STUDIO_STEP_LABELS,
  formatFieldValue,
  type AgentField,
  type ScenarioAgentAction,
} from '../../../../src/shared/ai/scenarioAgent';
import {
  LIFE_STAGES,
  PERSONAS,
  PUSHBACK_IDS,
  PUSHBACK_LABELS,
} from '../../../../src/shared/scenarios/enums';
import { SCENARIO_LIMITS, SCENARIO_PROSE_CAPS } from '../../../../src/shared/scenarios/limits';
import {
  SCENARIO_SPECIES,
  SPECIES_LABELS,
  lifeStageLabel,
} from '../../../../src/shared/scenarios/species';
import { FOCUS_AREAS, focusAreaLabel } from '../../../../src/shared/knowledge/focusAreas';

export interface SurfaceBuildContext {
  /** The on-screen draft — the "Now: …" side of every change. */
  draft: StudioDraft;
  /** The knowledge library, for document titles on attach cards. */
  docs: readonly KnowledgeDocument[];
}

/** Event names the cards emit (the panel's `onAction` switch). */
export const CARD_EVENTS = {
  confirm: 'confirm_action',
  cancel: 'cancel_action',
  answer: 'answer',
  pick: 'pick_option',
  goToStep: 'go_to_step',
} as const;

// ── Field presentation ───────────────────────────────────────────────────

export type FieldChangeKind = 'text' | 'long' | 'choice';

export interface ChoiceOption {
  label: string;
  value: string | number;
}

const CHOICE_FIELDS: ReadonlySet<AgentField> = new Set<AgentField>([
  'species',
  'life_stage',
  'pushback_id',
  'suggested_driver',
  'persona_override',
  'difficulty_override',
]);

const LONG_FIELDS: ReadonlySet<AgentField> = new Set<AgentField>([
  'pushback_notes',
  'context_override',
  'opening_line_override',
  'card_subtitle_override',
  'info_modal_body',
]);

/** How a proposed field is edited on the card. */
export function fieldChangeKind(field: AgentField): FieldChangeKind {
  if (CHOICE_FIELDS.has(field)) return 'choice';
  if (LONG_FIELDS.has(field)) return 'long';
  return 'text';
}

/**
 * Character caps shown on the card's text boxes. Mirrors the caps the shared
 * normaliser clamps to (a parity test pins each one against
 * `normalizeFieldValue`), so the box stops where re-validation would cut.
 */
export const FIELD_MAX: Partial<Record<AgentField | 'prompt_prefix' | 'prompt_suffix', number>> = {
  breed: SCENARIO_LIMITS.breedMax,
  pushback_notes: SCENARIO_PROSE_CAPS.pushbackNotes,
  context_override: SCENARIO_PROSE_CAPS.context,
  opening_line_override: SCENARIO_PROSE_CAPS.openingLine,
  card_title_override: SCENARIO_LIMITS.cardTitleMax,
  card_subtitle_override: SCENARIO_LIMITS.cardSubtitleMax,
  start_button_label: SCENARIO_LIMITS.startButtonMax,
  info_modal_title: SCENARIO_PROSE_CAPS.infoTitle,
  info_modal_body: SCENARIO_LIMITS.infoBodyMax,
  prompt_prefix: SCENARIO_LIMITS.promptMax,
  prompt_suffix: SCENARIO_LIMITS.promptMax,
};

/** The legal values of a choice field, labelled the way a person reads them. */
export function fieldOptions(field: AgentField, species?: unknown): ChoiceOption[] {
  switch (field) {
    case 'species':
      return SCENARIO_SPECIES.map((s) => ({ label: SPECIES_LABELS[s], value: s }));
    case 'life_stage':
      return LIFE_STAGES.map((s) => ({ label: lifeStageLabel(s, species), value: s }));
    case 'pushback_id':
      return PUSHBACK_IDS.map((id) => ({ label: PUSHBACK_LABELS[id] ?? id, value: id }));
    case 'suggested_driver':
      return SCENARIO_DRIVERS.map((d) => ({ label: d, value: d }));
    case 'persona_override':
      return PERSONAS.map((p) => ({ label: p, value: p }));
    case 'difficulty_override':
      return [1, 2, 3, 4].map((n) => ({ label: formatFieldValue('difficulty_override', n), value: n }));
    default:
      return [];
  }
}

// ── Building blocks ──────────────────────────────────────────────────────

function surface(
  surfaceId: string,
  dataModel: Record<string, unknown>,
  components: A2uiComponent[],
): A2uiMessage[] {
  return [
    { version: A2UI_VERSION, createSurface: { surfaceId, catalogId: PBT_STUDIO_CATALOG_ID } },
    { version: A2UI_VERSION, updateDataModel: { surfaceId, path: '/', value: dataModel } },
    { version: A2UI_VERSION, updateComponents: { surfaceId, components } },
  ];
}

function text(id: string, value: string, variant = 'body'): A2uiComponent {
  return { id, component: 'Text', variant, text: value };
}

function button(
  id: string,
  label: string,
  variant: 'primary' | 'secondary' | 'borderless',
  event: { name: string; context: Record<string, unknown> },
): A2uiComponent[] {
  return [
    { id, component: 'Button', variant, child: `${id}Label`, action: { event } },
    text(`${id}Label`, label),
  ];
}

/**
 * "Not now" + "Apply". Apply resolves `/proposal` (plus any extra bindings)
 * at click time, so the handler sees the admin's edits, not the original.
 */
function applyRow(extraContext: Record<string, unknown> = {}): { ids: string[]; components: A2uiComponent[] } {
  return {
    ids: ['actions'],
    components: [
      { id: 'actions', component: 'Row', justify: 'end', children: ['dismissBtn', 'applyBtn'] },
      ...button('dismissBtn', 'Not now', 'borderless', { name: CARD_EVENTS.cancel, context: {} }),
      ...button('applyBtn', 'Apply', 'primary', {
        name: CARD_EVENTS.confirm,
        context: { proposal: { path: '/proposal' }, ...extraContext },
      }),
    ],
  };
}

function noteParts(note: string | undefined): { ids: string[]; components: A2uiComponent[] } {
  return note ? { ids: ['note'], components: [text('note', note, 'caption')] } : { ids: [], components: [] };
}

function clip(value: string, max: number): string {
  const flat = value.replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max - 1).trimEnd()}…` : flat;
}

function currentKnowledge(draft: StudioDraft): string {
  const n = draft.knowledge_slugs?.length ?? 0;
  if (n > 0) return `Now: ${n} attached document${n === 1 ? '' : 's'}`;
  if (draft.focus_area) return `Now: focused on ${focusAreaLabel(draft.focus_area)}`;
  return 'Now: the whole library';
}

function docMeta(doc: KnowledgeDocument | undefined): string {
  if (!doc) return 'Knowledge document';
  const focus = focusAreaLabel(resolveDocFocus(doc.metadata));
  return [categoryLabel(doc.category), focus].filter(Boolean).join(' · ');
}

// ── The builder ──────────────────────────────────────────────────────────

/**
 * One A2UI surface for one NORMALISED assistant action. Pass only what
 * `normalizeAgentActions` returned — the builders trust the vocabulary.
 */
export function buildActionSurface(
  action: ScenarioAgentAction,
  surfaceId: string,
  ctx: SurfaceBuildContext,
): A2uiMessage[] {
  const { draft } = ctx;
  switch (action.tool) {
    case 'update_fields': {
      const note = noteParts(action.note);
      const apply = applyRow();
      const species = action.fields.species ?? draft.species;
      const fields = AGENT_FIELDS.filter((f) => action.fields[f] !== undefined);
      const fieldParts: A2uiComponent[] = [];
      const fieldIds: string[] = [];
      for (const field of fields) {
        const kind = fieldChangeKind(field);
        const id = `f_${field}`;
        fieldIds.push(id);
        fieldParts.push({
          id,
          component: 'FieldChange',
          label: AGENT_FIELD_LABELS[field],
          before: formatFieldValue(field, draft[field], draft.species),
          value: { path: `/proposal/fields/${field}` },
          kind,
          ...(kind === 'choice' ? { options: fieldOptions(field, species) } : {}),
          ...(FIELD_MAX[field] ? { maxLength: FIELD_MAX[field] } : {}),
        });
        if (field === 'suggested_driver') {
          fieldIds.push('driverSwatch');
          fieldParts.push({
            id: 'driverSwatch',
            component: 'DriverSwatch',
            driver: { path: '/proposal/fields/suggested_driver' },
          });
        }
      }
      return surface(surfaceId, { proposal: { ...action } }, [
        { id: 'root', component: 'Card', child: 'body' },
        { id: 'body', component: 'Column', children: ['heading', ...note.ids, ...fieldIds, ...apply.ids] },
        text('heading', 'Suggested changes', 'h4'),
        ...note.components,
        ...fieldParts,
        ...apply.components,
      ]);
    }

    case 'set_ai_notes': {
      const note = noteParts(action.note);
      const apply = applyRow();
      const parts: A2uiComponent[] = [];
      const ids: string[] = [];
      const notes = [
        ['prompt_prefix', 'prefix', 'Opening notes for the AI'],
        ['prompt_suffix', 'suffix', 'Final reminders for the AI'],
      ] as const;
      for (const [key, short, label] of notes) {
        if (!(key in action)) continue;
        ids.push(`${short}Field`);
        parts.push({
          id: `${short}Field`,
          component: 'TextField',
          label,
          value: { path: `/proposal/${key}` },
          multiline: true,
          maxLength: FIELD_MAX[key],
          placeholder: 'Leave empty to remove these notes',
        });
        const now = draft[key];
        if (typeof now === 'string' && now.trim() && now !== action[key]) {
          ids.push(`${short}Now`);
          parts.push(text(`${short}Now`, `Replaces: “${clip(now, 120)}”`, 'caption'));
        }
      }
      return surface(surfaceId, { proposal: { ...action } }, [
        { id: 'root', component: 'Card', child: 'body' },
        { id: 'body', component: 'Column', children: ['heading', ...note.ids, ...ids, 'wrapHint', ...apply.ids] },
        text('heading', 'Notes for the AI customer', 'h4'),
        ...note.components,
        ...parts,
        text('wrapHint', 'These wrap the AI’s standard briefing — they never change scoring.', 'caption'),
        ...apply.components,
      ]);
    }

    case 'attach_knowledge': {
      const note = noteParts(action.note);
      if (action.mode === 'documents') {
        const slugs = action.slugs ?? [];
        const bySlug = new Map(ctx.docs.map((d) => [d.slug, d]));
        const apply = applyRow({ picked: { path: '/picked' }, slugsAll: { path: '/slugsAll' } });
        const existing = draft.knowledge_slugs?.length ?? 0;
        const docIds = slugs.map((_, i) => `doc_${i}`);
        return surface(
          surfaceId,
          { proposal: { ...action }, picked: slugs.map(() => true), slugsAll: [...slugs] },
          [
            { id: 'root', component: 'Card', child: 'body' },
            {
              id: 'body',
              component: 'Column',
              children: ['heading', ...note.ids, 'docs', 'docsHint', ...apply.ids],
            },
            text('heading', 'Ground the AI in these documents', 'h4'),
            ...note.components,
            { id: 'docs', component: 'List', children: docIds },
            ...slugs.map((slug, i): A2uiComponent => {
              const doc = bySlug.get(slug);
              return {
                id: `doc_${i}`,
                component: 'DocOption',
                title: doc?.title ?? slug,
                meta: docMeta(doc),
                value: { path: `/picked/${i}` },
              };
            }),
            text(
              'docsHint',
              existing > 0
                ? `Untick any you don’t want. Adds to the ${existing} document${existing === 1 ? '' : 's'} already attached.`
                : 'Untick any you don’t want. The AI customer will only read what’s attached.',
              'caption',
            ),
            ...apply.components,
          ],
        );
      }
      const apply = applyRow();
      const focus = action.mode === 'focus' ? FOCUS_AREAS.find((f) => f.key === action.focus_area) : undefined;
      const heading =
        action.mode === 'focus'
          ? `Focus the AI on ${focusAreaLabel(action.focus_area) ?? 'one topic'}`
          : 'Let the AI search the whole library';
      const hint =
        action.mode === 'focus'
          ? (focus?.description ?? 'It prefers documents about this topic.')
          : 'It picks the most relevant passages from every document it may read.';
      return surface(surfaceId, { proposal: { ...action } }, [
        { id: 'root', component: 'Card', child: 'body' },
        { id: 'body', component: 'Column', children: ['heading', ...note.ids, 'hint', 'now', ...apply.ids] },
        text('heading', heading, 'h4'),
        ...note.components,
        text('hint', hint, 'body'),
        text('now', currentKnowledge(draft), 'caption'),
        ...apply.components,
      ]);
    }

    case 'ask': {
      const optIds = action.options.map((_, i) => `opt_${i}`);
      return surface(surfaceId, { proposal: { ...action } }, [
        { id: 'root', component: 'Card', child: 'body' },
        { id: 'body', component: 'Column', children: ['question', 'options', 'typeHint'] },
        text('question', action.question, 'h4'),
        { id: 'options', component: 'Row', children: optIds },
        ...action.options.flatMap((o, i) =>
          button(`opt_${i}`, o.label, 'secondary', {
            name: CARD_EVENTS.answer,
            context: {
              value: o.value,
              label: o.label,
              ...(action.field ? { field: action.field } : {}),
            },
          }),
        ),
        text('typeHint', 'Or type your own answer below.', 'caption'),
      ]);
    }

    case 'offer_options': {
      const note = noteParts(action.note);
      const optIds = action.options.map((_, i) => `opt_${i}`);
      return surface(surfaceId, { proposal: { ...action } }, [
        { id: 'root', component: 'Card', child: 'body' },
        {
          id: 'body',
          component: 'Column',
          children: ['heading', ...note.ids, 'pickHint', 'options', 'actions'],
        },
        text('heading', `${AGENT_FIELD_LABELS[action.field]} ideas`, 'h4'),
        ...note.components,
        text('pickHint', 'Pick one — you can edit it after.', 'caption'),
        { id: 'options', component: 'Column', children: optIds },
        ...action.options.flatMap((value, i) =>
          button(`opt_${i}`, value, 'secondary', {
            name: CARD_EVENTS.pick,
            context: { field: action.field, value },
          }),
        ),
        { id: 'actions', component: 'Row', justify: 'end', children: ['dismissBtn'] },
        ...button('dismissBtn', 'None of these', 'borderless', { name: CARD_EVENTS.cancel, context: {} }),
      ]);
    }

    case 'go_to_step': {
      const note = noteParts(action.note);
      return surface(surfaceId, { proposal: { ...action } }, [
        { id: 'root', component: 'Column', children: [...note.ids, 'goRow'] },
        ...note.components,
        { id: 'goRow', component: 'Row', children: ['goBtn'] },
        ...button('goBtn', `Open ${STUDIO_STEP_LABELS[action.step]} →`, 'primary', {
          name: CARD_EVENTS.goToStep,
          context: { step: action.step },
        }),
      ]);
    }
  }
}
