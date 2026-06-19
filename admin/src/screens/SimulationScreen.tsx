/**
 * SimulationScreen — admin editor for SimulationConfig.
 * Sub-tabs: Scoring | Drivers | Pushbacks | Global Prompt
 */
import { useMemo, useState } from 'react';
import {
  defaultSimulationConfig,
  type SimulationConfig,
} from '../../../src/data/knowledge/simulationConfig';
import type { DriverKey } from '../../../src/design-system/tokens';
import { DRIVER_KEYS } from '../../../src/design-system/tokens';
import { useAdminSimulationConfig, saveSimulationConfig } from '../data/queries';
import { Glass } from '../primitives/Glass';
import { LoadingShimmer, SectionTitle } from '../primitives';
import { ContextBar, ScreenShell } from '../primitives/Shell';
import { COLOR } from '../lib/tokens';
import {
  Field,
  inputStyle,
  textareaStyle,
  btnPrimary,
  btnSecondary,
} from './FlagsScreen';
import type { ScoringDimensionConfig } from '../../../src/data/knowledge/simulationConfig';
import type { DriverKnowledge } from '../../../src/data/knowledge/driverProfiles';
import type { PushbackKnowledge } from '../../../src/data/knowledge/pushbackTaxonomy';

// ─── Types for local draft state ─────────────────────────────────────────────

/** All fields are fully populated so the UI never has to guard for undefined. */
interface DraftDimension {
  key: string;
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

// ─── Helpers ─────────────────────────────────────────────────────────────────

function arrToText(arr: string[] | undefined): string {
  return (arr ?? []).join('\n');
}

function textToArr(text: string): string[] {
  return text
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Deep-merge saved config (Record<string,unknown>) over the default to produce a full SimulationConfig. */
function hydrateDraft(
  saved: Record<string, unknown>,
): ReturnType<typeof defaultSimulationConfig> & {
  customerPromptPrefix: string;
  customerPromptSuffix: string;
} {
  const defaults = defaultSimulationConfig();

  // --- Scoring ---
  const savedScoring = (saved.scoring ?? {}) as Record<string, unknown>;
  const savedDims = Array.isArray(savedScoring.dimensions)
    ? (savedScoring.dimensions as ScoringDimensionConfig[])
    : [];
  const dimMap = new Map(savedDims.map((d) => [d.key, d]));
  const mergedDimensions = defaults.scoring.dimensions.map((d) => ({
    ...d,
    ...(dimMap.get(d.key) ?? {}),
  }));

  const scoring = {
    dimensions: mergedDimensions,
    promptPrefix: typeof savedScoring.promptPrefix === 'string' ? savedScoring.promptPrefix : '',
    promptSuffix: typeof savedScoring.promptSuffix === 'string' ? savedScoring.promptSuffix : '',
  };

  // --- Drivers ---
  const savedDrivers = (saved.drivers ?? {}) as Partial<Record<DriverKey, Partial<DriverKnowledge>>>;
  const drivers = { ...defaults.drivers } as Record<DriverKey, DriverKnowledge>;
  for (const dk of DRIVER_KEYS) {
    const o = savedDrivers[dk];
    if (!o) continue;
    const base = drivers[dk];
    const arr = (override: string[] | undefined, fallback: string[]) =>
      Array.isArray(override) && override.length > 0 ? override : fallback;
    drivers[dk] = {
      motivation: typeof o.motivation === 'string' && o.motivation.trim() ? o.motivation : base.motivation,
      stressSignature: typeof o.stressSignature === 'string' && o.stressSignature.trim() ? o.stressSignature : base.stressSignature,
      communicationStyle: arr(o.communicationStyle, base.communicationStyle),
      strengths: arr(o.strengths, base.strengths),
      recognitionCues: arr(o.recognitionCues, base.recognitionCues),
      flexingTips: arr(o.flexingTips, base.flexingTips),
      customerSamplePhrasings: arr(o.customerSamplePhrasings, base.customerSamplePhrasings),
    };
  }

  // --- Pushbacks ---
  const savedPushbacks = (saved.pushbacks ?? {}) as Record<string, Partial<PushbackKnowledge>>;
  const pushbacks = { ...defaults.pushbacks } as Record<string, PushbackKnowledge>;
  for (const [id, o] of Object.entries(savedPushbacks)) {
    const base = pushbacks[id];
    const arr = (override: string[] | undefined, fallback: string[] | undefined) =>
      Array.isArray(override) && override.length > 0 ? override : fallback ?? [];
    pushbacks[id] = {
      id,
      title: typeof o.title === 'string' && o.title.trim() ? o.title : base?.title ?? id,
      examples: arr(o.examples, base?.examples),
      rootConcerns: arr(o.rootConcerns, base?.rootConcerns),
      acknowledgePatterns: arr(o.acknowledgePatterns, base?.acknowledgePatterns),
      clarifyQuestions: arr(o.clarifyQuestions, base?.clarifyQuestions),
      takeActionPatterns: arr(o.takeActionPatterns, base?.takeActionPatterns),
      watchOuts: arr(o.watchOuts, base?.watchOuts),
    };
  }

  return {
    scoring,
    drivers,
    pushbacks,
    customerPromptPrefix: typeof saved.customerPromptPrefix === 'string' ? saved.customerPromptPrefix : '',
    customerPromptSuffix: typeof saved.customerPromptSuffix === 'string' ? saved.customerPromptSuffix : '',
  };
}

// ─── Main screen ──────────────────────────────────────────────────────────────

type Tab = 'scoring' | 'drivers' | 'pushbacks' | 'global';

export function SimulationScreen() {
  const [refreshKey, setRefreshKey] = useState(0);
  const snapshot = useAdminSimulationConfig(refreshKey);
  const [activeTab, setActiveTab] = useState<Tab>('scoring');
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saved' | 'error'>('idle');
  const [saveError, setSaveError] = useState<string | null>(null);

  // Build the fully-populated draft from whatever is in the DB.
  const hydrated = useMemo(
    () => (!snapshot.loading ? hydrateDraft(snapshot.data) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [snapshot.loading, snapshot.data],
  );

  // ── Per-tab draft state ────────────────────────────────────────────────────

  const [dimsDraft, setDimsDraft] = useState<DraftDimension[]>([]);
  const [scoringPrefix, setScoringPrefix] = useState('');
  const [scoringSuffix, setScoringeSuffix] = useState('');

  const [selectedDriver, setSelectedDriver] = useState<DriverKey>('Activator');
  const [driversDraft, setDriversDraft] = useState<Record<DriverKey, DraftDriver>>(() =>
    Object.fromEntries(DRIVER_KEYS.map((k) => [k, emptyDraftDriver()])) as Record<DriverKey, DraftDriver>,
  );

  const [pushbacksDraft, setPushbacksDraft] = useState<Record<string, DraftPushback>>({});
  const [selectedPushback, setSelectedPushback] = useState<string | null>(null);
  const [newPushbackId, setNewPushbackId] = useState('');
  const [addingNew, setAddingNew] = useState(false);

  const [customerPrefix, setCustomerPrefix] = useState('');
  const [customerSuffix, setCustomerSuffix] = useState('');

  // ── Initialise draft from loaded data ─────────────────────────────────────

  const [initialized, setInitialized] = useState(false);

  if (hydrated && !initialized) {
    setInitialized(true);
    // Scoring
    setDimsDraft(
      hydrated.scoring.dimensions.map((d) => ({
        key: d.key,
        label: d.label ?? '',
        description: d.description ?? '',
        weight: typeof d.weight === 'number' ? d.weight : 0,
        excellentExample: d.excellentExample ?? '',
        needsWorkExample: d.needsWorkExample ?? '',
      })),
    );
    setScoringPrefix(hydrated.scoring.promptPrefix ?? '');
    setScoringeSuffix(hydrated.scoring.promptSuffix ?? '');
    // Drivers
    setDriversDraft(
      Object.fromEntries(
        DRIVER_KEYS.map((k) => [k, driverKnowledgeToDraft(hydrated.drivers[k] as DriverKnowledge)]),
      ) as Record<DriverKey, DraftDriver>,
    );
    // Pushbacks
    setPushbacksDraft(
      Object.fromEntries(
        Object.entries(hydrated.pushbacks).map(([id, p]) => [id, pushbackToDraft(p as PushbackKnowledge)]),
      ),
    );
    if (!selectedPushback && Object.keys(hydrated.pushbacks).length > 0) {
      setSelectedPushback(Object.keys(hydrated.pushbacks)[0]);
    }
    // Global
    setCustomerPrefix(hydrated.customerPromptPrefix ?? '');
    setCustomerSuffix(hydrated.customerPromptSuffix ?? '');
  }

  // ── Reset helpers ──────────────────────────────────────────────────────────

  function resetToDefaults() {
    const defaults = defaultSimulationConfig();
    setDimsDraft(
      defaults.scoring.dimensions.map((d) => ({
        key: d.key,
        label: d.label ?? '',
        description: d.description ?? '',
        weight: typeof d.weight === 'number' ? d.weight : 0,
        excellentExample: d.excellentExample ?? '',
        needsWorkExample: d.needsWorkExample ?? '',
      })),
    );
    setScoringPrefix(defaults.scoring.promptPrefix ?? '');
    setScoringeSuffix(defaults.scoring.promptSuffix ?? '');
    setDriversDraft(
      Object.fromEntries(
        DRIVER_KEYS.map((k) => [k, driverKnowledgeToDraft(defaults.drivers[k] as DriverKnowledge)]),
      ) as Record<DriverKey, DraftDriver>,
    );
    setPushbacksDraft(
      Object.fromEntries(
        Object.entries(defaults.pushbacks).map(([id, p]) => [id, pushbackToDraft(p as PushbackKnowledge)]),
      ),
    );
    setCustomerPrefix('');
    setCustomerSuffix('');
  }

  // ── Assemble and save ──────────────────────────────────────────────────────

  async function handleSave() {
    setSaving(true);
    setSaveStatus('idle');
    setSaveError(null);
    try {
      const config: SimulationConfig = {
        scoring: {
          dimensions: dimsDraft.map((d) => ({
            key: d.key as import('../../../src/data/knowledge/scoringRubric').DimensionKey,
            label: d.label,
            description: d.description,
            weight: d.weight,
            excellentExample: d.excellentExample,
            needsWorkExample: d.needsWorkExample,
          })),
          promptPrefix: scoringPrefix,
          promptSuffix: scoringSuffix,
        },
        drivers: Object.fromEntries(
          DRIVER_KEYS.map((k) => [
            k,
            {
              motivation: driversDraft[k].motivation,
              stressSignature: driversDraft[k].stressSignature,
              communicationStyle: textToArr(driversDraft[k].communicationStyle),
              strengths: textToArr(driversDraft[k].strengths),
              recognitionCues: textToArr(driversDraft[k].recognitionCues),
              flexingTips: textToArr(driversDraft[k].flexingTips),
              customerSamplePhrasings: textToArr(driversDraft[k].customerSamplePhrasings),
            },
          ]),
        ) as SimulationConfig['drivers'],
        pushbacks: Object.fromEntries(
          Object.entries(pushbacksDraft).map(([id, p]) => [
            id,
            {
              id,
              title: p.title,
              examples: textToArr(p.examples),
              rootConcerns: textToArr(p.rootConcerns),
              acknowledgePatterns: textToArr(p.acknowledgePatterns),
              clarifyQuestions: textToArr(p.clarifyQuestions),
              takeActionPatterns: textToArr(p.takeActionPatterns),
              watchOuts: textToArr(p.watchOuts),
            },
          ]),
        ),
        customerPromptPrefix: customerPrefix,
        customerPromptSuffix: customerSuffix,
      };
      await saveSimulationConfig(config as unknown as Record<string, unknown>);
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

  // ── Total weight (for live %) ──────────────────────────────────────────────
  const totalWeight = dimsDraft.reduce((s, d) => s + (d.weight > 0 ? d.weight : 0), 0);

  return (
    <>
      <ContextBar
        title="Simulation config"
        subtitle="Tune AI customer personas, scoring rubric, and prompt injections without a code deploy."
      />
      <ScreenShell>
        {snapshot.loading ? (
          <LoadingShimmer height={320} />
        ) : (
          <>
            {/* Tab bar */}
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {(['scoring', 'drivers', 'pushbacks', 'global'] as Tab[]).map((t) => {
                const labels: Record<Tab, string> = {
                  scoring: 'Scoring',
                  drivers: 'Drivers',
                  pushbacks: 'Pushbacks',
                  global: 'Global Prompt',
                };
                const isActive = activeTab === t;
                return (
                  <button
                    key={t}
                    onClick={() => setActiveTab(t)}
                    style={{
                      padding: '8px 16px',
                      borderRadius: 12,
                      border: 'none',
                      cursor: 'pointer',
                      background: isActive
                        ? 'linear-gradient(180deg, oklch(0.66 0.22 22), oklch(0.55 0.24 18))'
                        : 'rgba(255,255,255,0.7)',
                      color: isActive ? '#fff' : COLOR.inkSoft,
                      fontWeight: 700,
                      fontSize: 13,
                      fontFamily: 'var(--pbt-font)',
                    }}
                  >
                    {labels[t]}
                  </button>
                );
              })}
            </div>

            {/* Scoring tab */}
            {activeTab === 'scoring' && (
              <ScoringTab
                dims={dimsDraft}
                onDims={setDimsDraft}
                totalWeight={totalWeight}
                prefix={scoringPrefix}
                onPrefix={setScoringPrefix}
                suffix={scoringSuffix}
                onSuffix={setScoringeSuffix}
                onReset={() => {
                  const d = defaultSimulationConfig();
                  setDimsDraft(
                    d.scoring.dimensions.map((dim) => ({
                      key: dim.key,
                      label: dim.label ?? '',
                      description: dim.description ?? '',
                      weight: typeof dim.weight === 'number' ? dim.weight : 0,
                      excellentExample: dim.excellentExample ?? '',
                      needsWorkExample: dim.needsWorkExample ?? '',
                    })),
                  );
                  setScoringPrefix('');
                  setScoringeSuffix('');
                }}
              />
            )}

            {/* Drivers tab */}
            {activeTab === 'drivers' && (
              <DriversTab
                selected={selectedDriver}
                onSelect={setSelectedDriver}
                draft={driversDraft}
                onDraft={(dk, patch) =>
                  setDriversDraft((prev) => ({
                    ...prev,
                    [dk]: { ...prev[dk], ...patch },
                  }))
                }
                onReset={() => {
                  const d = defaultSimulationConfig();
                  setDriversDraft(
                    Object.fromEntries(
                      DRIVER_KEYS.map((k) => [k, driverKnowledgeToDraft(d.drivers[k] as DriverKnowledge)]),
                    ) as Record<DriverKey, DraftDriver>,
                  );
                }}
              />
            )}

            {/* Pushbacks tab */}
            {activeTab === 'pushbacks' && (
              <PushbacksTab
                draft={pushbacksDraft}
                selected={selectedPushback}
                onSelect={setSelectedPushback}
                onDraft={(id, patch) =>
                  setPushbacksDraft((prev) => ({
                    ...prev,
                    [id]: { ...prev[id], ...patch },
                  }))
                }
                addingNew={addingNew}
                newId={newPushbackId}
                onNewId={setNewPushbackId}
                onStartAdd={() => {
                  setAddingNew(true);
                  setNewPushbackId('');
                }}
                onConfirmAdd={() => {
                  const id = newPushbackId.trim();
                  if (!id || pushbacksDraft[id]) return;
                  setPushbacksDraft((prev) => ({
                    ...prev,
                    [id]: emptyDraftPushback(id),
                  }));
                  setSelectedPushback(id);
                  setAddingNew(false);
                  setNewPushbackId('');
                }}
                onCancelAdd={() => {
                  setAddingNew(false);
                  setNewPushbackId('');
                }}
                onReset={() => {
                  const d = defaultSimulationConfig();
                  setPushbacksDraft(
                    Object.fromEntries(
                      Object.entries(d.pushbacks).map(([id, p]) => [
                        id,
                        pushbackToDraft(p as PushbackKnowledge),
                      ]),
                    ),
                  );
                }}
              />
            )}

            {/* Global Prompt tab */}
            {activeTab === 'global' && (
              <GlobalPromptTab
                prefix={customerPrefix}
                onPrefix={setCustomerPrefix}
                suffix={customerSuffix}
                onSuffix={setCustomerSuffix}
                onReset={() => {
                  setCustomerPrefix('');
                  setCustomerSuffix('');
                }}
              />
            )}

            {/* Save row */}
            <div
              style={{
                display: 'flex',
                gap: 10,
                alignItems: 'center',
                flexWrap: 'wrap',
                paddingTop: 8,
              }}
            >
              <button onClick={handleSave} disabled={saving} style={btnPrimary}>
                {saving ? 'Saving…' : 'Save changes'}
              </button>
              <button onClick={resetToDefaults} style={btnSecondary}>
                Reset all to defaults
              </button>
              {saveStatus === 'saved' && (
                <span style={{ fontSize: 13, color: COLOR.success, fontWeight: 700 }}>
                  ✓ Saved
                </span>
              )}
              {saveStatus === 'error' && (
                <span style={{ fontSize: 13, color: COLOR.danger, fontWeight: 700 }}>
                  {saveError ?? 'Save failed'}
                </span>
              )}
            </div>
          </>
        )}
      </ScreenShell>
    </>
  );
}

// ─── Scoring tab ──────────────────────────────────────────────────────────────

function ScoringTab({
  dims,
  onDims,
  totalWeight,
  prefix,
  onPrefix,
  suffix,
  onSuffix,
  onReset,
}: {
  dims: DraftDimension[];
  onDims: (d: DraftDimension[]) => void;
  totalWeight: number;
  prefix: string;
  onPrefix: (s: string) => void;
  suffix: string;
  onSuffix: (s: string) => void;
  onReset: () => void;
}) {
  function patchDim(idx: number, patch: Partial<DraftDimension>) {
    onDims(dims.map((d, i) => (i === idx ? { ...d, ...patch } : d)));
  }

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button onClick={onReset} style={{ ...btnSecondary, fontSize: 12 }}>
          Reset scoring to defaults
        </button>
      </div>
      {dims.map((dim, idx) => {
        const pct = totalWeight > 0 ? ((dim.weight / totalWeight) * 100).toFixed(1) : '0.0';
        return (
          <Glass key={dim.key} padding={18} radius={18}>
            <SectionTitle
              title={dim.label || dim.key}
              subtitle={`Dimension key: ${dim.key}`}
            />
            <div style={{ display: 'grid', gap: 12, marginTop: 14 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <Field label="Label">
                  <input
                    value={dim.label}
                    onChange={(e) => patchDim(idx, { label: e.target.value })}
                    style={inputStyle}
                  />
                </Field>
                <Field label={`Weight (normalized: ${pct}%)`}>
                  <input
                    type="number"
                    min={0}
                    step={0.01}
                    value={dim.weight}
                    onChange={(e) =>
                      patchDim(idx, { weight: parseFloat(e.target.value) || 0 })
                    }
                    style={inputStyle}
                  />
                </Field>
              </div>
              <Field label="Description">
                <textarea
                  value={dim.description}
                  rows={2}
                  onChange={(e) => patchDim(idx, { description: e.target.value })}
                  style={{ ...textareaStyle, fontFamily: 'var(--pbt-font)' }}
                />
              </Field>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <Field label="Excellent example">
                  <textarea
                    value={dim.excellentExample}
                    rows={3}
                    onChange={(e) => patchDim(idx, { excellentExample: e.target.value })}
                    style={{ ...textareaStyle, fontFamily: 'var(--pbt-font)' }}
                  />
                </Field>
                <Field label="Needs work example">
                  <textarea
                    value={dim.needsWorkExample}
                    rows={3}
                    onChange={(e) => patchDim(idx, { needsWorkExample: e.target.value })}
                    style={{ ...textareaStyle, fontFamily: 'var(--pbt-font)' }}
                  />
                </Field>
              </div>
            </div>
          </Glass>
        );
      })}

      <Glass padding={18} radius={18}>
        <SectionTitle title="Scoring prompt injections" />
        <div style={{ display: 'grid', gap: 12, marginTop: 14 }}>
          <Field label="Prompt prefix" help="Injected at the top of the scoring system prompt.">
            <textarea
              value={prefix}
              rows={4}
              onChange={(e) => onPrefix(e.target.value)}
              style={textareaStyle}
              placeholder="(none)"
            />
          </Field>
          <Field label="Prompt suffix" help="Appended to the scoring system prompt.">
            <textarea
              value={suffix}
              rows={4}
              onChange={(e) => onSuffix(e.target.value)}
              style={textareaStyle}
              placeholder="(none)"
            />
          </Field>
        </div>
      </Glass>
    </div>
  );
}

// ─── Drivers tab ──────────────────────────────────────────────────────────────

const DRIVER_ARR_FIELDS: Array<{ key: keyof DraftDriver; label: string }> = [
  { key: 'communicationStyle', label: 'Communication style (one per line)' },
  { key: 'strengths', label: 'Strengths (one per line)' },
  { key: 'recognitionCues', label: 'Recognition cues (one per line)' },
  { key: 'flexingTips', label: 'Flexing tips (one per line)' },
  { key: 'customerSamplePhrasings', label: 'Customer sample phrasings (one per line)' },
];

function DriversTab({
  selected,
  onSelect,
  draft,
  onDraft,
  onReset,
}: {
  selected: DriverKey;
  onSelect: (k: DriverKey) => void;
  draft: Record<DriverKey, DraftDriver>;
  onDraft: (dk: DriverKey, patch: Partial<DraftDriver>) => void;
  onReset: () => void;
}) {
  const d = draft[selected];
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', gap: 6 }}>
          {DRIVER_KEYS.map((k) => (
            <button
              key={k}
              onClick={() => onSelect(k)}
              style={{
                padding: '8px 14px',
                borderRadius: 12,
                border: 'none',
                cursor: 'pointer',
                background:
                  selected === k
                    ? 'linear-gradient(180deg, oklch(0.66 0.22 22), oklch(0.55 0.24 18))'
                    : 'rgba(255,255,255,0.7)',
                color: selected === k ? '#fff' : COLOR.inkSoft,
                fontWeight: 700,
                fontSize: 13,
                fontFamily: 'var(--pbt-font)',
              }}
            >
              {k}
            </button>
          ))}
        </div>
        <button onClick={onReset} style={{ ...btnSecondary, fontSize: 12 }}>
          Reset drivers to defaults
        </button>
      </div>

      <Glass padding={18} radius={18}>
        <SectionTitle title={selected} subtitle="ECHO driver persona knowledge" />
        <div style={{ display: 'grid', gap: 12, marginTop: 14 }}>
          <Field label="Motivation">
            <textarea
              value={d.motivation}
              rows={3}
              onChange={(e) => onDraft(selected, { motivation: e.target.value })}
              style={{ ...textareaStyle, fontFamily: 'var(--pbt-font)' }}
            />
          </Field>
          <Field label="Stress signature">
            <textarea
              value={d.stressSignature}
              rows={2}
              onChange={(e) => onDraft(selected, { stressSignature: e.target.value })}
              style={{ ...textareaStyle, fontFamily: 'var(--pbt-font)' }}
            />
          </Field>
          {DRIVER_ARR_FIELDS.map(({ key, label }) => (
            <Field key={key} label={label} help="One item per line.">
              <textarea
                value={d[key]}
                rows={4}
                onChange={(e) => onDraft(selected, { [key]: e.target.value })}
                style={textareaStyle}
              />
            </Field>
          ))}
        </div>
      </Glass>
    </div>
  );
}

// ─── Pushbacks tab ────────────────────────────────────────────────────────────

const PUSHBACK_ARR_FIELDS: Array<{ key: keyof DraftPushback; label: string }> = [
  { key: 'examples', label: 'Example phrasings (one per line)' },
  { key: 'rootConcerns', label: 'Root concerns (one per line)' },
  { key: 'acknowledgePatterns', label: 'Acknowledge patterns (one per line)' },
  { key: 'clarifyQuestions', label: 'Clarify questions (one per line)' },
  { key: 'takeActionPatterns', label: 'Take action patterns (one per line)' },
  { key: 'watchOuts', label: 'Watch-outs (one per line)' },
];

function PushbacksTab({
  draft,
  selected,
  onSelect,
  onDraft,
  addingNew,
  newId,
  onNewId,
  onStartAdd,
  onConfirmAdd,
  onCancelAdd,
  onReset,
}: {
  draft: Record<string, DraftPushback>;
  selected: string | null;
  onSelect: (id: string) => void;
  onDraft: (id: string, patch: Partial<DraftPushback>) => void;
  addingNew: boolean;
  newId: string;
  onNewId: (s: string) => void;
  onStartAdd: () => void;
  onConfirmAdd: () => void;
  onCancelAdd: () => void;
  onReset: () => void;
}) {
  const ids = Object.keys(draft);
  const p = selected ? draft[selected] : null;

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      {/* List + add */}
      <Glass padding={18} radius={18}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <SectionTitle title="Pushback categories" subtitle={`${ids.length} categories`} />
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={onReset} style={{ ...btnSecondary, fontSize: 12 }}>
              Reset to defaults
            </button>
            <button onClick={onStartAdd} style={{ ...btnPrimary, fontSize: 12 }}>
              + New
            </button>
          </div>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {ids.map((id) => (
            <button
              key={id}
              onClick={() => onSelect(id)}
              style={{
                padding: '6px 12px',
                borderRadius: 10,
                border: 'none',
                cursor: 'pointer',
                background:
                  selected === id
                    ? 'linear-gradient(180deg, oklch(0.66 0.22 22), oklch(0.55 0.24 18))'
                    : 'rgba(255,255,255,0.7)',
                color: selected === id ? '#fff' : COLOR.inkSoft,
                fontWeight: 600,
                fontSize: 12,
                fontFamily: 'var(--pbt-font)',
              }}
            >
              {id}
            </button>
          ))}
        </div>
        {addingNew && (
          <div style={{ marginTop: 12, display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              value={newId}
              onChange={(e) => onNewId(e.target.value.replace(/\s/g, '-').toLowerCase())}
              placeholder="new-pushback-id"
              style={{ ...inputStyle, maxWidth: 240 }}
            />
            <button
              onClick={onConfirmAdd}
              disabled={!newId.trim() || !!draft[newId.trim()]}
              style={btnPrimary}
            >
              Add
            </button>
            <button onClick={onCancelAdd} style={btnSecondary}>
              Cancel
            </button>
            {draft[newId.trim()] && (
              <span style={{ fontSize: 12, color: COLOR.danger }}>ID already exists</span>
            )}
          </div>
        )}
      </Glass>

      {/* Editor */}
      {p && selected && (
        <Glass padding={18} radius={18}>
          <SectionTitle title={`Edit: ${selected}`} />
          <div style={{ display: 'grid', gap: 12, marginTop: 14 }}>
            <Field label="Title">
              <input
                value={p.title}
                onChange={(e) => onDraft(selected, { title: e.target.value })}
                style={inputStyle}
              />
            </Field>
            {PUSHBACK_ARR_FIELDS.map(({ key, label }) => (
              <Field key={key} label={label} help="One item per line.">
                <textarea
                  value={p[key]}
                  rows={4}
                  onChange={(e) => onDraft(selected, { [key]: e.target.value })}
                  style={textareaStyle}
                />
              </Field>
            ))}
          </div>
        </Glass>
      )}
      {!p && !addingNew && (
        <div
          style={{
            padding: '40px 20px',
            textAlign: 'center',
            color: COLOR.inkMute,
            fontSize: 13,
          }}
        >
          Select a pushback category to edit it.
        </div>
      )}
    </div>
  );
}

// ─── Global Prompt tab ────────────────────────────────────────────────────────

function GlobalPromptTab({
  prefix,
  onPrefix,
  suffix,
  onSuffix,
  onReset,
}: {
  prefix: string;
  onPrefix: (s: string) => void;
  suffix: string;
  onSuffix: (s: string) => void;
  onReset: () => void;
}) {
  return (
    <Glass padding={18} radius={18}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <SectionTitle title="Global customer prompt" subtitle="Applies to every simulation on top of per-scenario prompts." />
        <button onClick={onReset} style={{ ...btnSecondary, fontSize: 12 }}>
          Reset to defaults
        </button>
      </div>
      <div style={{ display: 'grid', gap: 12 }}>
        <Field label="Customer prompt prefix" help="Injected at the top of the customer system prompt.">
          <textarea
            value={prefix}
            rows={5}
            onChange={(e) => onPrefix(e.target.value)}
            style={textareaStyle}
            placeholder="(none)"
          />
        </Field>
        <Field label="Customer prompt suffix" help="Appended to the customer system prompt.">
          <textarea
            value={suffix}
            rows={5}
            onChange={(e) => onSuffix(e.target.value)}
            style={textareaStyle}
            placeholder="(none)"
          />
        </Field>
      </div>
    </Glass>
  );
}

// ─── Draft helper factories ───────────────────────────────────────────────────

function emptyDraftDriver(): DraftDriver {
  return {
    motivation: '',
    stressSignature: '',
    communicationStyle: '',
    strengths: '',
    recognitionCues: '',
    flexingTips: '',
    customerSamplePhrasings: '',
  };
}

function driverKnowledgeToDraft(k: Partial<DriverKnowledge> = {}): DraftDriver {
  return {
    motivation: k.motivation ?? '',
    stressSignature: k.stressSignature ?? '',
    communicationStyle: arrToText(k.communicationStyle),
    strengths: arrToText(k.strengths),
    recognitionCues: arrToText(k.recognitionCues),
    flexingTips: arrToText(k.flexingTips),
    customerSamplePhrasings: arrToText(k.customerSamplePhrasings),
  };
}

function pushbackToDraft(p: Partial<PushbackKnowledge> = {}): DraftPushback {
  return {
    id: p.id ?? '',
    title: p.title ?? '',
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
