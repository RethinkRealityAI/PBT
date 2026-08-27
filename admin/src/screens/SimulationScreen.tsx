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
  resolveWeights,
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
  isDefaultConfig,
  isSimulationConflict,
  resetConsequences,
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
import { InlineAlert } from '../primitives/form';
import { ReadOnlyBanner, useCan } from '../primitives/access';
import { useConfirm } from '../primitives/Confirm';
import { useToast } from '../primitives/Toast';
import { ContextBar, ScreenShell } from '../primitives/Shell';
import { QueryBoundary } from '../primitives/QueryBoundary';
import { postJson } from '../lib/api';
import { COLOR } from '../lib/tokens';
import { fmtAgo } from '../lib/format';
import { Field, inputStyle, textareaStyle, btnPrimary, btnSecondary } from './FlagsScreen';

// ─── Draft state (everything fully populated so the UI never guards undefined) ─

interface DraftDimension {
  key: DimensionKey;
  label: string;
  description: string;
  /**
   * Whole percent, 0–100 — the unit the editor speaks. The stored config uses
   * a 0–1 fraction, so `buildDraft` divides in and `buildMinimalConfig`
   * multiplies back out; nothing in between ever sees a decimal.
   */
  weightPct: number;
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

/** Stored fraction (0.24) → the whole percent the editor edits (24). */
const toPct = (weight: number) => Math.round(weight * 100);

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
      weightPct: toPct(typeof o?.weight === 'number' ? o.weight : d.weight),
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

/** Both halves of the editor's output: the shared config plus its retrieval knobs. */
type MinimalConfig = SimulationConfig;

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
    if (d.weightPct !== toPct(base.weight)) { o.weight = d.weightPct / 100; changed = true; }
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

// ─── Weight read-outs ───────────────────────────────────────────────────────────

/**
 * A dimension's share of the overall score, in the accordion header.
 *
 * This is the NORMALISED share (weight ÷ the sum of all five), not the number
 * typed in the box — those only agree when the five happen to add to 100, and
 * the share is what actually reaches a trainee's scorecard.
 */
function SharePill({ pct }: { pct: number }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'baseline',
        gap: 4,
        padding: '3px 9px',
        borderRadius: 999,
        background: COLOR.brandSoft,
        color: COLOR.brand,
        fontSize: 12,
        fontWeight: 800,
        whiteSpace: 'nowrap',
      }}
    >
      {pct}%
      <span style={{ fontSize: 10.5, fontWeight: 700, opacity: 0.75 }}>of the score</span>
    </span>
  );
}

/** One tint per segment, walked down from the brand colour so the bar reads as
 *  a single quantity split five ways rather than five unrelated colours. */
const segmentFill = (i: number) =>
  `color-mix(in oklab, ${COLOR.brand} ${92 - i * 16}%, ${COLOR.brandSoft})`;

/**
 * All five shares in ONE bar, plus a legend.
 *
 * Five separate percentages leave the reader to add them up and trust that the
 * total is 100; a single stacked bar shows it. This is the only place on the
 * screen where the balance of the rubric is visible as a balance.
 */
function WeightStack({
  segments,
}: {
  segments: Array<{ key: string; label: string; pct: number }>;
}) {
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <div
        style={{
          display: 'flex',
          height: 22,
          borderRadius: 999,
          overflow: 'hidden',
          background: COLOR.borderSoft,
        }}
      >
        {segments.map((seg, i) => (
          <div
            key={seg.key}
            title={`${seg.label} — ${seg.pct}%`}
            style={{
              width: `${seg.pct}%`,
              background: segmentFill(i),
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fff',
              fontSize: 11,
              fontWeight: 800,
              overflow: 'hidden',
              transition: 'width 0.25s ease',
            }}
          >
            {seg.pct >= 8 ? `${seg.pct}%` : ''}
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 16px' }}>
        {segments.map((seg, i) => (
          <span
            key={seg.key}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: COLOR.inkSoft }}
          >
            <span
              aria-hidden
              style={{
                width: 10,
                height: 10,
                borderRadius: 3,
                background: segmentFill(i),
                display: 'inline-block',
              }}
            />
            {seg.label}
            <strong style={{ color: COLOR.ink }}>{seg.pct}%</strong>
          </span>
        ))}
      </div>
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
      How much this dimension counts towards the single 0–100 score a trainee
      sees. The five are balanced to add up to 100% automatically, so you can
      type whatever numbers feel right — only their sizes relative to each other
      matter. Enter 50 for one and 10 for another and the first counts five
      times as much.
    </p>
    <p style={{ margin: '12px 0 0' }}>
      Because of that balancing, the number you type and the share shown beside
      it only match when your five happen to add to 100. The share is what
      actually reaches a scorecard.
    </p>
    <p style={{ margin: '12px 0 0' }}>
      Changing these changes how the <strong>overall</strong> score is worked
      out from here on. Sessions already scored keep the score they were given —
      old scorecards are never rewritten.
    </p>
  </>
);

const BAND_EXAMPLE_INFO = (
  <>
    <p style={{ margin: 0 }}>
      These two lines are handed to the AI that marks each session, word for
      word, as its only guide to what a top and a bottom answer sound like for
      this dimension. Everything between the two — most real answers — is judged
      by how close it lands to one or the other.
    </p>
    <p style={{ margin: '12px 0 0' }}>
      Write them as things a team member would actually say to a pet owner, not
      as descriptions of good behaviour. &ldquo;I can hear how worried you
      are about him&rdquo; teaches the marker far more than &ldquo;shows
      empathy&rdquo;.
    </p>
    <p style={{ margin: '12px 0 0' }}>
      They are the strongest lever on this screen: rewriting one moves every
      future score for that dimension. Use <strong>Try this rubric</strong>
      {' '}below to see the effect before you save.
    </p>
  </>
);

const RETRIEVAL_INFO = (
  <>
    <p style={{ margin: 0 }}>
      When this is on, the app searches your knowledge library
      <strong> once at the start of each session</strong> — the moment the
      roleplay opens — and puts the sections it finds into the pet owner&apos;s
      briefing and the marker&apos;s instructions for the whole conversation. It
      does not search again on every reply.
    </p>
    <p style={{ margin: '12px 0 0' }}>
      The number sets how many sections that one search brings back. More
      sections mean richer background, but a longer briefing and a slightly
      slower, more expensive session. If the search fails, the session still
      runs on the knowledge built into the app.
    </p>
  </>
);

// ─── Main screen ───────────────────────────────────────────────────────────────

type Tab = 'scoring' | 'drivers' | 'pushbacks' | 'global';
const TAB_LABELS: Record<Tab, string> = {
  scoring: 'Scoring',
  drivers: 'Drivers',
  pushbacks: 'Pushbacks',
  global: 'Every conversation',
};

export function SimulationScreen() {
  const [refreshKey, setRefreshKey] = useState(0);
  const snapshot = useAdminSimulationConfig(refreshKey);
  const toast = useToast();
  const confirm = useConfirm();
  const canWrite = useCan()('simulation.write');
  const [tab, setTab] = useState<Tab>('scoring');
  const [draft, setDraft] = useState<Draft | null>(null);
  const baselineRef = useRef<string>('');
  /**
   * The `updated_at` this editor loaded. Sent back as `baseUpdatedAt` so a save
   * that would clobber someone else's newer save 409s instead.
   */
  const [baseUpdatedAt, setBaseUpdatedAt] = useState<string | null>(null);
  const [conflict, setConflict] = useState<{ updatedAt: string | null } | null>(null);

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
  function applyConfig(config: Record<string, unknown>, updatedAt: string | null) {
    const d = buildDraft(config);
    setDraft(d);
    baselineRef.current = JSON.stringify(d);
    setBaseUpdatedAt(updatedAt);
    if (Object.keys(d.pushbacks).length) {
      setSelectedPushback((prev) => prev ?? Object.keys(d.pushbacks)[0]);
    }
  }

  // Initialise the draft from the loaded config exactly once it arrives.
  //
  // The `error` guard is load-bearing: a failed GET used to leave `data` at the
  // `{}` fallback, which built a pristine defaults draft indistinguishable from
  // "nothing is customised" — and saving from there wiped every real setting.
  useEffect(() => {
    if (snapshot.loading || snapshot.error || draft) return;
    applyConfig(snapshot.data.config, snapshot.data.updated_at);
  }, [snapshot.loading, snapshot.error, snapshot.data, draft]);

  const dirty = useMemo(
    () => (draft ? JSON.stringify(draft) !== baselineRef.current : false),
    [draft],
  );

  // Unsaved edits survive a stray ⌘W / tab close only if the browser asks.
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);

  function patch(p: Partial<Draft>) {
    setDraft((prev) => (prev ? { ...prev, ...p } : prev));
  }

  async function handleReset() {
    if (!draft) return;
    const current = buildMinimalConfig(draft) as unknown as Record<string, unknown>;
    const ok = await confirm({
      title: 'Reset every simulation setting to its default?',
      body: 'This clears the whole draft — scoring, drivers, pushbacks and prompt notes all go back to what the app ships with.',
      consequences: resetConsequences(current),
      confirmLabel: 'Reset everything',
      tone: 'danger',
    });
    if (!ok) return;
    setDraft(buildDraft({}));
  }

  /** @param force skip the concurrency token — "save anyway" after a conflict. */
  async function handleSave(force = false) {
    if (!draft) return;
    setSaving(true);
    setSaveStatus('idle');
    setSaveError(null);
    try {
      const minimal = buildMinimalConfig(draft);
      const res = await saveSimulationConfigWithNote(
        minimal as unknown as Record<string, unknown>,
        note,
        force ? null : baseUpdatedAt,
      );
      baselineRef.current = JSON.stringify(draft);
      setBaseUpdatedAt(res.updated_at);
      setConflict(null);
      setNote('');
      setSaveStatus('saved');
      setRefreshKey((k) => k + 1);
      toast({ message: 'Simulation settings saved — live within a minute.', tone: 'success' });
      setTimeout(() => setSaveStatus('idle'), 3000);
    } catch (err) {
      if (isSimulationConflict(err)) {
        setConflict({ updatedAt: err.updatedAt });
        setSaveStatus('idle');
        toast({
          message: 'Not saved — someone else changed these settings while you were editing.',
          tone: 'error',
        });
        return;
      }
      const message = err instanceof Error ? err.message : 'Save failed';
      setSaveStatus('error');
      setSaveError(message);
      toast({ message: `Save failed — ${message}`, tone: 'error' });
    } finally {
      setSaving(false);
    }
  }

  /** Discard local edits and rebuild the draft from whatever is on the server. */
  async function reloadTheirVersion() {
    if (dirty) {
      const ok = await confirm({
        title: 'Discard your unsaved changes?',
        body: 'Loading the version that is on the server replaces everything you have edited here.',
        consequences: ['Your current edits are lost — they were never saved.'],
        confirmLabel: 'Discard and reload',
        tone: 'danger',
      });
      if (!ok) return;
    }
    setConflict(null);
    setDraft(null);
    setRefreshKey((k) => k + 1);
  }

  async function saveAnyway() {
    const ok = await confirm({
      title: 'Overwrite the other admin’s save?',
      body: 'Your version replaces theirs for the whole platform.',
      consequences: [
        'Their changes stop applying to new sessions immediately.',
        'Their version stays in History, so it can be restored.',
      ],
      confirmLabel: 'Overwrite',
      tone: 'danger',
    });
    if (!ok) return;
    await handleSave(true);
  }

  async function handleRestore(version: SimulationVersion) {
    try {
      const res = await restoreSimulationVersion(version.id, baseUpdatedAt);
      applyConfig(res.config, res.updated_at);
      setHistoryOpen(false);
      setSaveStatus('saved');
      setRefreshKey((k) => k + 1);
      toast({ message: 'Version restored — the previous settings are still in History.', tone: 'success' });
      setTimeout(() => setSaveStatus('idle'), 3000);
    } catch (err) {
      if (isSimulationConflict(err)) {
        setConflict({ updatedAt: err.updatedAt });
        setHistoryOpen(false);
        toast({
          message: 'Not restored — someone else saved these settings in the meantime.',
          tone: 'error',
        });
        return;
      }
      toast({
        message: `Restore failed — ${err instanceof Error ? err.message : 'unknown error'}`,
        tone: 'error',
      });
      // Re-thrown so the row that started it can drop its busy state and show
      // the reason in place, for whoever is looking at the modal.
      throw err;
    }
  }

  return (
    <>
      <ContextBar
        title="Roleplay & scoring"
        subtitle="Set how the AI pet owner behaves and how sessions are marked. You can change all of it here — no developer needed — and it reaches everyone within a minute."
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
        currentConfig={snapshot.data.config}
        canRestore={canWrite}
        onRestore={handleRestore}
      />
      <ScreenShell>
        <ReadOnlyBanner permission="simulation.write" />
        {/*
          A failed load is a hard stop, not an empty editor. Without the saved
          config every field would show its code default, indistinguishable
          from "nothing is customised" — and saving from there would overwrite
          the live settings with defaults.
        */}
        <QueryBoundary
          query={snapshot}
          title="Couldn’t load these settings — nothing is editable until they load"
          showLoading={false}
        >
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
                <ScoringTab draft={draft} onPatch={patch} />
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
                    {canWrite && (
                      <button
                        onClick={() => void handleSave()}
                        disabled={saving || !dirty}
                        style={{ ...btnPrimary, opacity: saving || !dirty ? 0.5 : 1 }}
                      >
                        {saving ? 'Saving…' : 'Save changes'}
                      </button>
                    )}
                    {canWrite && (
                      <input
                        value={note}
                        onChange={(e) => setNote(e.target.value.slice(0, 200))}
                        placeholder="What changed? (optional — shows in history)"
                        aria-label="Version description (optional)"
                        style={{ ...inputStyle, width: 300, maxWidth: '100%' }}
                      />
                    )}
                    {canWrite && (
                      <button
                        onClick={() => void handleReset()}
                        style={{ ...btnSecondary, color: COLOR.danger, borderColor: 'color-mix(in oklab, oklch(0.58 0.20 25) 30%, transparent)' }}
                      >
                        Reset all to defaults
                      </button>
                    )}
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
                    {conflict && (
                      <InlineAlert
                        tone="warn"
                        title="Someone else saved these settings while you were editing."
                        style={{ flexBasis: '100%' }}
                      >
                        <div>
                          Your changes were not written.
                          {conflict.updatedAt
                            ? ` Their version was saved ${fmtAgo(new Date(conflict.updatedAt).getTime())}.`
                            : ''}{' '}
                          Load theirs and redo your edits on top, or overwrite them — their
                          version stays in History either way.
                        </div>
                        <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                          <button onClick={() => void reloadTheirVersion()} style={btnPrimary}>
                            Reload their version
                          </button>
                          <button
                            onClick={() => void saveAnyway()}
                            disabled={saving}
                            style={{ ...btnSecondary, color: COLOR.danger }}
                          >
                            Save anyway
                          </button>
                        </div>
                      </InlineAlert>
                    )}
                  </div>
                </Glass>
              </div>
            </>
          )}
        </QueryBoundary>
      </ScreenShell>
    </>
  );
}

// ─── Scoring tab ────────────────────────────────────────────────────────────────

/**
 * Anything an admin types here is shown to trainees verbatim in every language
 * — only untouched text carries a translation. Worth saying on each tab that
 * edits trainee-visible wording.
 */
const LOCALE_NOTE =
  'Wording you change here is shown to every trainee exactly as you type it, in all languages. Anything you leave alone stays translated (English + French).';

function ScoringTab({
  draft,
  onPatch,
}: {
  draft: Draft;
  onPatch: (p: Partial<Draft>) => void;
}) {
  function patchDim(idx: number, p: Partial<DraftDimension>) {
    onPatch({ dims: draft.dims.map((d, i) => (i === idx ? { ...d, ...p } : d)) });
  }

  /*
    Resolved the same way a live session resolves them, rather than re-derived
    here: same normalisation, same "all zero falls back to the built-in
    weighting" safety net. Re-deriving is how the header and the scorecard end
    up disagreeing.
  */
  const shares = useMemo(() => {
    const resolved = resolveWeights({
      scoring: {
        dimensions: draft.dims.map((d) => ({ key: d.key, weight: d.weightPct / 100 })),
      },
    });
    const out = {} as Record<DimensionKey, number>;
    for (const d of draft.dims) out[d.key] = Math.round((resolved[d.key] ?? 0) * 100);
    // Rounding five fractions independently can total 99 or 101, which makes a
    // liar of the "these add up to 100%" claim right beside them. The residual
    // lands on the largest share, where a single point is least visible.
    const residual = 100 - draft.dims.reduce((sum, d) => sum + out[d.key], 0);
    if (residual !== 0 && draft.dims.length > 0) {
      const biggest = draft.dims.reduce((a, b) => (out[a.key] >= out[b.key] ? a : b));
      out[biggest.key] += residual;
    }
    return out;
  }, [draft.dims]);
  const pctOf = (key: DimensionKey) => shares[key] ?? 0;
  const allZero = draft.dims.every((d) => d.weightPct <= 0);

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <SectionTitle
        title="Scoring rubric"
        subtitle="Five things every session is marked on. Set how much each one counts, and give the marker an example of a great answer and a weak one."
      />

      <Glass padding={18} radius={16}>
        <div style={{ display: 'grid', gap: 12 }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 800, color: COLOR.ink }}>
              How the 0–100 score is made up
            </div>
            <div style={{ fontSize: 12.5, color: COLOR.inkMute, marginTop: 3 }}>
              These five always add up to 100% — raising one lowers the others.
            </div>
          </div>
          <WeightStack
            segments={draft.dims.map((d) => ({
              key: d.key,
              label: d.label || d.key,
              pct: pctOf(d.key),
            }))}
          />
          {allZero && (
            <InlineAlert tone="warn" title="Every dimension is set to 0%">
              A rubric where nothing counts can&apos;t produce a score, so sessions
              would fall back to the built-in weighting shown above. Give at least
              one dimension a weight above zero.
            </InlineAlert>
          )}
        </div>
      </Glass>

      <div style={{ fontSize: 11.5, color: COLOR.inkMute, lineHeight: 1.5 }}>{LOCALE_NOTE}</div>

      {draft.dims.map((dim, idx) => (
        <Collapsible
          key={dim.key}
          title={dim.label || dim.key}
          badge={<SharePill pct={pctOf(dim.key)} />}
        >
          <div style={{ display: 'grid', gap: 12 }}>
            <div style={TWO_COL}>
              <Field label="Name shown to trainees">
                <input value={dim.label} onChange={(e) => patchDim(idx, { label: e.target.value })} style={inputStyle} />
              </Field>
              <FieldWithInfo
                label="How much it counts"
                infoTitle="How much a dimension counts"
                info={WEIGHT_INFO}
                help={`Currently ${pctOf(dim.key)}% of the overall score, after all five are balanced to 100%.`}
              >
                <div style={{ position: 'relative' }}>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step={1}
                    value={dim.weightPct}
                    onChange={(e) => {
                      const n = parseInt(e.target.value, 10);
                      patchDim(idx, {
                        weightPct: Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : 0,
                      });
                    }}
                    aria-label={`${dim.label || dim.key} weight, percent`}
                    style={{ ...inputStyle, paddingRight: 30 }}
                  />
                  <span
                    aria-hidden
                    style={{
                      position: 'absolute',
                      right: 11,
                      top: '50%',
                      transform: 'translateY(-50%)',
                      fontSize: 12.5,
                      fontWeight: 800,
                      color: COLOR.inkMute,
                      pointerEvents: 'none',
                    }}
                  >
                    %
                  </span>
                </div>
              </FieldWithInfo>
            </div>
            <Field label="Description">
              <textarea value={dim.description} rows={2} onChange={(e) => patchDim(idx, { description: e.target.value })} style={proseArea} />
            </Field>
            <div style={TWO_COL}>
              <FieldWithInfo
                label="What a great answer sounds like"
                infoTitle="Great and weak answer examples"
                info={BAND_EXAMPLE_INFO}
                help="Shown to the AI marker as the anchor for a score of 85 or above. Write it as a line someone would actually say."
              >
                <textarea value={dim.excellentExample} rows={3} onChange={(e) => patchDim(idx, { excellentExample: e.target.value })} style={proseArea} />
              </FieldWithInfo>
              <FieldWithInfo
                label="What a weak answer sounds like"
                infoTitle="Great and weak answer examples"
                info={BAND_EXAMPLE_INFO}
                help="The anchor for a score below 70. The two together are all the marker has to calibrate this dimension."
              >
                <textarea value={dim.needsWorkExample} rows={3} onChange={(e) => patchDim(idx, { needsWorkExample: e.target.value })} style={proseArea} />
              </FieldWithInfo>
            </div>
          </div>
        </Collapsible>
      ))}

      <TryRubricPanel draft={draft} />

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

// ─── "Try this rubric" — score a sample conversation with the unsaved draft ─────
//
// Saving is live for every trainee within a minute, so the only honest way to
// judge a weighting or a rewritten example is to run it first. The draft is
// posted to `admin-score-preview`, which scores with it and writes nothing.

interface PreviewTurn {
  role: 'user' | 'ai';
  text: string;
}

interface ScorePreview {
  scenario: {
    breed: string;
    pushback: string;
    persona: string;
    driver: string;
    difficulty: number;
  };
  transcript: PreviewTurn[];
  dimensions: Array<{ key: string; label: string; score: number; sharePct: number }>;
  overall: number;
  band: 'good' | 'ok' | 'poor';
  critique: string;
}

const BAND_LABEL: Record<ScorePreview['band'], string> = {
  good: 'Strong',
  ok: 'Solid',
  poor: 'Needs work',
};
const BAND_TONE: Record<ScorePreview['band'], 'success' | 'warn' | 'danger'> = {
  good: 'success',
  ok: 'warn',
  poor: 'danger',
};

const SPEAKER_LABEL: Record<PreviewTurn['role'], string> = {
  user: 'Team member',
  ai: 'Pet owner',
};

/**
 * Parse a pasted conversation. Each turn starts with a speaker prefix;
 * continuation lines fold into the turn above so pasted paragraphs survive.
 */
function parsePastedTranscript(text: string): PreviewTurn[] | null {
  const turns: PreviewTurn[] = [];
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const match = /^(team member|staff|me|pet owner|owner|customer|client)\s*:\s*(.*)$/i.exec(trimmed);
    if (match) {
      const who = match[1].toLowerCase();
      const role: PreviewTurn['role'] =
        who === 'team member' || who === 'staff' || who === 'me' ? 'user' : 'ai';
      turns.push({ role, text: match[2].trim() });
      continue;
    }
    if (turns.length === 0) return null;
    turns[turns.length - 1].text = `${turns[turns.length - 1].text} ${trimmed}`.trim();
  }
  const usable = turns.filter((t) => t.text.length > 0);
  return usable.length > 0 ? usable : null;
}

function TryRubricPanel({ draft }: { draft: Draft }) {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<ScorePreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ownOpen, setOwnOpen] = useState(false);
  const [ownText, setOwnText] = useState('');

  async function run() {
    let transcript: PreviewTurn[] | null = null;
    if (ownOpen && ownText.trim()) {
      transcript = parsePastedTranscript(ownText);
      if (!transcript) {
        setError('Start each line with “Team member:” or “Pet owner:” so we know who is speaking.');
        return;
      }
    }
    setRunning(true);
    setError(null);
    try {
      const res = await postJson<ScorePreview>('admin-score-preview', {
        config: buildMinimalConfig(draft),
        transcript,
      });
      setResult(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The test run failed');
    } finally {
      setRunning(false);
    }
  }

  return (
    <Glass padding={18} radius={16}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
        <SectionTitle
          title="Try this rubric"
          subtitle="Mark a sample conversation with the settings as they stand right now — including changes you haven't saved."
        />
        <StatusPill tone="info" dot={false}>Test only — nothing is saved</StatusPill>
      </div>

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginTop: 14 }}>
        <button
          onClick={() => void run()}
          disabled={running}
          style={{ ...btnPrimary, opacity: running ? 0.6 : 1 }}
        >
          {running ? 'Marking…' : result ? 'Run it again' : 'Run the test'}
        </button>
        <button
          onClick={() => setOwnOpen((o) => !o)}
          style={{ ...btnSecondary, fontSize: 12 }}
        >
          {ownOpen ? 'Use the sample conversation' : 'Paste my own conversation'}
        </button>
        <span style={{ fontSize: 11.5, color: COLOR.inkMute }}>
          Takes a few seconds. No trainee sees this, and your settings stay exactly as they are.
        </span>
      </div>

      {ownOpen && (
        <div style={{ marginTop: 12 }}>
          <Field
            label="Your conversation"
            help="One turn per line, each starting with “Team member:” or “Pet owner:”. Leave it empty to use the sample."
          >
            <textarea
              value={ownText}
              rows={6}
              onChange={(e) => setOwnText(e.target.value)}
              placeholder={'Pet owner: He\'s not fat, he\'s just a big Lab.\nTeam member: I hear you — can I ask what a normal day of food looks like for him?'}
              style={proseArea}
            />
          </Field>
        </div>
      )}

      {error && (
        <InlineAlert tone="error" title="Couldn’t run the test" style={{ marginTop: 12 }}>
          {error}
        </InlineAlert>
      )}

      {result && (
        <div style={{ marginTop: 16, display: 'grid', gap: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
            <div
              style={{
                minWidth: 92,
                padding: '10px 16px',
                borderRadius: 14,
                background: COLOR.brandSoft,
                textAlign: 'center',
              }}
            >
              <div style={{ fontSize: 30, fontWeight: 800, color: COLOR.brand, lineHeight: 1 }}>
                {result.overall}
              </div>
              <div style={{ ...monoLabel, marginTop: 4 }}>out of 100</div>
            </div>
            <div style={{ display: 'grid', gap: 6 }}>
              <StatusPill tone={BAND_TONE[result.band]}>{BAND_LABEL[result.band]}</StatusPill>
              <div style={{ fontSize: 12.5, color: COLOR.inkMute, maxWidth: 460 }}>
                What this sample conversation would score if you saved these settings now.
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gap: 8 }}>
            {result.dimensions.map((d) => (
              <div key={d.key} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 12.5, fontWeight: 700, color: COLOR.ink, width: 150, flexShrink: 0 }}>
                  {d.label}
                </span>
                <div style={{ flex: 1, height: 8, borderRadius: 999, background: COLOR.borderSoft, overflow: 'hidden', minWidth: 80 }}>
                  <div
                    style={{
                      width: `${Math.max(0, Math.min(100, d.score))}%`,
                      height: '100%',
                      background: COLOR.brand,
                    }}
                  />
                </div>
                <span style={{ fontSize: 12.5, fontWeight: 800, color: COLOR.ink, width: 30, textAlign: 'right' }}>
                  {d.score}
                </span>
                <span style={{ fontSize: 11.5, color: COLOR.inkMute, width: 96, textAlign: 'right' }}>
                  counts {d.sharePct}%
                </span>
              </div>
            ))}
          </div>

          {result.critique && (
            <p style={{ margin: 0, fontSize: 13, color: COLOR.inkSoft, lineHeight: 1.6 }}>
              {result.critique}
            </p>
          )}

          <Collapsible
            title="The conversation that was marked"
            badge={
              <span style={{ fontSize: 11, color: COLOR.inkMute }}>
                {result.scenario.breed} · {result.scenario.pushback}
              </span>
            }
          >
            <div style={{ display: 'grid', gap: 8 }}>
              {result.transcript.map((turn, i) => (
                <div key={i} style={{ fontSize: 12.5, color: COLOR.inkSoft, lineHeight: 1.55 }}>
                  <strong style={{ color: turn.role === 'user' ? COLOR.brand : COLOR.ink }}>
                    {SPEAKER_LABEL[turn.role]}:
                  </strong>{' '}
                  {turn.text}
                </div>
              ))}
            </div>
          </Collapsible>
        </div>
      )}
    </Glass>
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
      <div style={{ fontSize: 11.5, color: COLOR.inkMute, lineHeight: 1.5 }}>{LOCALE_NOTE}</div>
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
        <div style={{ fontSize: 11.5, color: COLOR.inkMute, lineHeight: 1.5, marginBottom: 12 }}>{LOCALE_NOTE}</div>
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
        <SectionTitle
          title="Use your knowledge library"
          subtitle="When this is on, each roleplay starts by pulling the most relevant sections of your uploaded documents into the AI's briefing and into the marker's instructions."
        />
        <div style={{ display: 'flex', gap: 20, alignItems: 'flex-end', marginTop: 14, flexWrap: 'wrap' }}>
          <Field label="Use knowledge documents">
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
            label="How many sections to look up"
            infoTitle="Using your knowledge library"
            info={RETRIEVAL_INFO}
            help="Between 1 and 8. More sections mean richer background, but a slightly slower session."
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

// ─── Version history ────────────────────────────────────────────────────────────
//
// There is no version table: every save already writes an admin_audit_log row
// carrying the FULL before/after config, so the audit log IS the history. The
// panel lists the last 30 days of those rows and can re-apply any of them.

function fmtAbsolute(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Who saved it — email when the Auth lookup worked, else a shortened id. */
function actorLabel(v: SimulationVersion): string {
  if (v.actor_email) return v.actor_email;
  if (v.actor_id) return `user ${v.actor_id.slice(0, 8)}`;
  return 'system';
}

function HistoryModal({
  open,
  onClose,
  currentConfig,
  canRestore,
  onRestore,
}: {
  open: boolean;
  onClose: () => void;
  currentConfig: Record<string, unknown>;
  /** `simulation.write` — without it the list is readable but not actionable. */
  canRestore: boolean;
  onRestore: (v: SimulationVersion) => Promise<void>;
}) {
  const [versions, setVersions] = useState<SimulationVersion[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Bumped by the boundary's Try again, so a hiccup doesn't cost the admin the
  // modal (and the restore path) until they reopen it.
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchSimulationHistory()
      .then((rows) => {
        if (!cancelled) setVersions(rows);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load history');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, attempt]);

  const query = {
    loading,
    error,
    refetch: () => setAttempt((n) => n + 1),
  };

  return (
    <Modal open={open} onClose={onClose} width={880} ariaLabel="Simulation config history">
      <div style={{ padding: '24px 26px 8px', display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ flex: 1 }}>
          <Eyebrow>Last 30 days</Eyebrow>
          <h2 style={{ margin: '6px 0 0', fontSize: 20, fontWeight: 800, color: COLOR.ink }}>
            Version history
          </h2>
          <div style={{ fontSize: 12.5, color: COLOR.inkMute, marginTop: 4 }}>
            Every save is a version. Restoring re-applies that version&apos;s settings — the
            current ones are written to history first, so a restore is itself undoable.
          </div>
        </div>
        <ModalCloseButton onClose={onClose} />
      </div>
      <div style={{ padding: '12px 26px 26px', overflow: 'auto', display: 'grid', gap: 8 }}>
        <QueryBoundary query={query} title="Couldn’t load the version history" showLoading={false}>
          {loading ? (
            <LoadingShimmer height={180} />
          ) : versions.length === 0 ? (
            <div style={{ padding: '36px 12px', textAlign: 'center', color: COLOR.inkMute, fontSize: 13 }}>
              No saved versions in the last 30 days.
            </div>
          ) : (
            versions.map((v) => (
              <VersionRow
                key={v.id}
                version={v}
                isCurrent={configEquals(v.after, currentConfig)}
                canRestore={canRestore}
                onRestore={() => onRestore(v)}
              />
            ))
          )}
        </QueryBoundary>
        {!loading && !error && versions.length > 0 && (
          <div
            style={{
              fontSize: 11.5,
              color: COLOR.inkMute,
              borderTop: `1px solid ${COLOR.border}`,
              paddingTop: 10,
              marginTop: 4,
            }}
          >
            Showing the 50 most recent saves from the last 30 days — older changes
            live in Audit.
          </div>
        )}
      </div>
    </Modal>
  );
}

function VersionRow({
  version,
  isCurrent,
  canRestore,
  onRestore,
}: {
  version: SimulationVersion;
  isCurrent: boolean;
  canRestore: boolean;
  onRestore: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const changed = useMemo(
    () => summarizeConfigDelta(version.before, version.after),
    [version.before, version.after],
  );
  /*
    A version whose `after` is empty is not "a version with nothing in it" —
    it IS the defaults, because the saved config only ever carries what differs
    from them. Restoring it wipes every customisation, so it must not read as
    the most harmless row in the list.
  */
  const restoresDefaults = isDefaultConfig(version.after);

  async function run() {
    setBusy(true);
    setError(null);
    try {
      await onRestore();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Restore failed');
      setBusy(false);
      setConfirming(false);
    }
  }

  return (
    <div
      style={{
        padding: '12px 14px',
        borderRadius: 12,
        background: 'rgba(255,255,255,0.6)',
        border: '0.5px solid rgba(255,255,255,0.9)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 13, fontWeight: 800, color: COLOR.ink }}>
          {fmtAgo(new Date(version.created_at).getTime())}
        </span>
        <span style={{ fontSize: 11.5, color: COLOR.inkMute, fontFamily: 'var(--pbt-mono)' }}>
          {fmtAbsolute(version.created_at)}
        </span>
        <span style={{ fontSize: 12, color: COLOR.inkSoft }}>{actorLabel(version)}</span>
        {isCurrent && <StatusPill tone="success">Current</StatusPill>}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center' }}>
          <button
            onClick={() => setOpen((o) => !o)}
            style={{
              padding: '4px 10px',
              borderRadius: 8,
              border: '1px solid rgba(60,20,15,0.12)',
              background: 'transparent',
              cursor: 'pointer',
              fontSize: 11,
              fontWeight: 700,
              fontFamily: 'var(--pbt-font)',
              color: COLOR.ink,
            }}
          >
            {open ? 'Hide' : 'Diff'}
          </button>
          {canRestore && !isCurrent && !confirming && (
            <button
              onClick={() => setConfirming(true)}
              disabled={busy}
              style={{ ...btnSecondary, padding: '4px 10px', fontSize: 11 }}
            >
              Restore
            </button>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8, alignItems: 'center' }}>
        {restoresDefaults ? (
          <StatusPill tone="warn" dot={false}>Defaults (nothing customised)</StatusPill>
        ) : changed.length === 0 ? (
          <StatusPill tone="neutral" dot={false}>No detected change</StatusPill>
        ) : (
          changed.map((c) => (
            <StatusPill key={c} tone="info" dot={false}>
              {c}
            </StatusPill>
          ))
        )}
        <span style={{ fontSize: 12, color: COLOR.inkMute, marginLeft: 4 }}>
          {version.note ? version.note : <em>No description</em>}
        </span>
      </div>

      {confirming && (
        <div
          style={{
            marginTop: 10,
            padding: '10px 12px',
            borderRadius: 10,
            background: COLOR.warnSoft,
            display: 'flex',
            gap: 10,
            alignItems: 'center',
            flexWrap: 'wrap',
          }}
        >
          <span style={{ fontSize: 12.5, color: COLOR.ink, fontWeight: 700, flexBasis: '100%' }}>
            {restoresDefaults
              ? 'This version is the defaults — restoring it clears all current customisations. Undoable from History: the current settings are saved there first.'
              : 'Restore this version? Current settings will be saved to history first.'}
          </span>
          <button
            onClick={() => void run()}
            disabled={busy}
            style={{ ...btnPrimary, padding: '5px 12px', fontSize: 12, opacity: busy ? 0.6 : 1 }}
          >
            {busy ? 'Restoring…' : 'Yes, restore'}
          </button>
          <button
            onClick={() => setConfirming(false)}
            disabled={busy}
            style={{ ...btnSecondary, padding: '5px 12px', fontSize: 12 }}
          >
            Cancel
          </button>
        </div>
      )}
      {error && (
        <div style={{ fontSize: 12, color: COLOR.danger, fontWeight: 700, marginTop: 8 }}>
          {error}
        </div>
      )}

      {open && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
            gap: 10,
            marginTop: 10,
            fontFamily: 'var(--pbt-mono)',
            fontSize: 11,
          }}
        >
          <ConfigPane label="Before" value={version.before} />
          <ConfigPane label="After" value={version.after} />
        </div>
      )}
    </div>
  );
}

function ConfigPane({ label, value }: { label: string; value: unknown }) {
  return (
    <div
      style={{
        padding: 10,
        borderRadius: 8,
        background: 'rgba(60,20,15,0.04)',
        maxHeight: 260,
        overflow: 'auto',
      }}
    >
      <div
        style={{
          fontSize: 9,
          fontWeight: 800,
          letterSpacing: '0.10em',
          color: COLOR.inkMute,
          marginBottom: 4,
        }}
      >
        {label}
      </div>
      <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
        {value ? JSON.stringify(value, null, 2) : '—'}
      </pre>
    </div>
  );
}
