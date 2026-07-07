/**
 * SimulationScreen — admin editor for the global SimulationConfig.
 *
 * Sub-tabs: Scoring | Drivers | Pushbacks | Global prompt.
 *
 * UX notes:
 * - Scoring dimensions are collapsible accordions whose headers show the
 *   live normalised weight + a bar, so the whole rubric reads at a glance.
 * - A sticky action bar keeps Save / Reset reachable on long tabs and shows
 *   an unsaved-changes indicator.
 * - Saving writes a MINIMAL config (only what differs from the code defaults),
 *   so untouched drivers/pushbacks keep inheriting future code improvements
 *   instead of being frozen to a snapshot.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  defaultSimulationConfig,
  type ScoringDimensionConfig,
  type SimulationConfig,
} from '../../../src/data/knowledge/simulationConfig';
import type { DimensionKey } from '../../../src/data/knowledge/scoringRubric';
import type { DriverKnowledge } from '../../../src/data/knowledge/driverProfiles';
import type { PushbackKnowledge } from '../../../src/data/knowledge/pushbackTaxonomy';
import type { DriverKey } from '../../../src/design-system/tokens';
import { DRIVER_KEYS } from '../../../src/design-system/tokens';
import { useAdminSimulationConfig, saveSimulationConfig } from '../data/queries';
import { Glass } from '../primitives/Glass';
import { Collapsible, LoadingShimmer, PillButton, SectionTitle } from '../primitives';
import { ContextBar, ScreenShell } from '../primitives/Shell';
import { COLOR } from '../lib/tokens';
import { Field, inputStyle, textareaStyle, btnPrimary, btnSecondary } from './FlagsScreen';

// ─── Draft state (everything fully populated so the UI never guards undefined) ─

interface DraftDimension {
  key: DimensionKey;
  label: string;
  description: string;
  weight: number;
  excellentExample: string;
  needsWorkExample: string;
}
interface DraftDriver {
  motivation: string;
  stressSignature: string;
  communicationStyle: string; // newline-separated
  strengths: string;
  recognitionCues: string;
  flexingTips: string;
  customerSamplePhrasings: string;
}
interface DraftPushback {
  id: string;
  title: string;
  examples: string;
  rootConcerns: string;
  acknowledgePatterns: string;
  clarifyQuestions: string;
  takeActionPatterns: string;
  watchOuts: string;
}
interface Draft {
  dims: DraftDimension[];
  scoringPrefix: string;
  scoringSuffix: string;
  drivers: Record<DriverKey, DraftDriver>;
  pushbacks: Record<string, DraftPushback>;
  customerPrefix: string;
  customerSuffix: string;
}

// ─── Text<->array helpers ──────────────────────────────────────────────────────

const arrToText = (arr: string[] | undefined) => (arr ?? []).join('\n');
const textToArr = (text: string) =>
  text.split('\n').map((s) => s.trim()).filter(Boolean);
const arrEq = (a: string[], b: string[]) =>
  a.length === b.length && a.every((v, i) => v === b[i]);

// ─── Build the full draft from saved config merged over code defaults ──────────

function buildDraft(saved: Record<string, unknown>): Draft {
  const def = defaultSimulationConfig();

  const savedScoring = (saved.scoring ?? {}) as Record<string, unknown>;
  const savedDims = Array.isArray(savedScoring.dimensions)
    ? (savedScoring.dimensions as ScoringDimensionConfig[])
    : [];
  const dimMap = new Map(savedDims.map((d) => [d.key, d]));
  const dims: DraftDimension[] = def.scoring.dimensions.map((d) => {
    const o = dimMap.get(d.key);
    return {
      key: d.key,
      label: o?.label ?? d.label,
      description: o?.description ?? d.description,
      weight: typeof o?.weight === 'number' ? o.weight : d.weight,
      excellentExample: o?.excellentExample ?? d.excellentExample,
      needsWorkExample: o?.needsWorkExample ?? d.needsWorkExample,
    };
  });

  const savedDrivers = (saved.drivers ?? {}) as Partial<
    Record<DriverKey, Partial<DriverKnowledge>>
  >;
  const drivers = Object.fromEntries(
    DRIVER_KEYS.map((k) => {
      const base = def.drivers[k];
      const o = savedDrivers[k] ?? {};
      const arr = (ov: string[] | undefined, fb: string[]) =>
        Array.isArray(ov) && ov.length > 0 ? ov : fb;
      return [
        k,
        {
          motivation: o.motivation?.trim() ? o.motivation : base.motivation,
          stressSignature: o.stressSignature?.trim() ? o.stressSignature : base.stressSignature,
          communicationStyle: arrToText(arr(o.communicationStyle, base.communicationStyle)),
          strengths: arrToText(arr(o.strengths, base.strengths)),
          recognitionCues: arrToText(arr(o.recognitionCues, base.recognitionCues)),
          flexingTips: arrToText(arr(o.flexingTips, base.flexingTips)),
          customerSamplePhrasings: arrToText(
            arr(o.customerSamplePhrasings, base.customerSamplePhrasings),
          ),
        } satisfies DraftDriver,
      ];
    }),
  ) as Record<DriverKey, DraftDriver>;

  const savedPushbacks = (saved.pushbacks ?? {}) as Record<string, Partial<PushbackKnowledge>>;
  const pushbackIds = new Set([
    ...Object.keys(def.pushbacks),
    ...Object.keys(savedPushbacks),
  ]);
  const pushbacks: Record<string, DraftPushback> = {};
  for (const id of pushbackIds) {
    const base = def.pushbacks[id] as PushbackKnowledge | undefined;
    const o = savedPushbacks[id] ?? {};
    const arr = (ov: string[] | undefined, fb: string[] | undefined) =>
      Array.isArray(ov) && ov.length > 0 ? ov : fb ?? [];
    pushbacks[id] = {
      id,
      title: o.title?.trim() ? o.title : base?.title ?? id,
      examples: arrToText(arr(o.examples, base?.examples)),
      rootConcerns: arrToText(arr(o.rootConcerns, base?.rootConcerns)),
      acknowledgePatterns: arrToText(arr(o.acknowledgePatterns, base?.acknowledgePatterns)),
      clarifyQuestions: arrToText(arr(o.clarifyQuestions, base?.clarifyQuestions)),
      takeActionPatterns: arrToText(arr(o.takeActionPatterns, base?.takeActionPatterns)),
      watchOuts: arrToText(arr(o.watchOuts, base?.watchOuts)),
    };
  }

  return {
    dims,
    scoringPrefix: typeof savedScoring.promptPrefix === 'string' ? savedScoring.promptPrefix : '',
    scoringSuffix: typeof savedScoring.promptSuffix === 'string' ? savedScoring.promptSuffix : '',
    drivers,
    pushbacks,
    customerPrefix: typeof saved.customerPromptPrefix === 'string' ? saved.customerPromptPrefix : '',
    customerSuffix: typeof saved.customerPromptSuffix === 'string' ? saved.customerPromptSuffix : '',
  };
}

/** Ids that exist as code defaults — these can be reset but not deleted. */
const DEFAULT_PUSHBACK_IDS = new Set(
  Object.keys(defaultSimulationConfig().pushbacks),
);

function defaultPushbackDraft(id: string): DraftPushback {
  const p = defaultSimulationConfig().pushbacks[id] as PushbackKnowledge | undefined;
  if (!p) return emptyDraftPushback(id);
  return {
    id,
    title: p.title,
    examples: arrToText(p.examples),
    rootConcerns: arrToText(p.rootConcerns),
    acknowledgePatterns: arrToText(p.acknowledgePatterns),
    clarifyQuestions: arrToText(p.clarifyQuestions),
    takeActionPatterns: arrToText(p.takeActionPatterns),
    watchOuts: arrToText(p.watchOuts),
  };
}

function emptyDraftPushback(id: string): DraftPushback {
  return {
    id,
    title: '',
    examples: '',
    rootConcerns: '',
    acknowledgePatterns: '',
    clarifyQuestions: '',
    takeActionPatterns: '',
    watchOuts: '',
  };
}

// ─── Diff the draft down to a MINIMAL config (only what differs from defaults) ──

function buildMinimalConfig(draft: Draft): SimulationConfig {
  const def = defaultSimulationConfig();
  const out: SimulationConfig = {};

  // Scoring dimensions — per-field diff.
  const dimDefs = new Map(def.scoring.dimensions.map((d) => [d.key, d]));
  const dimOverrides: ScoringDimensionConfig[] = [];
  for (const d of draft.dims) {
    const base = dimDefs.get(d.key);
    if (!base) continue;
    const o: ScoringDimensionConfig = { key: d.key };
    let changed = false;
    if (d.label.trim() && d.label !== base.label) { o.label = d.label; changed = true; }
    if (d.description.trim() && d.description !== base.description) { o.description = d.description; changed = true; }
    if (d.weight !== base.weight) { o.weight = d.weight; changed = true; }
    if (d.excellentExample !== base.excellentExample) { o.excellentExample = d.excellentExample; changed = true; }
    if (d.needsWorkExample !== base.needsWorkExample) { o.needsWorkExample = d.needsWorkExample; changed = true; }
    if (changed) dimOverrides.push(o);
  }
  const scoring: NonNullable<SimulationConfig['scoring']> = {};
  if (dimOverrides.length) scoring.dimensions = dimOverrides;
  if (draft.scoringPrefix.trim()) scoring.promptPrefix = draft.scoringPrefix;
  if (draft.scoringSuffix.trim()) scoring.promptSuffix = draft.scoringSuffix;
  if (Object.keys(scoring).length) out.scoring = scoring;

  // Drivers — per-field diff.
  const driverOut: NonNullable<SimulationConfig['drivers']> = {};
  for (const k of DRIVER_KEYS) {
    const base = def.drivers[k];
    const d = draft.drivers[k];
    const patch: Partial<DriverKnowledge> = {};
    let changed = false;
    if (d.motivation.trim() && d.motivation !== base.motivation) { patch.motivation = d.motivation; changed = true; }
    if (d.stressSignature.trim() && d.stressSignature !== base.stressSignature) { patch.stressSignature = d.stressSignature; changed = true; }
    const arrField = (
      field: keyof DraftDriver & keyof DriverKnowledge,
      text: string,
    ) => {
      const next = textToArr(text);
      if (!arrEq(next, base[field] as string[])) {
        (patch[field] as string[]) = next;
        changed = true;
      }
    };
    arrField('communicationStyle', d.communicationStyle);
    arrField('strengths', d.strengths);
    arrField('recognitionCues', d.recognitionCues);
    arrField('flexingTips', d.flexingTips);
    arrField('customerSamplePhrasings', d.customerSamplePhrasings);
    if (changed) driverOut[k] = patch;
  }
  if (Object.keys(driverOut).length) out.drivers = driverOut;

  // Pushbacks — new ids included whole; existing ids per-field diff.
  const pushOut: Record<string, Partial<PushbackKnowledge>> = {};
  for (const [id, d] of Object.entries(draft.pushbacks)) {
    const base = def.pushbacks[id] as PushbackKnowledge | undefined;
    const isNew = !base;
    const patch: Partial<PushbackKnowledge> = { id };
    let changed = isNew;
    if (d.title.trim() && d.title !== base?.title) { patch.title = d.title; changed = true; }
    const pf = (
      field: keyof DraftPushback & keyof PushbackKnowledge,
      text: string,
    ) => {
      const next = textToArr(text);
      if (!arrEq(next, (base?.[field] as string[]) ?? [])) {
        (patch[field] as string[]) = next;
        changed = true;
      }
    };
    pf('examples', d.examples);
    pf('rootConcerns', d.rootConcerns);
    pf('acknowledgePatterns', d.acknowledgePatterns);
    pf('clarifyQuestions', d.clarifyQuestions);
    pf('takeActionPatterns', d.takeActionPatterns);
    pf('watchOuts', d.watchOuts);
    if (changed) pushOut[id] = patch;
  }
  if (Object.keys(pushOut).length) out.pushbacks = pushOut;

  if (draft.customerPrefix.trim()) out.customerPromptPrefix = draft.customerPrefix;
  if (draft.customerSuffix.trim()) out.customerPromptSuffix = draft.customerSuffix;

  return out;
}

// ─── Weight bar ─────────────────────────────────────────────────────────────────

function WeightBar({ pct }: { pct: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div
        style={{
          width: 90,
          height: 6,
          borderRadius: 999,
          background: 'rgba(60,20,15,0.08)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: `${Math.max(0, Math.min(100, pct))}%`,
            height: '100%',
            background: `linear-gradient(90deg, ${COLOR.brand}, oklch(0.66 0.22 22))`,
          }}
        />
      </div>
      <span
        style={{
          fontFamily: 'var(--pbt-mono)',
          fontSize: 12,
          fontWeight: 700,
          color: COLOR.inkSoft,
          minWidth: 44,
          textAlign: 'right',
        }}
      >
        {pct.toFixed(1)}%
      </span>
    </div>
  );
}

const TWO_COL: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
  gap: 12,
};
const proseArea: React.CSSProperties = { ...textareaStyle, fontFamily: 'var(--pbt-font)' };

// ─── Main screen ───────────────────────────────────────────────────────────────

type Tab = 'scoring' | 'drivers' | 'pushbacks' | 'global';
const TAB_LABELS: Record<Tab, string> = {
  scoring: 'Scoring',
  drivers: 'Drivers',
  pushbacks: 'Pushbacks',
  global: 'Global prompt',
};

export function SimulationScreen() {
  const [refreshKey, setRefreshKey] = useState(0);
  const snapshot = useAdminSimulationConfig(refreshKey);
  const [tab, setTab] = useState<Tab>('scoring');
  const [draft, setDraft] = useState<Draft | null>(null);
  const baselineRef = useRef<string>('');

  const [selectedDriver, setSelectedDriver] = useState<DriverKey>('Activator');
  const [selectedPushback, setSelectedPushback] = useState<string | null>(null);
  const [addingNew, setAddingNew] = useState(false);
  const [newPushbackId, setNewPushbackId] = useState('');

  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saved' | 'error'>('idle');
  const [saveError, setSaveError] = useState<string | null>(null);

  // Initialise the draft from the loaded config exactly once it arrives.
  useEffect(() => {
    if (snapshot.loading || draft) return;
    const d = buildDraft(snapshot.data);
    setDraft(d);
    baselineRef.current = JSON.stringify(d);
    if (Object.keys(d.pushbacks).length) {
      setSelectedPushback((prev) => prev ?? Object.keys(d.pushbacks)[0]);
    }
  }, [snapshot.loading, snapshot.data, draft]);

  const dirty = useMemo(
    () => (draft ? JSON.stringify(draft) !== baselineRef.current : false),
    [draft],
  );

  function patch(p: Partial<Draft>) {
    setDraft((prev) => (prev ? { ...prev, ...p } : prev));
  }

  function resetAll() {
    const d = buildDraft({});
    setDraft(d);
  }

  async function handleSave() {
    if (!draft) return;
    setSaving(true);
    setSaveStatus('idle');
    setSaveError(null);
    try {
      const minimal = buildMinimalConfig(draft);
      await saveSimulationConfig(minimal as unknown as Record<string, unknown>);
      baselineRef.current = JSON.stringify(draft);
      setSaveStatus('saved');
      setRefreshKey((k) => k + 1);
      setTimeout(() => setSaveStatus('idle'), 3000);
    } catch (err) {
      setSaveStatus('error');
      setSaveError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  const totalWeight = draft
    ? draft.dims.reduce((s, d) => s + (d.weight > 0 ? d.weight : 0), 0)
    : 0;

  return (
    <>
      <ContextBar
        title="Simulation config"
        subtitle="Tune AI customer personas, the scoring rubric, and prompt injections — no deploy needed. Changes go live within a minute."
      />
      <ScreenShell>
        {snapshot.loading || !draft ? (
          <LoadingShimmer height={360} />
        ) : (
          <>
            {/* Tabs */}
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {(Object.keys(TAB_LABELS) as Tab[]).map((t) => (
                <PillButton key={t} active={tab === t} onClick={() => setTab(t)}>
                  {TAB_LABELS[t]}
                </PillButton>
              ))}
            </div>

            {tab === 'scoring' && (
              <ScoringTab
                draft={draft}
                totalWeight={totalWeight}
                onPatch={patch}
              />
            )}
            {tab === 'drivers' && (
              <DriversTab
                draft={draft}
                selected={selectedDriver}
                onSelect={setSelectedDriver}
                onPatch={patch}
              />
            )}
            {tab === 'pushbacks' && (
              <PushbacksTab
                draft={draft}
                selected={selectedPushback}
                onSelect={setSelectedPushback}
                onPatch={patch}
                addingNew={addingNew}
                newId={newPushbackId}
                onNewId={setNewPushbackId}
                onStartAdd={() => { setAddingNew(true); setNewPushbackId(''); }}
                onConfirmAdd={() => {
                  const id = newPushbackId.trim();
                  if (!id || draft.pushbacks[id]) return;
                  patch({ pushbacks: { ...draft.pushbacks, [id]: emptyDraftPushback(id) } });
                  setSelectedPushback(id);
                  setAddingNew(false);
                  setNewPushbackId('');
                }}
                onCancelAdd={() => { setAddingNew(false); setNewPushbackId(''); }}
                onDelete={(id) => {
                  // Only admin-added categories can be deleted outright.
                  const next = { ...draft.pushbacks };
                  delete next[id];
                  patch({ pushbacks: next });
                  if (selectedPushback === id) {
                    setSelectedPushback(Object.keys(next)[0] ?? null);
                  }
                }}
                onResetOne={(id) => {
                  // Built-in categories revert their fields to the code default.
                  patch({ pushbacks: { ...draft.pushbacks, [id]: defaultPushbackDraft(id) } });
                }}
              />
            )}
            {tab === 'global' && <GlobalTab draft={draft} onPatch={patch} />}

            {/* Sticky action bar */}
            <div
              style={{
                position: 'sticky',
                bottom: 16,
                marginTop: 8,
                zIndex: 5,
              }}
            >
              <Glass padding="12px 16px" radius={14}>
                <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                  <button onClick={handleSave} disabled={saving || !dirty} style={{ ...btnPrimary, opacity: saving || !dirty ? 0.5 : 1 }}>
                    {saving ? 'Saving…' : 'Save changes'}
                  </button>
                  <button onClick={resetAll} style={btnSecondary}>
                    Reset all to defaults
                  </button>
                  <span
                    style={{
                      fontSize: 12,
                      fontWeight: 700,
                      color: dirty ? COLOR.warn : COLOR.inkMute,
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
                        background: dirty ? COLOR.warn : 'rgba(60,20,15,0.2)',
                        display: 'inline-block',
                      }}
                    />
                    {dirty ? 'Unsaved changes' : 'All changes saved'}
                  </span>
                  {saveStatus === 'saved' && (
                    <span style={{ fontSize: 13, color: COLOR.success, fontWeight: 700 }}>✓ Saved</span>
                  )}
                  {saveStatus === 'error' && (
                    <span style={{ fontSize: 13, color: COLOR.danger, fontWeight: 700 }}>
                      {saveError ?? 'Save failed'}
                    </span>
                  )}
                  <span style={{ marginLeft: 'auto', fontSize: 11, color: COLOR.inkMute }}>
                    Only changed fields are saved — untouched items keep inheriting defaults.
                  </span>
                </div>
              </Glass>
            </div>
          </>
        )}
      </ScreenShell>
    </>
  );
}

// ─── Scoring tab ────────────────────────────────────────────────────────────────

function ScoringTab({
  draft,
  totalWeight,
  onPatch,
}: {
  draft: Draft;
  totalWeight: number;
  onPatch: (p: Partial<Draft>) => void;
}) {
  function patchDim(idx: number, p: Partial<DraftDimension>) {
    onPatch({ dims: draft.dims.map((d, i) => (i === idx ? { ...d, ...p } : d)) });
  }
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <SectionTitle
        title="Scoring rubric"
        subtitle="Five ACT-first dimensions. Weights are normalised automatically — only their relative size matters."
      />
      {draft.dims.map((dim, idx) => {
        const pct = totalWeight > 0 ? (dim.weight / totalWeight) * 100 : 0;
        return (
          <Collapsible
            key={dim.key}
            title={dim.label || dim.key}
            accent={
              <span style={{ fontFamily: 'var(--pbt-mono)', fontSize: 11, color: COLOR.inkMute }}>
                {dim.key}
              </span>
            }
            badge={<WeightBar pct={pct} />}
          >
            <div style={{ display: 'grid', gap: 12 }}>
              <div style={TWO_COL}>
                <Field label="Label">
                  <input value={dim.label} onChange={(e) => patchDim(idx, { label: e.target.value })} style={inputStyle} />
                </Field>
                <Field label="Weight" help="Relative; auto-normalised across dimensions.">
                  <input
                    type="number"
                    min={0}
                    step={0.01}
                    value={dim.weight}
                    onChange={(e) => patchDim(idx, { weight: parseFloat(e.target.value) || 0 })}
                    style={inputStyle}
                  />
                </Field>
              </div>
              <Field label="Description">
                <textarea value={dim.description} rows={2} onChange={(e) => patchDim(idx, { description: e.target.value })} style={proseArea} />
              </Field>
              <div style={TWO_COL}>
                <Field label="Excellent example (≥85)">
                  <textarea value={dim.excellentExample} rows={3} onChange={(e) => patchDim(idx, { excellentExample: e.target.value })} style={proseArea} />
                </Field>
                <Field label="Needs-work example (<70)">
                  <textarea value={dim.needsWorkExample} rows={3} onChange={(e) => patchDim(idx, { needsWorkExample: e.target.value })} style={proseArea} />
                </Field>
              </div>
            </div>
          </Collapsible>
        );
      })}

      <Collapsible title="Scoring prompt injections" badge={<span style={{ fontSize: 11, color: COLOR.inkMute }}>optional</span>}>
        <div style={{ display: 'grid', gap: 12 }}>
          <Field label="Prompt prefix" help="Injected at the top of the scoring system prompt.">
            <textarea value={draft.scoringPrefix} rows={4} onChange={(e) => onPatch({ scoringPrefix: e.target.value })} style={textareaStyle} placeholder="(none)" />
          </Field>
          <Field label="Prompt suffix" help="Appended to the scoring system prompt.">
            <textarea value={draft.scoringSuffix} rows={4} onChange={(e) => onPatch({ scoringSuffix: e.target.value })} style={textareaStyle} placeholder="(none)" />
          </Field>
        </div>
      </Collapsible>
    </div>
  );
}

// ─── Drivers tab ────────────────────────────────────────────────────────────────

const DRIVER_ARR_FIELDS: Array<{ key: keyof DraftDriver; label: string }> = [
  { key: 'communicationStyle', label: 'Communication style' },
  { key: 'strengths', label: 'Strengths' },
  { key: 'recognitionCues', label: 'Recognition cues' },
  { key: 'flexingTips', label: 'Flexing tips' },
  { key: 'customerSamplePhrasings', label: 'Customer sample phrasings' },
];

function DriversTab({
  draft,
  selected,
  onSelect,
  onPatch,
}: {
  draft: Draft;
  selected: DriverKey;
  onSelect: (k: DriverKey) => void;
  onPatch: (p: Partial<Draft>) => void;
}) {
  const d = draft.drivers[selected];
  function set(p: Partial<DraftDriver>) {
    onPatch({ drivers: { ...draft.drivers, [selected]: { ...d, ...p } } });
  }
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <SectionTitle title="Driver personas" subtitle="The four ECHO archetypes that drive the AI customer's behaviour." />
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {DRIVER_KEYS.map((k) => (
          <PillButton key={k} active={selected === k} onClick={() => onSelect(k)} size="sm">
            {k}
          </PillButton>
        ))}
      </div>
      <Glass padding={18} radius={16}>
        <div style={{ display: 'grid', gap: 12 }}>
          <Field label="Motivation">
            <textarea value={d.motivation} rows={3} onChange={(e) => set({ motivation: e.target.value })} style={proseArea} />
          </Field>
          <Field label="Stress signature">
            <textarea value={d.stressSignature} rows={2} onChange={(e) => set({ stressSignature: e.target.value })} style={proseArea} />
          </Field>
          {DRIVER_ARR_FIELDS.map(({ key, label }) => (
            <Field key={key} label={label} help="One item per line.">
              <textarea value={d[key]} rows={4} onChange={(e) => set({ [key]: e.target.value } as Partial<DraftDriver>)} style={textareaStyle} />
            </Field>
          ))}
        </div>
      </Glass>
    </div>
  );
}

// ─── Pushbacks tab ──────────────────────────────────────────────────────────────

const PUSHBACK_ARR_FIELDS: Array<{ key: keyof DraftPushback; label: string }> = [
  { key: 'examples', label: 'Example phrasings' },
  { key: 'rootConcerns', label: 'Root concerns' },
  { key: 'acknowledgePatterns', label: 'Acknowledge patterns' },
  { key: 'clarifyQuestions', label: 'Clarify questions' },
  { key: 'takeActionPatterns', label: 'Take-action patterns' },
  { key: 'watchOuts', label: 'Watch-outs' },
];

function PushbacksTab({
  draft,
  selected,
  onSelect,
  onPatch,
  addingNew,
  newId,
  onNewId,
  onStartAdd,
  onConfirmAdd,
  onCancelAdd,
  onDelete,
  onResetOne,
}: {
  draft: Draft;
  selected: string | null;
  onSelect: (id: string) => void;
  onPatch: (p: Partial<Draft>) => void;
  addingNew: boolean;
  newId: string;
  onNewId: (s: string) => void;
  onStartAdd: () => void;
  onConfirmAdd: () => void;
  onCancelAdd: () => void;
  onDelete: (id: string) => void;
  onResetOne: (id: string) => void;
}) {
  const ids = Object.keys(draft.pushbacks);
  const p = selected ? draft.pushbacks[selected] : null;
  function set(pp: Partial<DraftPushback>) {
    if (!selected) return;
    onPatch({ pushbacks: { ...draft.pushbacks, [selected]: { ...draft.pushbacks[selected], ...pp } } });
  }
  const idExists = !!draft.pushbacks[newId.trim()];
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <Glass padding={18} radius={16}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
          <SectionTitle title="Pushback categories" subtitle={`${ids.length} categories — what the AI customer pushes back on`} />
          <button onClick={onStartAdd} style={{ ...btnPrimary, fontSize: 12 }}>+ New category</button>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {ids.map((id) => (
            <PillButton key={id} active={selected === id} onClick={() => onSelect(id)} size="sm">
              {id}
            </PillButton>
          ))}
        </div>
        {addingNew && (
          <div style={{ marginTop: 12, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <input
              value={newId}
              onChange={(e) => onNewId(e.target.value.replace(/\s+/g, '-').toLowerCase())}
              placeholder="new-pushback-id"
              style={{ ...inputStyle, maxWidth: 240 }}
            />
            <button onClick={onConfirmAdd} disabled={!newId.trim() || idExists} style={{ ...btnPrimary, opacity: !newId.trim() || idExists ? 0.5 : 1 }}>Add</button>
            <button onClick={onCancelAdd} style={btnSecondary}>Cancel</button>
            {idExists && <span style={{ fontSize: 12, color: COLOR.danger }}>ID already exists</span>}
          </div>
        )}
      </Glass>

      {p && selected ? (
        <Glass padding={18} radius={16}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, gap: 10 }}>
            <SectionTitle
              title={`Edit: ${selected}`}
              subtitle={DEFAULT_PUSHBACK_IDS.has(selected) ? 'Built-in category' : 'Admin-added category'}
            />
            {DEFAULT_PUSHBACK_IDS.has(selected) ? (
              <button onClick={() => onResetOne(selected)} style={{ ...btnSecondary, fontSize: 12 }}>
                Reset to default
              </button>
            ) : (
              <button onClick={() => onDelete(selected)} style={{ ...btnSecondary, color: COLOR.danger, fontSize: 12 }}>
                Delete category
              </button>
            )}
          </div>
          <div style={{ display: 'grid', gap: 12 }}>
            <Field label="Title">
              <input value={p.title} onChange={(e) => set({ title: e.target.value })} style={inputStyle} />
            </Field>
            {PUSHBACK_ARR_FIELDS.map(({ key, label }) => (
              <Field key={key} label={label} help="One item per line.">
                <textarea value={p[key]} rows={4} onChange={(e) => set({ [key]: e.target.value } as Partial<DraftPushback>)} style={textareaStyle} />
              </Field>
            ))}
          </div>
        </Glass>
      ) : (
        <div style={{ padding: '40px 20px', textAlign: 'center', color: COLOR.inkMute, fontSize: 13 }}>
          Select a pushback category to edit it, or add a new one.
        </div>
      )}
    </div>
  );
}

// ─── Global prompt tab ──────────────────────────────────────────────────────────

function GlobalTab({ draft, onPatch }: { draft: Draft; onPatch: (p: Partial<Draft>) => void }) {
  return (
    <Glass padding={18} radius={16}>
      <SectionTitle title="Global customer prompt" subtitle="Applied to every simulation, on top of any per-scenario prompt wraps." />
      <div style={{ display: 'grid', gap: 12, marginTop: 14 }}>
        <Field label="Customer prompt prefix" help="Injected at the top of the customer system prompt.">
          <textarea value={draft.customerPrefix} rows={5} onChange={(e) => onPatch({ customerPrefix: e.target.value })} style={textareaStyle} placeholder="(none)" />
        </Field>
        <Field label="Customer prompt suffix" help="Appended to the customer system prompt.">
          <textarea value={draft.customerSuffix} rows={5} onChange={(e) => onPatch({ customerSuffix: e.target.value })} style={textareaStyle} placeholder="(none)" />
        </Field>
      </div>
    </Glass>
  );
}
