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
import { useAdminSimulationConfig } from '../data/queries';
import {
  configEquals,
  fetchSimulationHistory,
  restoreSimulationVersion,
  saveSimulationConfigWithNote,
  summarizeConfigDelta,
  type SimulationVersion,
} from '../data/simulationHistory';
import { Glass } from '../primitives/Glass';
import {
  Collapsible,
  Eyebrow,
  InfoTip,
  LoadingShimmer,
  Modal,
  ModalCloseButton,
  PillButton,
  SectionTitle,
  StatusPill,
} from '../primitives';
import { ContextBar, ScreenShell } from '../primitives/Shell';
import { COLOR } from '../lib/tokens';
import { fmtAgo } from '../lib/format';
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
interface DraftRag {
  enabled: boolean;
  k: number;
}
interface Draft {
  dims: DraftDimension[];
  scoringPrefix: string;
  scoringSuffix: string;
  drivers: Record<DriverKey, DraftDriver>;
  pushbacks: Record<string, DraftPushback>;
  customerPrefix: string;
  customerSuffix: string;
  rag: DraftRag;
}

/** Defaults for the retrieval (RAG) section — not part of defaultSimulationConfig()
 *  since `rag` isn't a code-default-backed knowledge layer, just a toggle + k. */
const DEFAULT_RAG: DraftRag = { enabled: true, k: 4 };

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

  const savedRag = (saved.rag ?? {}) as { enabled?: unknown; k?: unknown };
  const rag: DraftRag = {
    enabled: typeof savedRag.enabled === 'boolean' ? savedRag.enabled : DEFAULT_RAG.enabled,
    k: typeof savedRag.k === 'number' ? savedRag.k : DEFAULT_RAG.k,
  };

  return {
    dims,
    scoringPrefix: typeof savedScoring.promptPrefix === 'string' ? savedScoring.promptPrefix : '',
    scoringSuffix: typeof savedScoring.promptSuffix === 'string' ? savedScoring.promptSuffix : '',
    drivers,
    pushbacks,
    customerPrefix: typeof saved.customerPromptPrefix === 'string' ? saved.customerPromptPrefix : '',
    customerSuffix: typeof saved.customerPromptSuffix === 'string' ? saved.customerPromptSuffix : '',
    rag,
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

/**
 * `rag` is being added to `SimulationConfig` by another engineer in parallel;
 * intersect it locally rather than editing that shared type so this compiles
 * whether or not the upstream field has landed yet. The cast at the save
 * boundary (`as unknown as Record<string, unknown>`) already erases this to
 * a plain object, so the intersection is purely a local typing convenience.
 */
type MinimalConfig = SimulationConfig & { rag?: { enabled: boolean; k: number } };

function buildMinimalConfig(draft: Draft): MinimalConfig {
  const def = defaultSimulationConfig();
  const out: MinimalConfig = {};

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

  // Retrieval (RAG) — only emitted when it differs from the built-in default.
  if (draft.rag.enabled !== DEFAULT_RAG.enabled || draft.rag.k !== DEFAULT_RAG.k) {
    out.rag = { enabled: draft.rag.enabled, k: draft.rag.k };
  }

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

// ─── Labelled field with an "explain this" modal ────────────────────────────────
//
// `Field` (FlagsScreen) takes a plain string label, so a field that needs the
// "?" affordance next to its label renders the label row itself. Same type
// treatment as Field so the two sit together without looking different.

const monoLabel: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 800,
  textTransform: 'uppercase',
  letterSpacing: '0.10em',
  color: COLOR.inkMute,
  fontFamily: 'var(--pbt-mono)',
};

function FieldWithInfo({
  label,
  help,
  infoTitle,
  info,
  children,
}: {
  label: string;
  help?: string;
  infoTitle?: string;
  info: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
        <span style={monoLabel}>{label}</span>
        <InfoTip title={infoTitle ?? label}>{info}</InfoTip>
      </div>
      {children}
      {help && (
        <div style={{ fontSize: 11, color: COLOR.inkMute, marginTop: 4 }}>{help}</div>
      )}
    </div>
  );
}

/** Ordered read-out of how a system prompt is assembled, admin-owned parts lit up. */
function PromptStack({ lines }: { lines: Array<{ text: string; admin?: boolean }> }) {
  return (
    <div
      style={{
        display: 'grid',
        gap: 4,
        marginTop: 10,
        padding: 12,
        borderRadius: 12,
        background: 'rgba(60,20,15,0.04)',
        fontFamily: 'var(--pbt-mono)',
        fontSize: 11.5,
      }}
    >
      {lines.map((l) => (
        <div
          key={l.text}
          style={{
            color: l.admin ? COLOR.brand : COLOR.inkMute,
            fontWeight: l.admin ? 800 : 600,
          }}
        >
          {l.admin ? '▸ ' : '  '}
          {l.text}
        </div>
      ))}
    </div>
  );
}

const CAP_NOTE = (
  <p style={{ margin: '12px 0 0', color: COLOR.inkMute, fontSize: 12.5 }}>
    Whitespace is trimmed and the text is capped at 1,500 characters, so a long
    note can never bury the canonical briefing underneath it. Leave it empty to
    inject nothing at all.
  </p>
);

const CUSTOMER_PREFIX_INFO = (
  <>
    <p style={{ margin: 0 }}>
      This text is placed at the very top of every simulated customer&apos;s
      system prompt, under an <strong>ADMIN NOTES</strong> heading, before the
      canonical briefing that defines the pet, the pushback, and the driver
      persona. Scenario-level opening notes are appended just after it, so this
      global note is the outermost one and applies platform-wide.
    </p>
    <PromptStack
      lines={[
        { text: '# ADMIN NOTES', admin: true },
        { text: '  ← this field (global)', admin: true },
        { text: '  ← the scenario’s own opening note' },
        { text: 'Canonical customer briefing (dog, pushback, driver, difficulty)' },
        { text: '# ADMIN ADDENDUM' },
        { text: '  ← the scenario’s own closing note' },
        { text: '  ← the global closing note' },
      ]}
    />
    <p style={{ margin: '12px 0 0' }}>
      Use it for behaviour that should hold in every simulation — for example
      “Never use emoji.” or “Speak as a first-time dog owner unless told
      otherwise.”
    </p>
    {CAP_NOTE}
  </>
);

const CUSTOMER_SUFFIX_INFO = (
  <>
    <p style={{ margin: 0 }}>
      This text is the last thing the simulated customer reads, appended under
      an <strong>ADMIN ADDENDUM</strong> heading after the canonical briefing
      <em>and</em> after any scenario-level closing note — so it wraps outermost
      and gets the final word.
    </p>
    <PromptStack
      lines={[
        { text: '# ADMIN NOTES' },
        { text: '  ← the global opening note' },
        { text: '  ← the scenario’s own opening note' },
        { text: 'Canonical customer briefing (dog, pushback, driver, difficulty)' },
        { text: '# ADMIN ADDENDUM', admin: true },
        { text: '  ← the scenario’s own closing note' },
        { text: '  ← this field (global)', admin: true },
      ]}
    />
    <p style={{ margin: '12px 0 0' }}>
      Good for reminders that must not be forgotten mid-conversation — for
      example “Stay in character even if the trainee asks you to break it.”
    </p>
    {CAP_NOTE}
  </>
);

const SCORING_PREFIX_INFO = (
  <>
    <p style={{ margin: 0 }}>
      This shapes the <strong>AI evaluator</strong> that writes the scorecard
      after a session — not the customer the trainee talks to. It is prepended
      raw, ahead of the coach framing and the rubric, so it is the first
      instruction the scorer sees.
    </p>
    <PromptStack
      lines={[
        { text: '← this field (raw, no heading)', admin: true },
        { text: 'ACT coach framing + “be precise, actionable, non-shaming”' },
        { text: 'Scenario recap + the 5-dimension rubric with weights' },
        { text: '# ADMIN SCORING ADDENDUM' },
        { text: '  ← the scoring closing note' },
      ]}
    />
    <p style={{ margin: '12px 0 0' }}>
      Use it to set the evaluator&apos;s stance — for example “Assume the
      trainee is in their first month on the floor.” Editing it changes how
      future sessions are scored; it never rewrites past scorecards.
    </p>
    {CAP_NOTE}
  </>
);

const SCORING_SUFFIX_INFO = (
  <>
    <p style={{ margin: 0 }}>
      Appended to the end of the <strong>AI evaluator&apos;s</strong>{' '}
      instructions under an <strong>ADMIN SCORING ADDENDUM</strong> heading —
      after the rubric and the band examples. It affects the scorecard, not the
      simulated customer.
    </p>
    <PromptStack
      lines={[
        { text: '← the scoring opening note' },
        { text: 'ACT coach framing + “be precise, actionable, non-shaming”' },
        { text: 'Scenario recap + the 5-dimension rubric with weights' },
        { text: '# ADMIN SCORING ADDENDUM', admin: true },
        { text: '  ← this field', admin: true },
      ]}
    />
    <p style={{ margin: '12px 0 0' }}>
      Good for output-shaping rules — for example “Always name one concrete
      phrase the trainee could have used instead.”
    </p>
    {CAP_NOTE}
  </>
);

const WEIGHT_INFO = (
  <>
    <p style={{ margin: 0 }}>
      Relative importance — the five weights are auto-balanced to 100%, so only
      their ratios matter. Doubling every weight changes nothing; doubling one
      of them doubles its share.
    </p>
    <p style={{ margin: '12px 0 0' }}>
      Changing weights changes how the <strong>overall</strong> score is
      computed from here on. Sessions already scored keep the overall they were
      given — old scorecards are never silently rewritten.
    </p>
  </>
);

const RETRIEVAL_INFO = (
  <>
    <p style={{ margin: 0 }}>
      When retrieval is on, the app looks up the most relevant chunks of the
      knowledge base <strong>once per session</strong> — at the moment the
      simulation opens — and threads them into both the customer prompt and the
      scoring prompt for the whole conversation. It is not re-run on every turn.
    </p>
    <p style={{ margin: '12px 0 0' }}>
      <strong>k</strong> is how many chunks that single lookup pulls in. Higher
      k means richer grounding but a longer prompt (and a slightly slower, more
      expensive call). Retrieval fails open: if the lookup errors, the session
      still runs on the built-in knowledge.
    </p>
  </>
);

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
  const [note, setNote] = useState('');
  const [historyOpen, setHistoryOpen] = useState(false);

  /** Rebuild the draft + its dirty-baseline from a config object. */
  function applyConfig(config: Record<string, unknown>) {
    const d = buildDraft(config);
    setDraft(d);
    baselineRef.current = JSON.stringify(d);
    if (Object.keys(d.pushbacks).length) {
      setSelectedPushback((prev) => prev ?? Object.keys(d.pushbacks)[0]);
    }
  }

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
      await saveSimulationConfigWithNote(
        minimal as unknown as Record<string, unknown>,
        note,
      );
      baselineRef.current = JSON.stringify(draft);
      setNote('');
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

  async function handleRestore(version: SimulationVersion) {
    const { config } = await restoreSimulationVersion(version.id);
    applyConfig(config);
    setHistoryOpen(false);
    setSaveStatus('saved');
    setRefreshKey((k) => k + 1);
    setTimeout(() => setSaveStatus('idle'), 3000);
  }

  const totalWeight = draft
    ? draft.dims.reduce((s, d) => s + (d.weight > 0 ? d.weight : 0), 0)
    : 0;

  return (
    <>
      <ContextBar
        title="Simulation config"
        subtitle="Tune AI customer personas, the scoring rubric, and prompt injections — no deploy needed. Changes go live within a minute."
        actions={
          <button
            onClick={() => setHistoryOpen(true)}
            style={{ ...btnSecondary, height: 40 }}
          >
            ↺ History
          </button>
        }
      />
      <HistoryModal
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        currentConfig={snapshot.data}
        onRestore={handleRestore}
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
                  <input
                    value={note}
                    onChange={(e) => setNote(e.target.value.slice(0, 200))}
                    placeholder="What changed? (optional — shows in history)"
                    aria-label="Version description (optional)"
                    style={{ ...inputStyle, width: 300, maxWidth: '100%' }}
                  />
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
                <FieldWithInfo
                  label="Weight"
                  infoTitle="Dimension weight"
                  info={WEIGHT_INFO}
                  help="Relative importance — auto-balanced, so only the ratios matter."
                >
                  <input
                    type="number"
                    min={0}
                    step={0.01}
                    value={dim.weight}
                    onChange={(e) => patchDim(idx, { weight: parseFloat(e.target.value) || 0 })}
                    style={inputStyle}
                  />
                </FieldWithInfo>
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

      <Collapsible
        title="Extra instructions for the AI scorer"
        badge={<span style={{ fontSize: 11, color: COLOR.inkMute }}>optional</span>}
      >
        <div style={{ display: 'grid', gap: 12 }}>
          <p style={{ margin: 0, fontSize: 12.5, color: COLOR.inkMute, lineHeight: 1.55 }}>
            These two notes are wrapped around the evaluator&apos;s instructions —
            the AI that writes the scorecard <em>after</em> a session. They do not
            change how the simulated customer behaves.
          </p>
          <FieldWithInfo
            label="Opening notes for the AI scorer"
            infoTitle="Opening notes for the AI scorer"
            info={SCORING_PREFIX_INFO}
            help="Placed above everything else the evaluator reads, before the rubric. Sets its stance."
          >
            <textarea value={draft.scoringPrefix} rows={4} onChange={(e) => onPatch({ scoringPrefix: e.target.value })} style={textareaStyle} placeholder="(none)" />
          </FieldWithInfo>
          <FieldWithInfo
            label="Closing notes for the AI scorer"
            infoTitle="Closing notes for the AI scorer"
            info={SCORING_SUFFIX_INFO}
            help="Added after the rubric and band examples — the evaluator's last instruction."
          >
            <textarea value={draft.scoringSuffix} rows={4} onChange={(e) => onPatch({ scoringSuffix: e.target.value })} style={textareaStyle} placeholder="(none)" />
          </FieldWithInfo>
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
  function setRag(p: Partial<DraftRag>) {
    onPatch({ rag: { ...draft.rag, ...p } });
  }
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <Glass padding={18} radius={16}>
        <SectionTitle
          title="Notes for every AI customer"
          subtitle="Wrapped around the briefing of every simulated customer, outside any per-scenario notes."
        />
        <div style={{ display: 'grid', gap: 12, marginTop: 14 }}>
          <FieldWithInfo
            label="Opening notes for every AI customer"
            infoTitle="Opening notes for every AI customer"
            info={CUSTOMER_PREFIX_INFO}
            help="Added at the very top of every simulated customer's briefing, before any per-scenario notes. Use it for platform-wide behaviour — e.g. “Never use emoji.”"
          >
            <textarea value={draft.customerPrefix} rows={5} onChange={(e) => onPatch({ customerPrefix: e.target.value })} style={textareaStyle} placeholder="(none)" />
          </FieldWithInfo>
          <FieldWithInfo
            label="Closing notes for every AI customer"
            infoTitle="Closing notes for every AI customer"
            info={CUSTOMER_SUFFIX_INFO}
            help="Added at the very end of the briefing, after any per-scenario notes — the last thing the customer reads."
          >
            <textarea value={draft.customerSuffix} rows={5} onChange={(e) => onPatch({ customerSuffix: e.target.value })} style={textareaStyle} placeholder="(none)" />
          </FieldWithInfo>
        </div>
      </Glass>

      <Glass padding={18} radius={16}>
        <SectionTitle title="Retrieval (RAG)" subtitle="Pull relevant knowledge-base chunks into the customer + scoring prompts, once at the start of each session." />
        <div style={{ display: 'flex', gap: 20, alignItems: 'flex-end', marginTop: 14, flexWrap: 'wrap' }}>
          <Field label="Enabled">
            <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                type="checkbox"
                checked={draft.rag.enabled}
                onChange={(e) => setRag({ enabled: e.target.checked })}
              />
              {draft.rag.enabled ? 'On' : 'Off'}
            </label>
          </Field>
          <FieldWithInfo
            label="k"
            infoTitle="Retrieval (RAG)"
            info={RETRIEVAL_INFO}
            help="Knowledge chunks pulled in once per session (1–8) — not per turn."
          >
            <input
              type="number"
              min={1}
              max={8}
              value={draft.rag.k}
              onChange={(e) => {
                const n = parseInt(e.target.value, 10);
                setRag({ k: Number.isFinite(n) ? Math.max(1, Math.min(8, n)) : DEFAULT_RAG.k });
              }}
              style={{ ...inputStyle, maxWidth: 100 }}
            />
          </FieldWithInfo>
        </div>
      </Glass>
    </div>
  );
}
