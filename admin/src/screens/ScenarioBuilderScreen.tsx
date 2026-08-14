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
import {
  LIBRARY_MANIFEST,
  buildInitialDraft,
  stripServerManaged,
} from '../data/scenarioManifest';
import { FOCUS_AREAS } from '../../../src/shared/knowledge/focusAreas';
import {
  Field,
  btnPrimary,
  btnSecondary,
  inputStyle,
  textareaStyle,
} from './FlagsScreen';
import { suggestField, type WizardField } from '../lib/scenarioAi';

const PROMPT_MAX = 1500;
const PUSHBACK_IDS = [
  'cost',
  'breeder-advice',
  'raw-food',
  'rx-diet',
  'brand-switch',
  'weight-denial',
  'custom',
];
const LIFE_STAGES = ['Puppy (<1)', 'Junior (1-3)', 'Adult (3-7)', 'Senior (7+)'];
const PERSONAS = ['Skeptical', 'Anxious', 'Busy', 'Bargain-hunter', 'Devoted'];

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
  const [activeId, setActiveId] = useState<string | null>(null);

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
        hasOverride={Boolean(active?.override)}
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
        }}
        onSaved={() => {
          onSaved();
          setSeedDraft(null);
        }}
      />
    );
  }

  return (
    <>
      <ContextBar
        title="Scenario builder"
        subtitle="Edit overrides on library + user scenarios, or build new ones from scratch with the AI wizard."
        query={query}
        onQuery={onQuery}
      />
      <ScreenShell>
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
            <button onClick={startNew} style={btnPrimary}>
              + New scenario
            </button>
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
                  onOpen={() => setActiveId(it.id)}
                  onDuplicate={async () => {
                    if (!it.override) {
                      alert('Add an override first, then duplicate.');
                      return;
                    }
                    await duplicateScenario(it.id);
                    onSaved();
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
  onOpen,
  onDuplicate,
}: {
  entry: ListEntry;
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
        Edit
      </button>
      <button onClick={onDuplicate} style={btnSecondary}>
        Duplicate
      </button>
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
  hasOverride,
  baseDescriptor,
  onClose,
  onSaved,
}: {
  scenarioId: string;
  /** Fully hydrated draft (base values overlaid by any override row). */
  initial: Partial<ScenarioOverrideRow>;
  /** True when a scenario_overrides row already exists for this scenario. */
  hasOverride: boolean;
  baseDescriptor: BaseDescriptor | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [tab, setTab] = useState<Tab>('visual');
  const [draft, setDraft] = useState<Partial<ScenarioOverrideRow>>(initial);
  // Baseline = the hydrated draft, so an untouched form is never "dirty".
  // Builder is mounted with key={scenarioId}, so this is re-captured whenever
  // the admin switches scenarios.
  const baselineRef = useRef<string>(JSON.stringify(initial));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [testOpen, setTestOpen] = useState(false);

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

  function confirmDiscardIfDirty(): boolean {
    return !dirty || confirm('Discard unsaved changes?');
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
      // `stripServerManaged` drops updated_at / created_at / created_by /
      // updated_by / deleted_at — they ride along on the hydrated draft but
      // are the server's to set.
      const trimmed: Partial<ScenarioOverrideRow> = stripServerManaged(draft);
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
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  async function clearAndClose() {
    if (!hasOverride) {
      if (!confirmDiscardIfDirty()) return;
      onClose();
      return;
    }
    if (!confirm('Remove all overrides for this scenario?')) return;
    setSaving(true);
    try {
      await deleteScenarioOverride(scenarioId);
      onSaved();
      onClose();
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
        <div style={{ display: 'flex', gap: 10, marginBottom: 14, alignItems: 'center' }}>
          <button
            onClick={() => {
              if (confirmDiscardIfDirty()) onClose();
            }}
            style={btnSecondary}
          >
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
            <button onClick={clearAndClose} style={{ ...btnSecondary, color: COLOR.danger }}>
              {hasOverride ? 'Remove overrides' : 'Discard'}
            </button>
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
            <button onClick={save} disabled={saving} style={btnPrimary}>
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1.2fr) 380px',
            gap: 16,
            alignItems: 'start',
          }}
        >
          {/* Left: editor */}
          <Glass padding={20} radius={20}>
            {tab === 'visual' ? (
              <VisualEditor draft={draft} patch={patch} baseDescriptor={baseDescriptor} />
            ) : (
              <ScenarioWizard draft={draft} patch={patch} />
            )}
          </Glass>

          {/* Right: preview + test */}
          <div style={{ display: 'grid', gap: 12 }}>
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
        {error && (
          <div
            style={{
              marginTop: 16,
              padding: '10px 14px',
              borderRadius: 12,
              background: COLOR.dangerSoft,
              color: COLOR.danger,
              fontSize: 13,
            }}
          >
            {error}
          </div>
        )}
      </ScreenShell>
    </>
  );
}

// ─────────────────────────────────────────────────────────────
// Visual editor — every editable field
// ─────────────────────────────────────────────────────────────

function VisualEditor({
  draft,
  patch,
  baseDescriptor,
}: {
  draft: Partial<ScenarioOverrideRow>;
  patch: (p: Partial<ScenarioOverrideRow>) => void;
  baseDescriptor: BaseDescriptor | null;
}) {
  const isAdminScenario = (draft.scenario_id ?? '').startsWith('admin:');
  return (
    <div style={{ display: 'grid', gap: 18 }}>
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
                onChange={(e) => patch({ visible: e.target.checked })}
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

      <KnowledgeSection draft={draft} patch={patch} />

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
    </div>
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
// Knowledge & focus — what research the AI is allowed to draw on
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
        label={`Attached documents${selected.length ? ` (${selected.length})` : ''}`}
        help="Pin the exact documents this scenario reads from. When any are attached, the focus-area filter is ignored."
      >
        {docs.loading ? (
          <LoadingShimmer height={80} />
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
  const focus = metadata?.focus;
  if (typeof focus !== 'string') return null;
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

  const step = WIZARD_STEPS[stepIdx];
  const fieldKey = step.field as keyof ScenarioOverrideRow;
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
    if (step.field === 'difficulty_override') {
      const n = Number(text.match(/\d/)?.[0] ?? '');
      if (n >= 1 && n <= 4) patch({ difficulty_override: n });
    } else {
      patch({ [fieldKey]: text } as Partial<ScenarioOverrideRow>);
    }
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
      <Field label="Current value">
        <textarea
          rows={3}
          value={currentValue}
          onChange={(e) => setManually(e.target.value)}
          style={textareaStyle}
        />
      </Field>
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

function TestIframe({
  scenarioId,
  draft,
}: {
  scenarioId: string;
  draft: Partial<ScenarioOverrideRow>;
}) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.origin !== window.location.origin) return;
      const data = e.data as { type?: string };
      if (
        data?.type === 'pbt:preview-runner-ready' ||
        data?.type === 'pbt:preview-ready'
      ) {
        setReady(true);
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  function start(mode: 'chat' | 'voice') {
    if (!iframeRef.current?.contentWindow) return;
    iframeRef.current.contentWindow.postMessage(
      {
        type: 'pbt:preview-run-scenario',
        scenarioId,
        draft: { ...draft, scenario_id: scenarioId },
        mode,
      },
      window.location.origin,
    );
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
        }}
      >
        <Eyebrow>Test in app</Eyebrow>
        <StatusPill tone={ready ? 'success' : 'neutral'}>
          {ready ? 'iframe ready' : 'loading…'}
        </StatusPill>
        <button
          onClick={() => start('chat')}
          disabled={!ready}
          style={{ ...btnPrimary, marginLeft: 'auto' }}
        >
          Start chat
        </button>
        <button onClick={() => start('voice')} disabled={!ready} style={btnSecondary}>
          Start voice
        </button>
      </div>
      <iframe
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
