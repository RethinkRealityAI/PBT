/**
 * Scenario Builder — list + full-page editor with two tabs (Visual / AI
 * wizard) + live card preview + iframe test panel.
 *
 * All persistence flows through `admin-scenario-overrides` (admin-gated,
 * audited). Test mode posts the in-flight draft to the consumer iframe via
 * `pbt:preview-run-scenario` so the admin can chat or use voice with the
 * unsaved scenario before saving.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { ContextBar, ScreenShell } from '../primitives/Shell';
import { Glass } from '../primitives/Glass';
import {
  Collapsible,
  EmptyState,
  Eyebrow,
  InfoTip,
  LoadingShimmer,
  SectionTitle,
  StatusPill,
} from '../primitives';
import { FirstRunCard } from '../primitives/FirstRunCard';
import { InlineAlert } from '../primitives/form';
import { ReadOnlyBanner, useCan } from '../primitives/access';
import { DangerZone, useConfirm } from '../primitives/Confirm';
import { useToast } from '../primitives/Toast';
import { COLOR, DRIVER_KEYS, DRIVERS, type DriverKey } from '../lib/tokens';
import {
  deleteScenarioOverride,
  duplicateScenario,
  upsertScenarioOverride,
  useKnowledgeDocuments,
  useScenarioOverrides,
  useUserScenarios,
} from '../data/queries';
import type { ScenarioOverrideRow, UserScenario } from '../data/types';
import { resolveDocFocus } from '../data/knowledgeActions';
import {
  LIBRARY_MANIFEST,
  buildInitialDraft,
  diffAgainstBase,
  stripServerManaged,
} from '../data/scenarioManifest';
import { FOCUS_AREAS } from '../../../src/shared/knowledge/focusAreas';
import {
  LIFE_STAGES,
  PERSONAS,
  PUSHBACK_IDS,
  isLifeStage,
  isPersona,
  isPushbackId,
} from '../../../src/shared/scenarios/enums';
import {
  Field,
  btnPrimary,
  btnSecondary,
  inputStyle,
  textareaStyle,
} from './FlagsScreen';
import { suggestField, type WizardField } from '../lib/scenarioAi';

const PROMPT_MAX = 1500;

// ─────────────────────────────────────────────────────────────
// Stepped visual editor — model + pure state helpers
//
// The visual editor used to render six stacked sections; the page ran long
// enough that the live card preview scrolled out of sight. The same sections
// are now grouped into four steps. No field moved out of the draft — only
// where it is rendered changed.
// ─────────────────────────────────────────────────────────────

export type BuilderStepKey = 'scenario' | 'knowledge' | 'ai' | 'card';

export interface BuilderStepDef {
  key: BuilderStepKey;
  label: string;
  /** One-line description shown under the stepper. */
  hint: string;
  /**
   * Draft columns edited on this step. Together the four steps cover every
   * editable column of `ScenarioOverrideRow` (guarded by a unit test), so no
   * field's override state is invisible in the stepper badges.
   */
  fields: Array<keyof ScenarioOverrideRow>;
}

export const BUILDER_STEPS: BuilderStepDef[] = [
  {
    key: 'scenario',
    label: 'Scenario',
    hint: 'Who the customer is, what they push back on, and how the conversation opens.',
    fields: [
      'breed',
      'life_stage',
      'pushback_id',
      'suggested_driver',
      'persona_override',
      'difficulty_override',
      'weight_kg',
      'pushback_notes',
      'opening_line_override',
      'context_override',
      // Not surfaced by a control today, but it is a scenario-level title and
      // it does get saved — count it here so a legacy value still shows up.
      'title_override',
    ],
  },
  {
    key: 'knowledge',
    label: 'Knowledge & focus',
    hint: 'Which supporting research the AI may draw on for this scenario.',
    fields: ['focus_area', 'knowledge_slugs'],
  },
  {
    key: 'ai',
    label: 'AI instructions',
    hint: 'Optional notes wrapped around the AI customer’s canonical briefing.',
    fields: ['prompt_prefix', 'prompt_suffix'],
  },
  {
    key: 'card',
    label: 'Card & visibility',
    hint: 'How the scenario appears on the Home screen — and whether it appears at all.',
    fields: [
      'visible',
      'sort_order',
      'card_driver_override',
      'card_title_override',
      'card_subtitle_override',
      'start_button_label',
      'info_modal_title',
      'info_modal_body',
    ],
  },
];

/** Fields an admin-authored scenario cannot ship without. */
export const REQUIRED_ADMIN_FIELDS: Array<{
  key: keyof ScenarioOverrideRow;
  label: string;
}> = [
  { key: 'breed', label: 'Breed' },
  { key: 'life_stage', label: 'Life stage' },
  { key: 'pushback_id', label: 'Pushback' },
  { key: 'suggested_driver', label: 'Suggested driver' },
];

/** Would this value be written as an override (vs. "inherit the base")? */
export function hasOverrideValue(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim() !== '';
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'number') return !Number.isNaN(value);
  if (typeof value === 'boolean') return value;
  return true;
}

export interface BuilderStepState {
  /** How many of this step's fields will be saved as overrides. */
  overrides: number;
  /** Labels of required admin fields still empty (Scenario step only). */
  missing: string[];
}

/**
 * Per-step badge state.
 *
 * `sparse` is the output of the Builder's `sparsify` — i.e. exactly what a
 * save would write, with fields still equal to the base scenario nulled out.
 * That makes "has a dot" mean "this step carries overrides", which is the
 * question an admin is actually asking. `visible` is special: it always rides
 * along on the saved row, so it only counts when it differs from how the
 * scenario ships (`baseVisible`).
 */
export function computeStepStates({
  sparse,
  draft,
  baseVisible,
  requireCoreFields,
}: {
  sparse: Partial<ScenarioOverrideRow>;
  draft: Partial<ScenarioOverrideRow>;
  baseVisible: boolean;
  requireCoreFields: boolean;
}): Record<BuilderStepKey, BuilderStepState> {
  const out = {} as Record<BuilderStepKey, BuilderStepState>;
  for (const step of BUILDER_STEPS) {
    let overrides = 0;
    for (const field of step.fields) {
      if (field === 'visible') {
        if ((draft.visible ?? baseVisible) !== baseVisible) overrides += 1;
        continue;
      }
      if (hasOverrideValue(sparse[field])) overrides += 1;
    }
    out[step.key] = {
      overrides,
      missing:
        requireCoreFields && step.key === 'scenario'
          ? REQUIRED_ADMIN_FIELDS.filter((r) => !hasOverrideValue(draft[r.key])).map(
              (r) => r.label,
            )
          : [],
    };
  }
  return out;
}

/**
 * Human names for the draft columns, used wherever a list of fields is shown
 * to a person — the revert confirmation above all. "opening_line_override"
 * in a destructive dialog is a column name, not a consequence.
 */
export const FIELD_LABELS: Partial<Record<keyof ScenarioOverrideRow, string>> = {
  breed: 'Breed',
  life_stage: 'Life stage',
  pushback_id: 'Pushback',
  pushback_notes: 'Pushback notes',
  suggested_driver: 'Suggested driver',
  persona_override: 'Persona',
  difficulty_override: 'Difficulty',
  weight_kg: 'Weight (kg)',
  opening_line_override: 'Opening line',
  context_override: 'Context',
  title_override: 'Legacy title',
  focus_area: 'Focus area',
  knowledge_slugs: 'Attached documents',
  prompt_prefix: 'AI opening notes',
  prompt_suffix: 'AI final reminders',
  visible: 'Visible in app',
  sort_order: 'Sort order',
  card_driver_override: 'Card accent driver',
  card_title_override: 'Card title',
  card_subtitle_override: 'Card subtitle',
  start_button_label: 'Start button label',
  info_modal_title: 'Info modal title',
  info_modal_body: 'Info modal body',
};

/**
 * Which fields a revert would actually give back to the built-in scenario.
 *
 * Takes the SPARSE row (what a save would write), so it names exactly the
 * columns that carry an override today — no more, no less.
 */
export function overriddenFieldLabels(
  sparse: Partial<ScenarioOverrideRow>,
  opts: { baseVisible?: boolean } = {},
): string[] {
  const out: string[] = [];
  for (const step of BUILDER_STEPS) {
    for (const field of step.fields) {
      if (field === 'visible') {
        const baseVisible = opts.baseVisible ?? true;
        if (sparse.visible !== undefined && sparse.visible !== baseVisible) {
          out.push(
            sparse.visible
              ? 'Visible in app (currently forced on)'
              : 'Visible in app (currently hidden)',
          );
        }
        continue;
      }
      if (hasOverrideValue(sparse[field])) {
        out.push(FIELD_LABELS[field] ?? String(field));
      }
    }
  }
  return out;
}

/**
 * Attached slugs with no live document behind them.
 *
 * A document can be deleted after a scenario attached it (the server prunes
 * saved rows, but an in-flight draft or a stale snapshot can still hold one).
 * Retrieval silently skips those, so they have to be visible in the editor.
 */
export function missingKnowledgeSlugs(
  selected: string[] | null | undefined,
  liveSlugs: readonly string[],
): string[] {
  if (!selected || selected.length === 0) return [];
  const live = new Set(liveSlugs);
  return selected.filter((slug) => !live.has(slug));
}

/**
 * A client-side copy of a scenario, as an unsaved admin draft.
 *
 * Duplicating a library/user scenario server-side would copy its (possibly
 * empty) override ROW, not the scenario — the copy would come out blank. The
 * hydrated draft is the scenario, so the copy is made from that.
 */
export function buildDuplicateDraft(
  draft: Partial<ScenarioOverrideRow>,
  newId: string,
  baseTitle?: string | null,
): Partial<ScenarioOverrideRow> {
  const title =
    (draft.card_title_override ?? '').trim() || (baseTitle ?? '').trim() || 'scenario';
  return {
    ...draft,
    scenario_id: newId,
    card_title_override: `(copy) ${title}`.slice(0, 120),
    // A copy is never live until someone looks at it and says so.
    visible: false,
    sort_order: null,
  };
}

export interface VisibilityEntry {
  id: string;
  source: 'library' | 'admin' | 'user';
  override: Pick<ScenarioOverrideRow, 'visible'> | null;
}

/**
 * How many library + admin scenarios the consumer app would show.
 *
 * User-built scenarios are excluded on purpose: they belong to one account and
 * are not what the Home screen offers everyone. A library scenario with no
 * override row is live (that is how it ships); an admin one only exists as its
 * row.
 */
export function visibleScenarioCount(
  entries: readonly VisibilityEntry[],
  excludeId?: string,
): number {
  let n = 0;
  for (const e of entries) {
    if (e.id === excludeId) continue;
    if (e.source === 'user') continue;
    const visible = e.override ? e.override.visible : e.source === 'library';
    if (visible) n += 1;
  }
  return n;
}

/** Viewport-width watcher — mirrors the sidebar's resize listener pattern. */
function useViewportBelow(px: number): boolean {
  const [below, setBelow] = useState(
    () => typeof window !== 'undefined' && window.innerWidth < px,
  );
  useEffect(() => {
    const onResize = () => setBelow(window.innerWidth < px);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [px]);
  return below;
}

/** Below this the preview stacks under the editor instead of sticking beside it. */
const PREVIEW_STACK_BREAKPOINT = 1100;
/** Initial estimate of the sticky action bar's height; refined by measurement. */
const STICKY_TOP = 76;

interface ListEntry {
  id: string;
  source: 'library' | 'admin' | 'user';
  title: string;
  subtitle: string;
  override: ScenarioOverrideRow | null;
  /** Base row for `user:` scenarios — hydrates the editor when no override exists. */
  userScenario?: UserScenario | null;
}

function emptyDraftForNewAdmin(): Partial<ScenarioOverrideRow> {
  return {
    scenario_id: `admin:${crypto.randomUUID()}`,
    visible: false,
    sort_order: null,
    title_override: null,
    context_override: null,
    opening_line_override: null,
    difficulty_override: 2,
    persona_override: 'Skeptical',
    prompt_prefix: null,
    prompt_suffix: null,
    card_title_override: 'New scenario',
    card_subtitle_override: null,
    info_modal_title: null,
    info_modal_body: null,
    start_button_label: null,
    card_driver_override: null,
    breed: null,
    life_stage: null,
    pushback_id: null,
    pushback_notes: null,
    suggested_driver: null,
    weight_kg: null,
    focus_area: null,
    knowledge_slugs: null,
  };
}

export function ScenarioBuilderScreen({
  query,
  onQuery,
}: {
  query: string;
  onQuery: (q: string) => void;
}) {
  const [refreshKey, setRefreshKey] = useState(0);
  const overrides = useScenarioOverrides(refreshKey);
  const userScenarios = useUserScenarios(500);
  const toast = useToast();
  const canWrite = useCan()('scenarios.write');
  const [activeId, setActiveId] = useState<string | null>(null);
  /**
   * Either read failing means the list is a lie: the manifest still renders
   * three library scenarios while the override rows are unknown, so the editor
   * would open on "no overrides" and save that over real rows.
   */
  const readError = overrides.error ?? userScenarios.error;

  const list = useMemo<ListEntry[]>(() => {
    const out: ListEntry[] = [];
    const overrideById = new Map(
      overrides.data.map((o) => [o.scenario_id, o] as const),
    );
    // Library scenarios
    for (const s of LIBRARY_MANIFEST) {
      const o = overrideById.get(s.id) ?? null;
      out.push({
        id: s.id,
        source: 'library',
        title: o?.card_title_override?.trim() || s.title,
        subtitle: `${s.breed} · ${s.driver}`,
        override: o,
      });
    }
    // Admin-authored
    for (const o of overrides.data) {
      if (!o.scenario_id.startsWith('admin:')) continue;
      out.push({
        id: o.scenario_id,
        source: 'admin',
        title: o.card_title_override?.trim() || '(untitled admin scenario)',
        subtitle: `${o.breed ?? '—'} · ${o.suggested_driver ?? '—'}`,
        override: o,
      });
    }
    // User-built scenarios
    for (const s of userScenarios.data) {
      const fullId = `user:${s.id}`;
      const o = overrideById.get(fullId) ?? null;
      out.push({
        id: fullId,
        source: 'user',
        title: o?.card_title_override?.trim() || s.title,
        subtitle: `${s.breed ?? '—'} · ${s.life_stage ?? '—'}`,
        override: o,
        userScenario: s,
      });
    }
    if (!query) return out;
    const q = query.toLowerCase();
    return out.filter((it) =>
      `${it.id} ${it.title} ${it.subtitle}`.toLowerCase().includes(q),
    );
  }, [overrides.data, userScenarios.data, query]);

  const active = list.find((it) => it.id === activeId) ?? null;
  const baseManifest = active && active.source === 'library'
    ? LIBRARY_MANIFEST.find((s) => s.id === active.id) ?? null
    : null;

  function onSaved() {
    setRefreshKey((k) => k + 1);
  }

  function startNew() {
    const draft = emptyDraftForNewAdmin();
    setActiveId(draft.scenario_id ?? null);
    // We pass the empty draft via a transient state — Builder.useEffect
    // bootstraps it because there's no row yet in the snapshot.
    setSeedDraft(draft);
  }

  // Used for "New scenario" — the row doesn't exist in the snapshot yet,
  // so the builder needs an in-memory seed to start from.
  const [seedDraft, setSeedDraft] = useState<Partial<ScenarioOverrideRow> | null>(null);
  /** Set when the open draft is an unsaved client-side copy of another scenario. */
  const [copiedFrom, setCopiedFrom] = useState<string | null>(null);

  /**
   * Duplicate a library/user scenario entirely client-side.
   *
   * The server's `op=duplicate` copies an override ROW, which for a library
   * scenario may be empty or absent — the copy would come out blank (and the
   * endpoint now 400s for non-`admin:` ids saying exactly that). Copying the
   * hydrated draft copies the scenario as it actually runs.
   */
  function duplicateLocally(entry: ListEntry) {
    const manifest =
      entry.source === 'library'
        ? LIBRARY_MANIFEST.find((s) => s.id === entry.id) ?? null
        : null;
    const hydrated = buildInitialDraft(
      { id: entry.id, source: entry.source, override: entry.override },
      manifest,
      entry.userScenario ?? null,
    );
    const copy = buildDuplicateDraft(
      hydrated,
      `admin:${crypto.randomUUID()}`,
      manifest?.title ?? entry.title,
    );
    setSeedDraft(copy);
    setActiveId(copy.scenario_id ?? null);
    setCopiedFrom(entry.title);
  }

  async function duplicateSaved(entry: ListEntry) {
    try {
      await duplicateScenario(entry.id);
      onSaved();
      toast({ message: `“${entry.title}” duplicated — the copy starts hidden.`, tone: 'success' });
    } catch (err) {
      toast({
        message: `Couldn’t duplicate — ${err instanceof Error ? err.message : 'unknown error'}`,
        tone: 'error',
      });
    }
  }

  // A failed read must never reach the editor: `list` would be manifest-only
  // and saving from it would overwrite override rows we never loaded.
  if (readError) {
    return (
      <>
        <ContextBar
          title="Scenario builder"
          subtitle="Edit any scenario the app ships with, tune one a user built, or write a new one from scratch."
          query={query}
          onQuery={onQuery}
        />
        <ScreenShell>
          <InlineAlert tone="error" title="Couldn’t load the scenarios">
            <div>{readError}</div>
            <div style={{ marginTop: 6 }}>
              The list is hidden rather than shown half-loaded: without the saved
              overrides, every scenario would look untouched, and saving one would
              wipe the changes that are actually live.
            </div>
            <button
              onClick={() => setRefreshKey((k) => k + 1)}
              style={{ ...btnSecondary, marginTop: 10 }}
            >
              Retry
            </button>
          </InlineAlert>
        </ScreenShell>
      </>
    );
  }

  if (active || seedDraft) {
    const scenarioId = activeId ?? seedDraft?.scenario_id ?? '';
    // Hydrate with the scenario's CURRENT EFFECTIVE VALUES: base data (seed
    // manifest / user_scenarios row) overlaid by the override row's set
    // columns. A never-overridden scenario used to open a blank form.
    const initial =
      seedDraft && seedDraft.scenario_id === activeId
        ? seedDraft
        : buildInitialDraft(
            {
              id: scenarioId,
              source: active?.source ?? 'admin',
              override: active?.override ?? null,
            },
            baseManifest,
            active?.userScenario ?? null,
          );
    return (
      <Builder
        key={scenarioId}
        scenarioId={scenarioId}
        initial={initial}
        source={active?.source ?? 'admin'}
        canWrite={canWrite}
        unsavedCopyOf={seedDraft && seedDraft.scenario_id === activeId ? copiedFrom : null}
        /*
          "Would unticking Visible empty the app?" — computed over every OTHER
          library/admin scenario, so it stays true regardless of what the draft
          currently says about this one.
        */
        isOnlyVisible={
          visibleScenarioCount(
            list.map((it) => ({ id: it.id, source: it.source, override: it.override })),
            scenarioId,
          ) === 0
        }
        hasOverride={Boolean(active?.override)}
        sparsify={(d) =>
          seedDraft && seedDraft.scenario_id === activeId
            ? d
            : diffAgainstBase(
                d,
                {
                  id: scenarioId,
                  source: active?.source ?? 'admin',
                  override: active?.override ?? null,
                },
                baseManifest,
                active?.userScenario ?? null,
              )
        }
        baseDescriptor={
          baseManifest
            ? {
                title: baseManifest.title,
                breed: baseManifest.breed,
                pushback: baseManifest.pushback,
                driver: baseManifest.driver,
                difficulty: baseManifest.defaultDifficulty,
              }
            : null
        }
        onClose={() => {
          setActiveId(null);
          setSeedDraft(null);
          setCopiedFrom(null);
        }}
        onSaved={() => {
          onSaved();
          setSeedDraft(null);
          setCopiedFrom(null);
        }}
      />
    );
  }

  return (
    <>
      <ContextBar
        title="Scenario builder"
        subtitle="Edit any scenario the app ships with, tune one a user built, or write a new one from scratch. Saved changes go live immediately."
        query={query}
        onQuery={onQuery}
      />
      <ScreenShell>
        <ReadOnlyBanner permission="scenarios.write" />
        <FirstRunCard id="builder" title="Three kinds of scenario live here">
          <strong>Library</strong> scenarios ship with the app — editing one saves an
          override on top, and only the fields you change. <strong>User</strong>{' '}
          scenarios were built by a trainee. <strong>Admin</strong> scenarios are ones
          you wrote here. Everything you do is recorded in <strong>Audit</strong>, and
          every save can be reverted from there — including a deleted scenario.
        </FirstRunCard>
        <Glass padding={20} radius={20}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
            }}
          >
            <SectionTitle
              title="All scenarios"
              subtitle={`${list.filter((l) => l.override).length} of ${list.length} have overrides`}
            />
            {canWrite && (
              <button onClick={startNew} style={btnPrimary}>
                + New scenario
              </button>
            )}
          </div>
          {overrides.loading || userScenarios.loading ? (
            <LoadingShimmer height={180} />
          ) : list.length === 0 ? (
            <EmptyState title="No scenarios match" />
          ) : (
            <div style={{ marginTop: 14, display: 'grid', gap: 8 }}>
              {list.map((it) => (
                <ListRow
                  key={it.id}
                  entry={it}
                  canWrite={canWrite}
                  onOpen={() => setActiveId(it.id)}
                  onDuplicate={() => {
                    // `admin:` rows are the scenario, so the server copy is
                    // complete; everything else is copied from the hydrated
                    // draft instead (see duplicateLocally).
                    if (it.source === 'admin') void duplicateSaved(it);
                    else duplicateLocally(it);
                  }}
                />
              ))}
            </div>
          )}
        </Glass>
      </ScreenShell>
    </>
  );
}

function ListRow({
  entry,
  canWrite,
  onOpen,
  onDuplicate,
}: {
  entry: ListEntry;
  canWrite: boolean;
  onOpen: () => void;
  onDuplicate: () => void;
}) {
  return (
    <div
      style={{
        padding: '12px 14px',
        borderRadius: 14,
        background: 'rgba(255,255,255,0.55)',
        border: '0.5px solid rgba(255,255,255,0.9)',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
      }}
    >
      <StatusPill
        tone={
          entry.source === 'library'
            ? 'info'
            : entry.source === 'admin'
              ? 'success'
              : 'neutral'
        }
      >
        {entry.source}
      </StatusPill>
      <div style={{ flex: 1, minWidth: 0, cursor: 'pointer' }} onClick={onOpen}>
        <div style={{ fontSize: 13, fontWeight: 700, color: COLOR.ink }}>{entry.title}</div>
        <div
          style={{
            fontFamily: 'var(--pbt-mono)',
            fontSize: 11,
            color: COLOR.inkMute,
            marginTop: 2,
          }}
        >
          {entry.id} · {entry.subtitle}
        </div>
      </div>
      {entry.override && !entry.override.visible && (
        <StatusPill tone="warn">hidden</StatusPill>
      )}
      <button onClick={onOpen} style={btnSecondary}>
        {canWrite ? 'Edit' : 'View'}
      </button>
      {canWrite && (
        <button onClick={onDuplicate} style={btnSecondary}>
          Duplicate
        </button>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Builder (visual + AI wizard tabs + preview pane)
// ─────────────────────────────────────────────────────────────

interface BaseDescriptor {
  title: string;
  breed: string;
  pushback: string;
  driver: string;
  difficulty: number;
}

type Tab = 'visual' | 'wizard';

function Builder({
  scenarioId,
  initial,
  source,
  canWrite,
  unsavedCopyOf,
  isOnlyVisible,
  hasOverride,
  sparsify,
  baseDescriptor,
  onClose,
  onSaved,
}: {
  scenarioId: string;
  /** Fully hydrated draft (base values overlaid by any override row). */
  initial: Partial<ScenarioOverrideRow>;
  /** Where the scenario comes from — drives revert vs. delete, and the notes. */
  source: 'library' | 'admin' | 'user';
  canWrite: boolean;
  /** Title of the scenario this unsaved draft was copied from, if any. */
  unsavedCopyOf: string | null;
  /** True when every OTHER library/admin scenario is already hidden. */
  isOnlyVisible: boolean;
  /** True when a scenario_overrides row already exists for this scenario. */
  hasOverride: boolean;
  /**
   * Turns the hydrated draft back into a sparse override before saving —
   * fields still equal to the base scenario go out as null ("inherit"), so
   * saving doesn't freeze a copy of the base against future seed updates.
   */
  sparsify: (d: Partial<ScenarioOverrideRow>) => Partial<ScenarioOverrideRow>;
  baseDescriptor: BaseDescriptor | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const confirm = useConfirm();
  const [tab, setTab] = useState<Tab>('visual');
  const [draft, setDraft] = useState<Partial<ScenarioOverrideRow>>(initial);
  // Baseline = the hydrated draft, so an untouched form is never "dirty".
  // Builder is mounted with key={scenarioId}, so this is re-captured whenever
  // the admin switches scenarios.
  const baselineRef = useRef<string>(JSON.stringify(initial));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [testOpen, setTestOpen] = useState(false);

  // The action bar wraps at narrow widths (and grows when a save error shows),
  // so its height is content-dependent — the preview column's sticky offset
  // tracks the measured height instead of assuming a constant.
  const barRef = useRef<HTMLDivElement | null>(null);
  const [stickyTop, setStickyTop] = useState(STICKY_TOP);
  useEffect(() => {
    const inner = barRef.current;
    if (!inner) return;
    const bar = inner.parentElement ?? inner; // the Glass surface around the row
    const update = () => setStickyTop(bar.offsetHeight + 22); // + bar margin & gap
    update();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(update);
    ro.observe(bar);
    return () => ro.disconnect();
  }, []);
  // Narrow viewports drop the two-column split: the preview stacks under the
  // editor and stops being sticky (a sticky panel on a phone-width column just
  // eats the screen).
  const stacked = useViewportBelow(PREVIEW_STACK_BREAKPOINT);

  // Keep draft.scenario_id stable.
  useEffect(() => {
    if (draft.scenario_id !== scenarioId) {
      setDraft((d) => ({ ...d, scenario_id: scenarioId }));
    }
  }, [scenarioId, draft.scenario_id]);

  const dirty = useMemo(
    () => JSON.stringify(draft) !== baselineRef.current,
    [draft],
  );

  // Warn on tab/window close while there are unsaved changes.
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);

  /** Leaving with unsaved edits — the one confirm that is not destructive. */
  async function closeWithDiscardGuard() {
    if (dirty) {
      const ok = await confirm({
        title: 'Discard unsaved changes?',
        body: 'Your edits to this scenario have not been saved.',
        confirmLabel: 'Discard changes',
        cancelLabel: 'Keep editing',
        tone: 'danger',
      });
      if (!ok) return;
    }
    onClose();
  }

  function patch(p: Partial<ScenarioOverrideRow>) {
    setDraft((d) => ({ ...d, ...p }));
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      if ((draft.prompt_prefix ?? '').length > PROMPT_MAX || (draft.prompt_suffix ?? '').length > PROMPT_MAX) {
        throw new Error(`Prompt overrides must be ≤ ${PROMPT_MAX} chars.`);
      }
      // Trim empties → null so they don't accidentally override defaults.
      // `sparsify` nulls out fields still equal to the base scenario (so
      // saving never pins base values); `stripServerManaged` drops
      // updated_at / created_at / created_by / updated_by / deleted_at —
      // they ride along on the hydrated draft but are the server's to set.
      const trimmed: Partial<ScenarioOverrideRow> = stripServerManaged(sparsify(draft));
      const stringFields: Array<keyof ScenarioOverrideRow> = [
        'title_override',
        'context_override',
        'opening_line_override',
        'persona_override',
        'prompt_prefix',
        'prompt_suffix',
        'card_title_override',
        'card_subtitle_override',
        'info_modal_title',
        'info_modal_body',
        'start_button_label',
        'breed',
        'life_stage',
        'pushback_id',
        'pushback_notes',
        'suggested_driver',
        'card_driver_override',
      ];
      for (const k of stringFields) {
        const v = trimmed[k];
        if (typeof v === 'string' && v.trim() === '') {
          (trimmed as Record<string, unknown>)[k] = null;
        }
      }
      await upsertScenarioOverride({ ...trimmed, scenario_id: scenarioId });
      baselineRef.current = JSON.stringify(draft);
      toast({
        message: `“${draft.card_title_override?.trim() || baseDescriptor?.title || scenarioId}” saved — live in the app now.`,
        tone: 'success',
      });
      onSaved();
      onClose();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Save failed';
      setError(message);
      toast({ message: `Save failed — ${message}`, tone: 'error' });
    } finally {
      setSaving(false);
    }
  }

  /** Ticking / unticking "Visible", with a guard on emptying the app. */
  async function setVisible(next: boolean) {
    if (!next && isOnlyVisible && (draft.visible ?? false)) {
      const ok = await confirm({
        title: 'Hide the last visible scenario?',
        body: 'Every other library and admin scenario is already hidden.',
        consequences: [
          'The app will show “no scenarios available” to every user.',
          'Trainees cannot start a session until something is visible again.',
        ],
        confirmLabel: 'Hide it anyway',
        tone: 'danger',
      });
      if (!ok) return;
    }
    patch({ visible: next });
  }

  /**
   * Library / user scenarios: throw the override row away and go back to what
   * the app ships (or to what the user built).
   */
  async function revertToBuiltIn() {
    const sparse = sparsify(draft);
    const fields = overriddenFieldLabels(sparse, { baseVisible: true });
    const ok = await confirm({
      title: 'Revert this scenario to its built-in version?',
      body:
        source === 'user'
          ? 'The admin override row is deleted; the scenario goes back to exactly what the user built.'
          : 'The admin override row is deleted; the scenario goes back to exactly what the app ships.',
      consequences: [
        ...(fields.length > 0
          ? fields.map((f) => `“${f}” goes back to the built-in value.`)
          : ['No fields currently carry an override — this just clears the row.']),
        'Recoverable from Audit → Revert.',
      ],
      confirmLabel: 'Revert to built-in',
      tone: 'danger',
    });
    if (!ok) return;
    setSaving(true);
    try {
      await deleteScenarioOverride(scenarioId);
      toast({ message: 'Reverted to the built-in scenario.', tone: 'success' });
      onSaved();
      onClose();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Revert failed';
      setError(message);
      toast({ message: `Revert failed — ${message}`, tone: 'error' });
    } finally {
      setSaving(false);
    }
  }

  /** Admin-authored scenarios: the row IS the scenario, so this deletes it. */
  async function deleteScenario() {
    const title = draft.card_title_override?.trim() || '(untitled admin scenario)';
    const ok = await confirm({
      title: `Delete “${title}”?`,
      body: 'This scenario was written here, so deleting the row deletes the scenario.',
      consequences: [
        'It disappears from the app immediately for everyone.',
        'Its past training sessions and their scores are untouched.',
        'Recoverable from Audit → Revert.',
      ],
      confirmLabel: 'Delete scenario',
      tone: 'danger',
    });
    if (!ok) return;
    setSaving(true);
    try {
      await deleteScenarioOverride(scenarioId);
      toast({
        message: `“${title}” deleted — restore it from Audit → Revert if that was a mistake.`,
        tone: 'success',
      });
      onSaved();
      onClose();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Delete failed';
      setError(message);
      toast({ message: `Delete failed — ${message}`, tone: 'error' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <ContextBar
        title={
          (draft.card_title_override?.trim() as string | undefined) ||
          baseDescriptor?.title ||
          'Builder'
        }
        subtitle={`${scenarioId}${baseDescriptor ? ` · base: ${baseDescriptor.breed} ${baseDescriptor.driver}` : ' · admin-authored'}`}
      />
      <ScreenShell>
        {/*
          Sticky action bar. The stepped editor is short enough to work with,
          but Save / Discard / the Visible pill must stay reachable from any
          step without scrolling back to the top.
        */}
        <Glass
          padding={10}
          radius={16}
          shine={false}
          style={{ position: 'sticky', top: 0, zIndex: 20, marginBottom: 14 }}
        >
          <div
            ref={barRef}
            style={{
              display: 'flex',
              gap: 10,
              alignItems: 'center',
              flexWrap: 'wrap',
            }}
          >
            <button onClick={() => void closeWithDiscardGuard()} style={btnSecondary}>
              ← Back to list
            </button>
            <div style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
              {(['visual', 'wizard'] as Tab[]).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  style={{
                    padding: '8px 14px',
                    borderRadius: 9999,
                    border: 'none',
                    cursor: 'pointer',
                    background:
                      tab === t ? COLOR.brand : 'rgba(60,20,15,0.06)',
                    color: tab === t ? '#fff' : COLOR.ink,
                    fontSize: 12,
                    fontWeight: 700,
                  }}
                >
                  {t === 'visual' ? 'Visual editor' : 'AI wizard'}
                </button>
              ))}
            </div>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
              <button onClick={() => setTestOpen((v) => !v)} style={btnSecondary}>
                {testOpen ? 'Hide test' : 'Test in app'}
              </button>
              {/*
                Two very different actions used to share one "Remove overrides"
                button: for a library scenario it reverts to the shipped
                version, for an admin one it deletes the scenario outright.
                They are split, and the delete lives in its own danger zone
                at the foot of the editor.
              */}
              {canWrite && source !== 'admin' && hasOverride && (
                <button
                  onClick={() => void revertToBuiltIn()}
                  disabled={saving}
                  style={{ ...btnSecondary, color: COLOR.danger }}
                >
                  Revert to built-in
                </button>
              )}
              <StatusPill tone={draft.visible ? 'success' : 'warn'}>
                {draft.visible ? 'Visible in app' : 'Hidden'}
              </StatusPill>
              {dirty && (
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    color: COLOR.warn,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: 999,
                      background: COLOR.warn,
                      display: 'inline-block',
                    }}
                  />
                  Unsaved changes
                </span>
              )}
              {canWrite && (
                <button onClick={() => void save()} disabled={saving} style={btnPrimary}>
                  {saving ? 'Saving…' : 'Save'}
                </button>
              )}
            </div>
            {/* Save failures surface HERE, next to the button that failed —
                not at the page bottom where a scrolled admin never sees them. */}
            {error && (
              <div
                role="alert"
                style={{
                  flexBasis: '100%',
                  padding: '8px 12px',
                  borderRadius: 10,
                  background: COLOR.dangerSoft,
                  color: COLOR.danger,
                  fontSize: 12.5,
                  fontWeight: 600,
                }}
              >
                {error}
              </div>
            )}
          </div>
        </Glass>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: stacked ? 'minmax(0, 1fr)' : 'minmax(0, 1.2fr) 380px',
            gap: 16,
            alignItems: 'start',
          }}
        >
          {/* Left: editor */}
          <div style={{ display: 'grid', gap: 14, alignContent: 'start' }}>
            <ReadOnlyBanner permission="scenarios.write" />
            {unsavedCopyOf && (
              <InlineAlert tone="info" title="This is an unsaved copy">
                Copied from “{unsavedCopyOf}”. Nothing exists in the app yet — review
                the fields and press <strong>Save</strong>. It starts hidden, so
                publishing it is a second, deliberate step.
              </InlineAlert>
            )}
            {source === 'user' && (
              <InlineAlert tone="warn" title="Edits here don’t reach that user yet">
                The app doesn’t apply admin overrides to user-built scenarios, so
                saving changes what you see here — not what the user who built it
                sees. To publish your version, use <strong>Duplicate</strong> and save
                it as an admin scenario.
              </InlineAlert>
            )}
            <Glass padding={20} radius={20}>
              {tab === 'visual' ? (
                <VisualEditor
                  draft={draft}
                  patch={patch}
                  onVisible={setVisible}
                  baseDescriptor={baseDescriptor}
                  sparsify={sparsify}
                />
              ) : (
                <ScenarioWizard draft={draft} patch={patch} />
              )}
            </Glass>
            {canWrite && source === 'admin' && hasOverride && (
              <DangerZone
                title="Delete this scenario"
                description="It was written here, so there is no built-in version underneath to fall back to. Audit → Revert can bring it back."
              >
                <button
                  onClick={() => void deleteScenario()}
                  disabled={saving}
                  style={{ ...btnSecondary, color: COLOR.danger, fontWeight: 800 }}
                >
                  Delete scenario
                </button>
              </DangerZone>
            )}
          </div>

          {/*
            Right: preview + test. Sticky so the card stays in view while the
            admin works through the steps; it caps its own height and scrolls
            internally, otherwise an open test iframe would push its own bottom
            past the viewport where sticky can never bring it back.
          */}
          <div
            style={{
              display: 'grid',
              gap: 12,
              alignContent: 'start',
              ...(stacked
                ? null
                : {
                    position: 'sticky',
                    top: stickyTop,
                    maxHeight: `calc(100vh - ${stickyTop + 24}px)`,
                    overflowY: 'auto',
                  }),
            }}
          >
            <Glass padding={16} radius={18}>
              <Eyebrow>Live card preview</Eyebrow>
              <div style={{ marginTop: 12 }}>
                <CardPreview draft={draft} baseDescriptor={baseDescriptor} />
              </div>
            </Glass>
            {testOpen && (
              <Glass padding={0} radius={18} shine={false} style={{ overflow: 'hidden' }}>
                <TestIframe scenarioId={scenarioId} draft={draft} />
              </Glass>
            )}
          </div>
        </div>
      </ScreenShell>
    </>
  );
}

// ─────────────────────────────────────────────────────────────
// Visual editor — every editable field, grouped into four steps
// ─────────────────────────────────────────────────────────────

function VisualEditor({
  draft,
  patch,
  onVisible,
  baseDescriptor,
  sparsify,
}: {
  draft: Partial<ScenarioOverrideRow>;
  patch: (p: Partial<ScenarioOverrideRow>) => void;
  /** Guarded visibility setter — may ask before hiding the last scenario. */
  onVisible: (next: boolean) => void;
  baseDescriptor: BaseDescriptor | null;
  /** Same sparsifier the save path uses — drives the "has overrides" dots. */
  sparsify: (d: Partial<ScenarioOverrideRow>) => Partial<ScenarioOverrideRow>;
}) {
  const isAdminScenario = (draft.scenario_id ?? '').startsWith('admin:');
  const [step, setStep] = useState<BuilderStepKey>('scenario');

  const states = useMemo(
    () =>
      computeStepStates({
        sparse: sparsify(draft),
        draft,
        // Library and user scenarios are live in the app already; only an
        // admin-authored one starts hidden.
        baseVisible: !isAdminScenario,
        requireCoreFields: isAdminScenario,
      }),
    [draft, sparsify, isAdminScenario],
  );

  const index = Math.max(
    0,
    BUILDER_STEPS.findIndex((s) => s.key === step),
  );
  const def = BUILDER_STEPS[index];

  return (
    <div style={{ display: 'grid', gap: 18 }}>
      <StepNav active={step} states={states} onStep={setStep} />
      <div>
        <Eyebrow>{`Step ${index + 1} of ${BUILDER_STEPS.length} · ${def.label}`}</Eyebrow>
        <div style={{ fontSize: 13, color: COLOR.inkMute, marginTop: 4 }}>{def.hint}</div>
      </div>

      <div style={{ display: 'grid', gap: 18 }}>
        {step === 'scenario' && (
          <ScenarioStep
            draft={draft}
            patch={patch}
            baseDescriptor={baseDescriptor}
            missing={states.scenario.missing}
          />
        )}
        {step === 'knowledge' && <KnowledgeSection draft={draft} patch={patch} />}
        {step === 'ai' && <AiInstructionsStep draft={draft} patch={patch} />}
        {step === 'card' && (
          <CardStep
            draft={draft}
            patch={patch}
            onVisible={onVisible}
            baseDescriptor={baseDescriptor}
          />
        )}
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          paddingTop: 14,
          borderTop: `1px solid ${COLOR.border}`,
        }}
      >
        <button
          onClick={() => setStep(BUILDER_STEPS[index - 1].key)}
          disabled={index === 0}
          style={{
            ...btnSecondary,
            ...(index === 0 ? { opacity: 0.45, cursor: 'default' } : null),
          }}
        >
          ← Back
        </button>
        <span
          style={{
            fontFamily: 'var(--pbt-mono)',
            fontSize: 11,
            color: COLOR.inkMute,
            letterSpacing: '0.10em',
            textTransform: 'uppercase',
          }}
        >
          {`${index + 1} / ${BUILDER_STEPS.length}`}
        </span>
        <button
          onClick={() => setStep(BUILDER_STEPS[index + 1].key)}
          disabled={index === BUILDER_STEPS.length - 1}
          style={{
            ...btnSecondary,
            marginLeft: 'auto',
            ...(index === BUILDER_STEPS.length - 1
              ? { opacity: 0.45, cursor: 'default' }
              : null),
          }}
        >
          Next →
        </button>
      </div>
    </div>
  );
}

/**
 * Horizontal stepper. These are edit views, not a wizard — every pill is
 * clickable in any order. A dot marks a step that carries overrides; a ⚠
 * marks the Scenario step when an admin-authored scenario is missing a
 * required field.
 */
function StepNav({
  active,
  states,
  onStep,
}: {
  active: BuilderStepKey;
  states: Record<BuilderStepKey, BuilderStepState>;
  onStep: (k: BuilderStepKey) => void;
}) {
  return (
    <div aria-label="Editor steps" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      {BUILDER_STEPS.map((s, i) => {
        const on = s.key === active;
        const state = states[s.key];
        const warn = state.missing.length > 0;
        const notes = [
          state.overrides > 0
            ? `${state.overrides} field${state.overrides === 1 ? '' : 's'} overridden`
            : null,
          warn ? `missing ${state.missing.join(', ')}` : null,
        ].filter(Boolean);
        return (
          <button
            key={s.key}
            aria-current={on ? 'step' : undefined}
            onClick={() => onStep(s.key)}
            title={notes.length ? `${s.label} — ${notes.join('; ')}` : s.label}
            aria-label={notes.length ? `${s.label}, ${notes.join(', ')}` : s.label}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '6px 14px 6px 6px',
              borderRadius: 9999,
              border: 'none',
              cursor: 'pointer',
              background: on ? COLOR.brand : 'rgba(60,20,15,0.06)',
              color: on ? '#fff' : COLOR.ink,
              fontFamily: 'var(--pbt-font)',
              fontSize: 12.5,
              fontWeight: 700,
              transition: 'background 0.14s ease, color 0.14s ease',
            }}
          >
            <span
              aria-hidden
              style={{
                width: 22,
                height: 22,
                borderRadius: 9999,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: on ? 'rgba(255,255,255,0.28)' : 'rgba(255,255,255,0.85)',
                color: on ? '#fff' : COLOR.inkMute,
                fontFamily: 'var(--pbt-mono)',
                fontSize: 11,
                fontWeight: 800,
                flexShrink: 0,
              }}
            >
              {i + 1}
            </span>
            <span>{s.label}</span>
            {warn && (
              <span aria-hidden style={{ fontSize: 11, color: on ? '#fff' : COLOR.warn }}>
                ⚠
              </span>
            )}
            {state.overrides > 0 && (
              <span
                aria-hidden
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: 9999,
                  background: on ? '#fff' : COLOR.brand,
                  flexShrink: 0,
                }}
              />
            )}
          </button>
        );
      })}
    </div>
  );
}
// ── Step 1 · Scenario ─────────────────────────────────────────

function ScenarioStep({
  draft,
  patch,
  baseDescriptor,
  missing,
}: {
  draft: Partial<ScenarioOverrideRow>;
  patch: (p: Partial<ScenarioOverrideRow>) => void;
  baseDescriptor: BaseDescriptor | null;
  /** Required-field labels still empty (admin-authored scenarios only). */
  missing: string[];
}) {
  const isAdminScenario = (draft.scenario_id ?? '').startsWith('admin:');
  return (
    <>
      {missing.length > 0 && (
        <div
          style={{
            padding: '10px 14px',
            borderRadius: 12,
            background: COLOR.warnSoft,
            color: COLOR.ink,
            fontSize: 12.5,
          }}
        >
          <strong>Still needed:</strong> {missing.join(', ')}. Admin-authored scenarios
          need these before they read correctly in the app.
        </div>
      )}
      {/* Legacy column: no control writes it and the app never reads it, but a
          value saved by an older client still counts as an override — surface
          it with a way to clear, or the step badge points at nothing. */}
      {(draft.title_override ?? '').trim() !== '' && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '10px 14px',
            borderRadius: 12,
            background: 'rgba(60,20,15,0.05)',
            fontSize: 12.5,
            color: COLOR.inkSoft,
          }}
        >
          <span style={{ flex: 1 }}>
            Legacy title override: “{draft.title_override}” — no longer used by the app.
          </span>
          <button
            onClick={() => patch({ title_override: null })}
            style={{ ...btnSecondary, padding: '6px 12px', fontSize: 12 }}
          >
            Clear
          </button>
        </div>
      )}
      <Section
        label="Scenario fields"
        help={
          isAdminScenario
            ? 'These define the scenario. Breed, life stage, pushback and driver are required for admin-authored scenarios.'
            : 'The scenario as it runs today. Edit a field to change it; clear a field to fall back to the built-in value.'
        }
        defaultOpen
      >
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <Field label="Breed">
            <input
              value={draft.breed ?? ''}
              onChange={(e) => patch({ breed: e.target.value })}
              placeholder={baseDescriptor?.breed}
              style={inputStyle}
            />
          </Field>
          <Field label="Life stage">
            <SelectInput
              value={draft.life_stage ?? ''}
              onChange={(v) => patch({ life_stage: v || null })}
              options={LIFE_STAGES}
            />
          </Field>
          <Field label="Pushback">
            <SelectInput
              value={draft.pushback_id ?? ''}
              onChange={(v) => patch({ pushback_id: v || null })}
              options={PUSHBACK_IDS}
            />
          </Field>
          <TipField
            label="Suggested driver"
            help="The customer's ECHO personality — this one really does change the AI."
            tip={{
              title: 'Suggested driver (ECHO personality)',
              body: (
                <>
                  <p style={{ marginTop: 0 }}>
                    The driver is the customer's personality profile, and it is fed straight into the
                    AI's briefing: their motivation, how they talk, how they behave under stress, and
                    a set of sample phrasings they draw on.
                  </p>
                  <ul style={{ paddingLeft: 18, margin: '8px 0' }}>
                    <li>
                      <strong>Activator</strong> — blunt, results-first, interrupts, wants the bottom
                      line.
                    </li>
                    <li>
                      <strong>Energizer</strong> — chatty, emotional, story-driven, easily distracted.
                    </li>
                    <li>
                      <strong>Analyzer</strong> — wants evidence, numbers, and studies before moving.
                    </li>
                    <li>
                      <strong>Harmonizer</strong> — conflict-averse, agrees out loud and resists
                      quietly.
                    </li>
                  </ul>
                  <p style={{ marginBottom: 0 }}>
                    It changes <em>how</em> the customer pushes back, not <em>what</em> they push back
                    on — the pushback field does that.
                  </p>
                </>
              ),
            }}
          >
            <DriverSelect
              value={draft.suggested_driver ?? null}
              onChange={(v) => patch({ suggested_driver: v })}
              allowEmpty={!isAdminScenario}
            />
          </TipField>
          <TipField
            label="Persona"
            help="The owner's situation — layered on top of the driver."
            tip={{
              title: 'Persona',
              body: (
                <>
                  <p style={{ marginTop: 0 }}>
                    The persona is the owner's circumstance rather than their personality:
                    <strong> Skeptical</strong>, <strong>Anxious</strong>, <strong>Busy</strong>,
                    <strong> Bargain-hunter</strong>, or <strong>Devoted</strong>.
                  </p>
                  <p style={{ marginBottom: 0 }}>
                    It rides in the AI's briefing alongside the driver, so an "Analyzer /
                    Bargain-hunter" asks for evidence <em>and</em> keeps returning to price, while an
                    "Analyzer / Devoted" asks for evidence because they are frightened of getting it
                    wrong.
                  </p>
                </>
              ),
            }}
          >
            <SelectInput
              value={draft.persona_override ?? ''}
              onChange={(v) => patch({ persona_override: v || null })}
              options={PERSONAS}
            />
          </TipField>
          <TipField
            label="Difficulty (1–4)"
            help="1 Coachable · 2 Skeptical · 3 Hostile · 4 Combative"
            tip={{
              title: 'Difficulty',
              body: (
                <>
                  <p style={{ marginTop: 0 }}>
                    Difficulty sets how long the customer holds their ground before they can be moved:
                  </p>
                  <ul style={{ paddingLeft: 18, margin: '8px 0' }}>
                    <li>
                      <strong>1 — Coachable:</strong> pushes back once, yields to genuine listening.
                    </li>
                    <li>
                      <strong>2 — Skeptical:</strong> pushes back twice, softens visibly on solid ACT.
                    </li>
                    <li>
                      <strong>3 — Hostile:</strong> holds pressure for at least three turns.
                    </li>
                    <li>
                      <strong>4 — Combative:</strong> stays difficult; only multiple strong,
                      evidence-backed turns move them.
                    </li>
                  </ul>
                  <p style={{ marginBottom: 0 }}>
                    At every level the customer <em>does</em> soften when the trainee earns it — higher
                    difficulty means they have to earn it more times, not that the scenario is
                    unwinnable. Scoring is unaffected: a level 4 is graded on the same rubric as a
                    level 1.
                  </p>
                </>
              ),
            }}
          >
            <input
              type="number"
              min={1}
              max={4}
              value={draft.difficulty_override ?? ''}
              onChange={(e) =>
                patch({
                  difficulty_override:
                    e.target.value === '' ? null : Number(e.target.value),
                })
              }
              style={inputStyle}
            />
          </TipField>
          <Field label="Weight (kg)">
            <input
              type="number"
              step="0.1"
              value={draft.weight_kg ?? ''}
              onChange={(e) =>
                patch({ weight_kg: e.target.value === '' ? null : Number(e.target.value) })
              }
              style={inputStyle}
            />
          </Field>
          <Field label="Pushback notes">
            <input
              value={draft.pushback_notes ?? ''}
              onChange={(e) => patch({ pushback_notes: e.target.value })}
              style={inputStyle}
            />
          </Field>
        </div>
        <Field label="Opening line">
          <textarea
            rows={2}
            value={draft.opening_line_override ?? ''}
            onChange={(e) => patch({ opening_line_override: e.target.value })}
            style={textareaStyle}
          />
        </Field>
        <Field label="Context">
          <textarea
            rows={3}
            value={draft.context_override ?? ''}
            onChange={(e) => patch({ context_override: e.target.value })}
            style={textareaStyle}
          />
        </Field>
      </Section>
    </>
  );
}

// ── Step 3 · AI instructions ──────────────────────────────────

function AiInstructionsStep({
  draft,
  patch,
}: {
  draft: Partial<ScenarioOverrideRow>;
  patch: (p: Partial<ScenarioOverrideRow>) => void;
}) {
  return (
    <Section
      label="Extra AI instructions"
      help="Optional notes handed to the AI customer alongside its normal briefing. Scoring is unaffected."
      defaultOpen
    >
      <TipField
        label={`Opening notes — read before the briefing (${(draft.prompt_prefix ?? '').length}/${PROMPT_MAX})`}
        help="Optional. Added to the top of the AI customer's briefing as admin notes. Use it to shape attitude or emphasis — e.g. “Be noticeably more impatient than usual.”"
        tip={{
          title: 'Opening notes (prompt prefix)',
          body: <PromptWrapExplainer highlight="prefix" />,
        }}
      >
        <textarea
          maxLength={PROMPT_MAX}
          rows={4}
          value={draft.prompt_prefix ?? ''}
          onChange={(e) => patch({ prompt_prefix: e.target.value })}
          style={textareaStyle}
          placeholder="Be noticeably more impatient than usual — you are late for work."
        />
      </TipField>
      <TipField
        label={`Final reminders — read after the briefing (${(draft.prompt_suffix ?? '').length}/${PROMPT_MAX})`}
        help="Optional. Added at the very end, so it lands last. Use it for hard rules the customer must keep — e.g. “Never agree to the diet before asking about price.”"
        tip={{
          title: 'Final reminders (prompt suffix)',
          body: <PromptWrapExplainer highlight="suffix" />,
        }}
      >
        <textarea
          maxLength={PROMPT_MAX}
          rows={4}
          value={draft.prompt_suffix ?? ''}
          onChange={(e) => patch({ prompt_suffix: e.target.value })}
          style={textareaStyle}
          placeholder="Never agree to the diet before asking about price."
        />
      </TipField>
    </Section>
  );
}

// ── Step 4 · Card & visibility ────────────────────────────────

function CardStep({
  draft,
  patch,
  onVisible,
  baseDescriptor,
}: {
  draft: Partial<ScenarioOverrideRow>;
  patch: (p: Partial<ScenarioOverrideRow>) => void;
  onVisible: (next: boolean) => void;
  baseDescriptor: BaseDescriptor | null;
}) {
  return (
    <>
      {/* Visibility / sort / driver tint */}
      <Section
        label="Card display"
        defaultOpen
        help="How the scenario looks on the Home screen. None of this changes how the AI customer behaves."
        tip={{
          title: 'Card display & visibility',
          body: (
            <>
              <p style={{ marginTop: 0 }}>
                These settings only affect the <strong>card</strong> the trainee taps on the Home
                screen — its position, its accent colour, and whether it appears at all. The AI
                customer never sees any of it.
              </p>
              <p>
                <strong>Visible</strong> is the live switch: unchecked, the scenario disappears from
                the consumer app for everyone. Library and user-built scenarios open here already
                ticked because they are live today — untick it only if you actually want to pull the
                scenario.
              </p>
              <p style={{ marginBottom: 0 }}>
                <strong>Card accent driver</strong> tints the card. Leave it empty and the card
                follows the scenario's suggested driver.
              </p>
            </>
          ),
        }}
      >
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>
          <Field label="Visible" help="Unticked = removed from the app for everyone.">
            <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                type="checkbox"
                checked={draft.visible ?? false}
                onChange={(e) => onVisible(e.target.checked)}
              />
              {draft.visible ? 'Shown in app' : 'Hidden from app'}
            </label>
          </Field>
          <Field label="Sort order" help="Lower first. Empty = default.">
            <input
              type="number"
              value={draft.sort_order ?? ''}
              onChange={(e) =>
                patch({ sort_order: e.target.value === '' ? null : Number(e.target.value) })
              }
              style={inputStyle}
              placeholder="—"
            />
          </Field>
          <Field label="Card accent driver" help="Tint only — does not affect AI behaviour.">
            <DriverSelect
              value={draft.card_driver_override ?? null}
              onChange={(v) => patch({ card_driver_override: v })}
              allowEmpty
            />
          </Field>
        </div>
      </Section>

      <Section label="Card text" defaultOpen>
        <div style={{ display: 'grid', gap: 14 }}>
          <Field label={`Card title (${(draft.card_title_override ?? '').length}/120)`}>
            <input
              maxLength={120}
              value={draft.card_title_override ?? ''}
              onChange={(e) => patch({ card_title_override: e.target.value })}
              placeholder={baseDescriptor?.title ?? '—'}
              style={inputStyle}
            />
          </Field>
          <Field label={`Card subtitle (${(draft.card_subtitle_override ?? '').length}/240)`}>
            <input
              maxLength={240}
              value={draft.card_subtitle_override ?? ''}
              onChange={(e) => patch({ card_subtitle_override: e.target.value })}
              placeholder={
                baseDescriptor
                  ? `${baseDescriptor.breed}. Driver: ${baseDescriptor.driver}.`
                  : '—'
              }
              style={inputStyle}
            />
          </Field>
          <Field label={`Start button label (${(draft.start_button_label ?? '').length}/40)`}>
            <input
              maxLength={40}
              value={draft.start_button_label ?? ''}
              onChange={(e) => patch({ start_button_label: e.target.value })}
              placeholder="Start scenario"
              style={inputStyle}
            />
          </Field>
        </div>
      </Section>

      <Section label="Per-scenario info modal" defaultOpen>
        <div style={{ display: 'grid', gap: 14 }}>
          <Field label="Modal title (optional)">
            <input
              value={draft.info_modal_title ?? ''}
              onChange={(e) => patch({ info_modal_title: e.target.value })}
              placeholder="Defaults to card title"
              style={inputStyle}
            />
          </Field>
          <Field
            label={`Modal body (${(draft.info_modal_body ?? '').length}/4000)`}
            help="Plain text. Empty = info icon shows the global scoring modal instead."
          >
            <textarea
              maxLength={4000}
              rows={5}
              value={draft.info_modal_body ?? ''}
              onChange={(e) => patch({ info_modal_body: e.target.value })}
              style={textareaStyle}
            />
          </Field>
        </div>
      </Section>
    </>
  );
}


/**
 * Shared explainer for the two prompt-wrap fields — shows where the text
 * actually lands in the assembled system prompt (see
 * `buildCustomerSystemPrompt` in src/data/knowledge/promptBuilders.ts).
 */
function PromptWrapExplainer({ highlight }: { highlight: 'prefix' | 'suffix' }) {
  const line = (text: string, on: boolean) => (
    <div
      style={{
        padding: '3px 8px',
        borderRadius: 6,
        background: on ? COLOR.brandSoft : 'transparent',
        fontWeight: on ? 700 : 400,
        color: on ? COLOR.ink : COLOR.inkMute,
      }}
    >
      {text}
    </div>
  );
  return (
    <>
      <p style={{ marginTop: 0 }}>
        Both boxes are optional. Whatever you type is wrapped around the canonical customer briefing
        — it never replaces it, and it never touches scoring. Each box is capped at {PROMPT_MAX}{' '}
        characters and is trimmed before use.
      </p>
      <p style={{ marginBottom: 6 }}>The AI customer receives, in this order:</p>
      <div
        style={{
          fontFamily: 'var(--pbt-mono)',
          fontSize: 11.5,
          lineHeight: 1.7,
          border: `1px solid ${COLOR.border}`,
          borderRadius: 10,
          padding: 10,
          background: 'rgba(255,255,255,0.6)',
        }}
      >
        {line('# ADMIN NOTES (apply on top of the canonical brief below)', highlight === 'prefix')}
        {line('  ‹global opening notes from the Simulation screen›', false)}
        {line('  ‹your opening notes›', highlight === 'prefix')}
        {line('You are roleplaying a Royal Canin customer…', false)}
        {line('# DOG · # PUSHBACK · # YOUR PERSONALITY · # REFERENCE', false)}
        {line('# ADMIN ADDENDUM', highlight === 'suffix')}
        {line('  ‹your final reminders›', highlight === 'suffix')}
        {line('  ‹global final reminders from the Simulation screen›', false)}
      </div>
      <p style={{ marginBottom: 0, marginTop: 10 }}>
        {highlight === 'prefix'
          ? 'Opening notes are read first, so they colour how the customer reads everything after them — good for attitude, mood, and emphasis.'
          : 'Final reminders land last, right before the customer speaks, so they are the hardest to forget — good for absolute rules ("never…", "always…").'}{' '}
        The global notes from the <strong>Simulation</strong> screen wrap outside yours and apply to
        every scenario.
      </p>
    </>
  );
}

// ─────────────────────────────────────────────────────────────
// Step 2 · Knowledge & focus — what research the AI is allowed to draw on
// ─────────────────────────────────────────────────────────────

function KnowledgeSection({
  draft,
  patch,
}: {
  draft: Partial<ScenarioOverrideRow>;
  patch: (p: Partial<ScenarioOverrideRow>) => void;
}) {
  const docs = useKnowledgeDocuments();
  const selected = draft.knowledge_slugs ?? [];
  const focus = draft.focus_area ?? null;
  const focusMeta = FOCUS_AREAS.find((f) => f.key === focus) ?? null;
  /*
    Slugs with no live document behind them. Retrieval silently skips these, so
    without the chip the scenario looks correctly wired while pulling nothing.
    Only computed once the list has actually loaded — mid-fetch every slug
    would look missing.
  */
  const missing =
    docs.loading || docs.error
      ? []
      : missingKnowledgeSlugs(selected, docs.data.map((d) => d.slug));
  const resolved = selected.length - missing.length;

  function toggleDoc(slug: string) {
    const next = selected.includes(slug)
      ? selected.filter((s) => s !== slug)
      : [...selected, slug];
    patch({ knowledge_slugs: next.length ? next : null });
  }

  return (
    <Section
      label="Knowledge & focus"
      defaultOpen
      help="Controls which supporting research the AI can pull in for this scenario."
      tip={{
        title: 'How scenario knowledge is used',
        body: (
          <>
            <p style={{ marginTop: 0 }}>
              Once per session the app searches the knowledge base for the few passages most
              relevant to this scenario and hands them to the AI: the customer uses them as grounding
              (it embodies the findings, it never quotes them), and the scorecard uses them as
              evidence when it explains what the trainee should have said. Nothing here is shown to
              the trainee directly.
            </p>
            <p style={{ marginBottom: 0 }}>
              <strong>Focus area</strong> narrows that search to one clinical topic.{' '}
              <strong>Attached documents</strong> are stricter still — when any are attached the
              search only looks inside them and the focus area is ignored. Leave both empty and the
              whole knowledge base is searched.
            </p>
          </>
        ),
      }}
    >
      <Field
        label="Focus area"
        help="Restricts the supporting research the AI draws on to one topic — e.g. a GI scenario stops pulling obesity studies. Leave off to search all knowledge."
      >
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <PillToggle label="None" on={focus == null} onClick={() => patch({ focus_area: null })} />
          {FOCUS_AREAS.map((f) => (
            <PillToggle
              key={f.key}
              label={f.label}
              title={f.description}
              on={focus === f.key}
              onClick={() => patch({ focus_area: focus === f.key ? null : f.key })}
            />
          ))}
        </div>
        {focusMeta && (
          <div style={{ fontSize: 11.5, color: COLOR.inkMute, marginTop: 8 }}>
            {focusMeta.description}
          </div>
        )}
      </Field>

      <Field
        label={`Attached documents${
          selected.length
            ? ` (${resolved}${missing.length ? ` + ${missing.length} missing` : ''})`
            : ''
        }`}
        help="Pin the exact documents this scenario reads from. When any are attached, the focus-area filter is ignored."
      >
        {missing.length > 0 && (
          <div style={{ display: 'grid', gap: 6, marginBottom: 10 }}>
            <InlineAlert tone="warn" title="Attached to documents that no longer exist">
              These were deleted from the knowledge library. The scenario retrieves
              nothing from them — remove them, or restore the document from
              Knowledge → Recently deleted.
            </InlineAlert>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {missing.map((slug) => (
                <span
                  key={slug}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '5px 8px 5px 12px',
                    borderRadius: 9999,
                    background: COLOR.warnSoft,
                    color: COLOR.ink,
                    fontSize: 11.5,
                    fontWeight: 700,
                    fontFamily: 'var(--pbt-mono)',
                  }}
                >
                  missing document: {slug}
                  <button
                    aria-label={`Remove missing attachment ${slug}`}
                    onClick={() => {
                      const next = selected.filter((s) => s !== slug);
                      patch({ knowledge_slugs: next.length ? next : null });
                    }}
                    style={{
                      border: 'none',
                      background: 'transparent',
                      cursor: 'pointer',
                      color: COLOR.inkMute,
                      fontSize: 14,
                      lineHeight: 1,
                      padding: '0 2px',
                    }}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          </div>
        )}
        {docs.loading ? (
          <LoadingShimmer height={80} />
        ) : docs.error ? (
          <div style={{ fontSize: 12, color: COLOR.danger }}>
            Couldn't load knowledge documents: {docs.error}
          </div>
        ) : docs.data.length === 0 ? (
          <div style={{ fontSize: 12, color: COLOR.inkMute }}>
            No knowledge documents yet — add them in Library → Knowledge.
          </div>
        ) : (
          <div
            style={{
              maxHeight: 260,
              overflowY: 'auto',
              display: 'grid',
              gap: 6,
              border: `1px solid ${COLOR.border}`,
              borderRadius: 12,
              padding: 8,
              background: 'rgba(255,255,255,0.5)',
            }}
          >
            {docs.data.map((d) => {
              const hint = [d.category, focusHintOf(d.metadata)].filter(Boolean).join(' · ');
              return (
                <label
                  key={d.slug}
                  style={{
                    display: 'flex',
                    gap: 10,
                    alignItems: 'flex-start',
                    padding: '6px 8px',
                    borderRadius: 8,
                    cursor: 'pointer',
                    background: selected.includes(d.slug) ? COLOR.brandSoft : 'transparent',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={selected.includes(d.slug)}
                    onChange={() => toggleDoc(d.slug)}
                    style={{ marginTop: 3 }}
                  />
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: 'block', fontSize: 13, color: COLOR.ink }}>
                      {d.title}
                    </span>
                    {hint && (
                      <span
                        style={{
                          display: 'block',
                          fontFamily: 'var(--pbt-mono)',
                          fontSize: 10.5,
                          color: COLOR.inkMute,
                          marginTop: 1,
                        }}
                      >
                        {hint}
                      </span>
                    )}
                  </span>
                </label>
              );
            })}
          </div>
        )}
        {selected.length > 0 && (
          <button
            onClick={() => patch({ knowledge_slugs: null })}
            style={{ ...btnSecondary, marginTop: 8 }}
          >
            Clear attachments
          </button>
        )}
      </Field>
    </Section>
  );
}

/** Best-effort focus tag off a knowledge document's metadata blob. */
function focusHintOf(metadata: Record<string, unknown> | null): string | null {
  const focus = resolveDocFocus(metadata);
  if (!focus) return null;
  return FOCUS_AREAS.find((f) => f.key === focus)?.label ?? focus;
}

function PillToggle({
  label,
  title,
  on,
  onClick,
}: {
  label: string;
  title?: string;
  on: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      aria-pressed={on}
      style={{
        padding: '6px 12px',
        borderRadius: 9999,
        border: 'none',
        cursor: 'pointer',
        background: on ? COLOR.brand : 'rgba(60,20,15,0.06)',
        color: on ? '#fff' : COLOR.ink,
        fontSize: 12,
        fontWeight: 700,
        fontFamily: 'var(--pbt-font)',
      }}
    >
      {label}
    </button>
  );
}

interface Tip {
  title: string;
  body: React.ReactNode;
}

function Section({
  label,
  help,
  tip,
  defaultOpen = false,
  children,
}: {
  label: string;
  help?: string;
  tip?: Tip;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Collapsible title={label} defaultOpen={defaultOpen}>
      {(help || tip) && (
        <div
          style={{
            fontSize: 12,
            color: COLOR.inkMute,
            marginBottom: 10,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          {help && <span>{help}</span>}
          {/* InfoTip lives in the body, not the header — Collapsible's header
              is itself a <button> and must not nest one. */}
          {tip && <InfoTip title={tip.title}>{tip.body}</InfoTip>}
        </div>
      )}
      <div style={{ display: 'grid', gap: 14 }}>{children}</div>
    </Collapsible>
  );
}

/**
 * `Field` with an InfoTip beside the label. `Field`'s label is typed `string`,
 * so the label row is re-created here rather than forked in FlagsScreen.
 */
function TipField({
  label,
  help,
  tip,
  children,
}: {
  label: string;
  help?: string;
  tip: Tip;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          marginBottom: 6,
        }}
      >
        <span
          style={{
            fontSize: 10,
            fontWeight: 800,
            textTransform: 'uppercase',
            letterSpacing: '0.10em',
            color: COLOR.inkMute,
            fontFamily: 'var(--pbt-mono)',
          }}
        >
          {label}
        </span>
        <InfoTip title={tip.title}>{tip.body}</InfoTip>
      </div>
      {children}
      {help && (
        <div style={{ fontSize: 11, color: COLOR.inkMute, marginTop: 4 }}>{help}</div>
      )}
    </div>
  );
}

function SelectInput({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
}) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} style={inputStyle}>
      <option value="">—</option>
      {options.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  );
}

function DriverSelect({
  value,
  onChange,
  allowEmpty,
}: {
  value: DriverKey | null;
  onChange: (v: DriverKey | null) => void;
  allowEmpty: boolean;
}) {
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      {DRIVER_KEYS.map((d) => {
        const on = value === d;
        return (
          <button
            key={d}
            onClick={() => onChange(on && allowEmpty ? null : d)}
            style={{
              padding: '6px 10px',
              borderRadius: 9999,
              border: 'none',
              cursor: 'pointer',
              background: on ? DRIVERS[d].color : 'rgba(60,20,15,0.06)',
              color: on ? '#fff' : COLOR.ink,
              fontSize: 12,
              fontWeight: 700,
            }}
          >
            {d}
          </button>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// AI Wizard — linear steps with Gemini-powered hints
// ─────────────────────────────────────────────────────────────

interface WizardStep {
  field: WizardField;
  label: string;
  description: string;
}

const WIZARD_STEPS: WizardStep[] = [
  { field: 'breed', label: 'Breed', description: 'What dog are we training around?' },
  { field: 'life_stage', label: 'Life stage', description: 'How old is the dog?' },
  { field: 'pushback_id', label: 'Pushback type', description: 'Which canned pushback fits, if any?' },
  { field: 'pushback_notes', label: 'Pushback specifics', description: 'What\'s the owner saying, in their own voice?' },
  { field: 'suggested_driver', label: 'Customer driver', description: 'Which ECHO driver does this owner present as?' },
  { field: 'persona_override', label: 'Persona', description: 'What\'s their archetype?' },
  { field: 'difficulty_override', label: 'Difficulty', description: 'How hard is this scenario (1–4)?' },
  { field: 'opening_line_override', label: 'Opening line', description: 'Their first line to the trainee.' },
  { field: 'context_override', label: 'Context', description: 'What\'s the backstory the trainee should hold in mind?' },
  { field: 'card_title_override', label: 'Card title', description: 'How should this scenario be titled in the library?' },
  { field: 'card_subtitle_override', label: 'Card subtitle', description: 'One-liner under the title.' },
  { field: 'info_modal_body', label: 'Info modal body', description: 'What guidance should the per-scenario info modal show?' },
];

/**
 * Wizard fields that are enums, not prose.
 *
 * The wizard used to render every field as a free-text box, so an AI
 * suggestion of "Cost concerns" happily landed in `pushback_id` — where the
 * server now rejects it, and where before it silently broke the customer
 * prompt. Same pickers as the visual editor, same validators as the server.
 */
const WIZARD_ENUMS: Partial<
  Record<WizardField, { options: string[]; isValid: (v: string) => boolean }>
> = {
  pushback_id: { options: PUSHBACK_IDS, isValid: (v) => isPushbackId(v) },
  life_stage: { options: LIFE_STAGES, isValid: (v) => isLifeStage(v) },
  persona_override: { options: PERSONAS, isValid: (v) => isPersona(v) },
  suggested_driver: {
    options: [...DRIVER_KEYS],
    isValid: (v) => (DRIVER_KEYS as readonly string[]).includes(v),
  },
};

/**
 * Pull a valid enum value out of a free-form AI suggestion.
 *
 * Exact match first, then a case-insensitive one, then "the option this
 * sentence names" — an answer like "Analyzer — wants the evidence" is a good
 * suggestion wearing prose. Anything else is refused rather than written.
 */
export function matchEnumSuggestion(text: string, options: readonly string[]): string | null {
  const raw = text.trim();
  if (!raw) return null;
  const exact = options.find((o) => o === raw);
  if (exact) return exact;
  const lower = raw.toLowerCase();
  const ci = options.find((o) => o.toLowerCase() === lower);
  if (ci) return ci;
  // Whole-word only: a plain substring test maps "the customer is anxious" onto
  // the `custom` pushback, which is exactly the silent mis-write this guards.
  const named = options.filter((o) => {
    const esc = o.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(?:^|[^a-z0-9])${esc}(?:[^a-z0-9]|$)`).test(lower);
  });
  return named.length === 1 ? named[0] : null;
}

function ScenarioWizard({
  draft,
  patch,
}: {
  draft: Partial<ScenarioOverrideRow>;
  patch: (p: Partial<ScenarioOverrideRow>) => void;
}) {
  const [stepIdx, setStepIdx] = useState(0);
  const [suggestions, setSuggestions] = useState<string[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  /** Suggestion text the enum picker refused to accept, shown as a hint. */
  const [rejected, setRejected] = useState<string | null>(null);

  const step = WIZARD_STEPS[stepIdx];
  const fieldKey = step.field as keyof ScenarioOverrideRow;
  const enumSpec = WIZARD_ENUMS[step.field];
  const currentValue =
    draft[fieldKey] === undefined || draft[fieldKey] === null
      ? ''
      : String(draft[fieldKey]);

  async function fetchSuggestions() {
    setLoading(true);
    setAiError(null);
    setSuggestions(null);
    try {
      const out = await suggestField(step.field, draft);
      setSuggestions(out);
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'AI suggestion failed');
    } finally {
      setLoading(false);
    }
  }

  function applySuggestion(text: string) {
    setRejected(null);
    if (step.field === 'difficulty_override') {
      const n = Number(text.match(/\d/)?.[0] ?? '');
      if (n >= 1 && n <= 4) patch({ difficulty_override: n });
      else setRejected(text);
      return;
    }
    if (enumSpec) {
      const match = matchEnumSuggestion(text, enumSpec.options);
      // Second gate on the server's own validator, so the picker and the
      // endpoint can never disagree about what this column accepts.
      if (match && enumSpec.isValid(match)) {
        patch({ [fieldKey]: match } as Partial<ScenarioOverrideRow>);
      } else {
        // Not a value this field can hold — keep it on screen as a hint
        // instead of writing something the server will reject.
        setRejected(text);
      }
      return;
    }
    patch({ [fieldKey]: text } as Partial<ScenarioOverrideRow>);
  }

  function setManually(v: string) {
    if (step.field === 'difficulty_override') {
      patch({ difficulty_override: v === '' ? null : Number(v) });
    } else {
      patch({ [fieldKey]: v || null } as Partial<ScenarioOverrideRow>);
    }
  }

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {WIZARD_STEPS.map((s, i) => {
          const active = i === stepIdx;
          const done = i < stepIdx;
          return (
            <button
              key={s.field}
              onClick={() => {
                setStepIdx(i);
                setSuggestions(null);
                setAiError(null);
                setRejected(null);
              }}
              style={{
                width: 26,
                height: 26,
                borderRadius: 9999,
                border: 'none',
                cursor: 'pointer',
                background: active
                  ? COLOR.brand
                  : done
                    ? COLOR.successSoft
                    : 'rgba(60,20,15,0.05)',
                color: active ? '#fff' : COLOR.ink,
                fontSize: 11,
                fontWeight: 800,
              }}
              title={s.label}
            >
              {i + 1}
            </button>
          );
        })}
      </div>
      <div>
        <Eyebrow>{`Step ${stepIdx + 1} of ${WIZARD_STEPS.length}`}</Eyebrow>
        <div
          style={{
            fontSize: 18,
            fontWeight: 700,
            color: COLOR.ink,
            letterSpacing: '-0.02em',
            marginTop: 4,
          }}
        >
          {step.label}
        </div>
        <div style={{ fontSize: 13, color: COLOR.inkMute, marginTop: 2 }}>
          {step.description}
        </div>
      </div>
      <Field
        label="Current value"
        help={
          enumSpec
            ? 'This field only accepts one of these values — the app looks it up, so free text would break the roleplay.'
            : undefined
        }
      >
        {step.field === 'suggested_driver' ? (
          <DriverSelect
            value={(draft.suggested_driver as DriverKey | null) ?? null}
            onChange={(v) => patch({ suggested_driver: v })}
            allowEmpty
          />
        ) : enumSpec ? (
          <SelectInput
            value={currentValue}
            onChange={(v) => setManually(v)}
            options={enumSpec.options}
          />
        ) : (
          <textarea
            rows={3}
            value={currentValue}
            onChange={(e) => setManually(e.target.value)}
            style={textareaStyle}
          />
        )}
      </Field>
      {rejected && (
        <InlineAlert tone="warn" title="That suggestion isn’t a value this field accepts">
          Kept as a note rather than written: “{rejected}”. Pick the closest option
          above — or use it as wording for the pushback notes.
        </InlineAlert>
      )}
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={fetchSuggestions} disabled={loading} style={btnPrimary}>
          {loading ? 'Asking AI…' : 'Suggest 3 options'}
        </button>
        {stepIdx > 0 && (
          <button onClick={() => setStepIdx((i) => i - 1)} style={btnSecondary}>
            ← Previous
          </button>
        )}
        {stepIdx < WIZARD_STEPS.length - 1 && (
          <button onClick={() => setStepIdx((i) => i + 1)} style={btnSecondary}>
            Next →
          </button>
        )}
      </div>
      {aiError && (
        <div style={{ color: COLOR.danger, fontSize: 12 }}>{aiError}</div>
      )}
      {suggestions && (
        <div style={{ display: 'grid', gap: 8 }}>
          <Eyebrow>AI suggestions</Eyebrow>
          {suggestions.map((s, i) => (
            <button
              key={i}
              onClick={() => applySuggestion(s)}
              style={{
                textAlign: 'left',
                padding: '12px 14px',
                borderRadius: 12,
                border: '1px solid rgba(60,20,15,0.12)',
                background: 'rgba(255,255,255,0.7)',
                color: COLOR.ink,
                cursor: 'pointer',
                fontSize: 13,
                lineHeight: 1.5,
              }}
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Card preview — visually mirrors the consumer hero card
// ─────────────────────────────────────────────────────────────

function CardPreview({
  draft,
  baseDescriptor,
}: {
  draft: Partial<ScenarioOverrideRow>;
  baseDescriptor: BaseDescriptor | null;
}) {
  const title =
    draft.card_title_override?.trim() ||
    baseDescriptor?.title ||
    '(scenario)';
  const subtitle =
    draft.card_subtitle_override?.trim() ||
    (baseDescriptor
      ? `${baseDescriptor.breed}. Driver: ${baseDescriptor.driver}.`
      : `${draft.breed ?? '—'} · ${draft.suggested_driver ?? '—'}`);
  const buttonLabel = draft.start_button_label?.trim() || 'Start scenario';
  const driver: DriverKey =
    (draft.card_driver_override as DriverKey | null) ??
    (draft.suggested_driver as DriverKey | null) ??
    (baseDescriptor?.driver as DriverKey) ??
    'Activator';
  const dc = DRIVERS[driver];
  return (
    <div
      style={{
        position: 'relative',
        padding: 20,
        borderRadius: 22,
        background: `linear-gradient(180deg, color-mix(in oklab, ${dc.soft} 60%, white) 0%, white 100%)`,
        border: `1px solid color-mix(in oklab, ${dc.color} 22%, transparent)`,
        boxShadow: `0 12px 32px -16px color-mix(in oklab, ${dc.color} 35%, transparent)`,
        minHeight: 200,
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          position: 'absolute',
          right: -28,
          top: -28,
          width: 120,
          height: 120,
          borderRadius: '50%',
          background: `radial-gradient(closest-side, ${dc.color}, transparent 70%)`,
          opacity: 0.35,
        }}
      />
      <div
        style={{
          fontSize: 18,
          fontWeight: 600,
          color: COLOR.ink,
          letterSpacing: '-0.02em',
          marginBottom: 6,
          maxWidth: 240,
        }}
      >
        {title}
      </div>
      <div
        style={{
          fontSize: 12,
          color: COLOR.inkMute,
          marginBottom: 16,
          maxWidth: 280,
        }}
      >
        {subtitle}
      </div>
      <button
        style={{
          padding: '8px 16px',
          borderRadius: 9999,
          border: 'none',
          background: `linear-gradient(180deg, ${dc.color}, color-mix(in oklab, ${dc.color} 70%, black))`,
          color: '#fff',
          fontWeight: 700,
          fontSize: 12,
          cursor: 'default',
        }}
      >
        {buttonLabel} →
      </button>
      {draft.info_modal_body && (
        <div
          style={{
            marginTop: 12,
            fontSize: 11,
            color: COLOR.inkMute,
            fontStyle: 'italic',
          }}
        >
          ⓘ Info modal: {draft.info_modal_body.slice(0, 80)}
          {draft.info_modal_body.length > 80 ? '…' : ''}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Iframe test panel — runs the consumer ChatScreen with the unsaved draft
// ─────────────────────────────────────────────────────────────

/** What the consumer said about the last run request. */
type PreviewStatus =
  | { kind: 'idle' }
  | { kind: 'running'; mode: 'text' | 'voice' }
  | { kind: 'ok'; mode: 'text' | 'voice' }
  | { kind: 'failed'; reason: 'invalid' | 'unsupported' | 'unknown' };

const PREVIEW_FAILURE_COPY: Record<'invalid' | 'unsupported' | 'unknown', string> = {
  invalid:
    'This scenario can’t run yet — check the required fields on step 1 (breed, life stage, pushback and driver).',
  unsupported:
    'The preview can’t run this scenario. It has nothing to build a customer from — save it once, or open it from the list rather than by id.',
  unknown: 'The preview didn’t answer. Try “Restart test”.',
};

function TestIframe({
  scenarioId,
  draft,
}: {
  scenarioId: string;
  draft: Partial<ScenarioOverrideRow>;
}) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState<PreviewStatus>({ kind: 'idle' });
  /** Bumped to remount the iframe — a hard restart of the preview session. */
  const [reloadKey, setReloadKey] = useState(0);
  // The mode of the in-flight request, read by the status listener without
  // re-subscribing it on every state change.
  const pendingModeRef = useRef<'text' | 'voice'>('text');

  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.origin !== window.location.origin) return;
      const data = e.data as { type?: string; ok?: boolean; reason?: string };
      if (
        data?.type === 'pbt:preview-runner-ready' ||
        data?.type === 'pbt:preview-ready'
      ) {
        setReady(true);
        return;
      }
      if (data?.type !== 'pbt:preview-status') return;
      // Every run is answered exactly once — silence used to leave the panel
      // looking like it was still starting up, forever.
      if (data.ok) {
        setStatus({ kind: 'ok', mode: pendingModeRef.current });
      } else {
        const reason =
          data.reason === 'invalid' || data.reason === 'unsupported'
            ? data.reason
            : 'unknown';
        setStatus({ kind: 'failed', reason });
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  function start(mode: 'text' | 'voice') {
    const frame = iframeRef.current?.contentWindow;
    if (!frame) return;
    pendingModeRef.current = mode;
    setStatus({ kind: 'running', mode });
    const row = { ...draft, scenario_id: scenarioId } as ScenarioOverrideRow;
    // Push the UNSAVED draft into the preview's own override layer first, so
    // anything the runner resolves by id (and the AI prompt notes on it) match
    // what is on screen rather than what was last saved.
    frame.postMessage(
      { type: 'pbt:preview-flags', scenarioOverrides: [row] },
      window.location.origin,
    );
    frame.postMessage(
      {
        type: 'pbt:preview-run-scenario',
        scenarioId,
        draft: row,
        mode,
      },
      window.location.origin,
    );
  }

  function restart() {
    setReady(false);
    setStatus({ kind: 'idle' });
    setReloadKey((k) => k + 1);
  }

  return (
    <div>
      <div
        style={{
          padding: '10px 14px',
          background: 'rgba(255,255,255,0.55)',
          borderBottom: '0.5px solid rgba(60,20,15,0.08)',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          flexWrap: 'wrap',
        }}
      >
        <Eyebrow>Test in app</Eyebrow>
        <StatusPill
          tone={
            status.kind === 'failed'
              ? 'danger'
              : status.kind === 'ok'
                ? 'success'
                : ready
                  ? 'info'
                  : 'neutral'
          }
        >
          {status.kind === 'failed'
            ? 'can’t run'
            : status.kind === 'ok'
              ? `running · ${status.mode}`
              : status.kind === 'running'
                ? 'starting…'
                : ready
                  ? 'ready'
                  : 'loading…'}
        </StatusPill>
        <button
          onClick={() => start('text')}
          disabled={!ready}
          style={{ ...btnPrimary, marginLeft: 'auto' }}
        >
          Start chat
        </button>
        <button onClick={() => start('voice')} disabled={!ready} style={btnSecondary}>
          Start voice
        </button>
        <button onClick={restart} style={btnSecondary}>
          Restart test
        </button>
      </div>
      {status.kind === 'failed' && (
        <div style={{ padding: '10px 14px' }}>
          <InlineAlert tone="error">{PREVIEW_FAILURE_COPY[status.reason]}</InlineAlert>
        </div>
      )}
      <iframe
        key={reloadKey}
        ref={iframeRef}
        src="/?pbt_preview=1"
        title="Scenario test"
        style={{
          width: '100%',
          height: 'min(720px, 70vh)',
          border: 'none',
          display: 'block',
          background: '#fff',
        }}
      />
    </div>
  );
}
