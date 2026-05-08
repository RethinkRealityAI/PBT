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
  EmptyState,
  Eyebrow,
  LoadingShimmer,
  SectionTitle,
  StatusPill,
} from '../primitives';
import { COLOR, DRIVER_KEYS, DRIVERS, type DriverKey } from '../lib/tokens';
import {
  deleteScenarioOverride,
  duplicateScenario,
  upsertScenarioOverride,
  useScenarioOverrides,
  useUserScenarios,
} from '../data/queries';
import type { ScenarioOverrideRow } from '../data/types';
import { LIBRARY_MANIFEST } from '../data/scenarioManifest';
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
    const initial =
      seedDraft && seedDraft.scenario_id === activeId
        ? (seedDraft as ScenarioOverrideRow)
        : (active?.override as ScenarioOverrideRow | null) ?? null;
    return (
      <Builder
        scenarioId={activeId ?? seedDraft?.scenario_id ?? ''}
        initial={initial}
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
  baseDescriptor,
  onClose,
  onSaved,
}: {
  scenarioId: string;
  initial: ScenarioOverrideRow | null;
  baseDescriptor: BaseDescriptor | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [tab, setTab] = useState<Tab>('visual');
  const [draft, setDraft] = useState<Partial<ScenarioOverrideRow>>(() =>
    initial ?? { scenario_id: scenarioId, visible: false },
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [testOpen, setTestOpen] = useState(false);

  // Keep draft.scenario_id stable.
  useEffect(() => {
    if (draft.scenario_id !== scenarioId) {
      setDraft((d) => ({ ...d, scenario_id: scenarioId }));
    }
  }, [scenarioId, draft.scenario_id]);

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
      const trimmed: Partial<ScenarioOverrideRow> = { ...draft };
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
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  async function clearAndClose() {
    if (!initial) {
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
        <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
          <button onClick={onClose} style={btnSecondary}>
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
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            <button onClick={() => setTestOpen((v) => !v)} style={btnSecondary}>
              {testOpen ? 'Hide test' : 'Test in app'}
            </button>
            <button onClick={clearAndClose} style={{ ...btnSecondary, color: COLOR.danger }}>
              {initial ? 'Remove overrides' : 'Discard'}
            </button>
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
      <Section label="Card display">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>
          <Field label="Visible">
            <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                type="checkbox"
                checked={draft.visible ?? false}
                onChange={(e) => patch({ visible: e.target.checked })}
              />
              {draft.visible ? 'Shown' : 'Hidden'}
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

      <Section label="Card text">
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

      <Section label="Per-scenario info modal">
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
            ? 'These define the scenario. All required for admin-authored scenarios.'
            : 'These overlay the base scenario from code. Empty = use base value.'
        }
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
          <Field label="Suggested driver">
            <DriverSelect
              value={draft.suggested_driver ?? null}
              onChange={(v) => patch({ suggested_driver: v })}
              allowEmpty={!isAdminScenario}
            />
          </Field>
          <Field label="Persona">
            <SelectInput
              value={draft.persona_override ?? ''}
              onChange={(v) => patch({ persona_override: v || null })}
              options={PERSONAS}
            />
          </Field>
          <Field label="Difficulty (1–4)">
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
          </Field>
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

      <Section
        label="AI prompt overrides"
        help="Wraps the canonical customer prompt. The 7-dim scoring rubric is preserved regardless."
      >
        <Field label={`Prompt prefix (${(draft.prompt_prefix ?? '').length}/${PROMPT_MAX})`}>
          <textarea
            maxLength={PROMPT_MAX}
            rows={4}
            value={draft.prompt_prefix ?? ''}
            onChange={(e) => patch({ prompt_prefix: e.target.value })}
            style={textareaStyle}
          />
        </Field>
        <Field label={`Prompt suffix (${(draft.prompt_suffix ?? '').length}/${PROMPT_MAX})`}>
          <textarea
            maxLength={PROMPT_MAX}
            rows={4}
            value={draft.prompt_suffix ?? ''}
            onChange={(e) => patch({ prompt_suffix: e.target.value })}
            style={textareaStyle}
          />
        </Field>
      </Section>
    </div>
  );
}

function Section({
  label,
  help,
  children,
}: {
  label: string;
  help?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div
        style={{
          fontSize: 11,
          fontWeight: 800,
          letterSpacing: '0.10em',
          textTransform: 'uppercase',
          color: COLOR.ink,
          fontFamily: 'var(--pbt-mono)',
          marginBottom: 6,
        }}
      >
        {label}
      </div>
      {help && (
        <div style={{ fontSize: 12, color: COLOR.inkMute, marginBottom: 10 }}>
          {help}
        </div>
      )}
      <div style={{ display: 'grid', gap: 14 }}>{children}</div>
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
          height: 720,
          border: 'none',
          display: 'block',
          background: '#fff',
        }}
      />
    </div>
  );
}
