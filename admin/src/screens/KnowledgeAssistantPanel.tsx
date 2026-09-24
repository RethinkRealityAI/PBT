/**
 * KnowledgeAssistantPanel — the "tag assistant" inside the Knowledge modals.
 *
 * The admin drops a document in; the model reads it and proposes WHAT it is
 * (title, type, focus area, citation) and WHERE it should be used (tools,
 * species), with a one-sentence reason for each placement. Nothing here
 * writes anything: the panel only ever hands a proposal to the form, and the
 * form's own fields stay the source of truth. That is why the primary action
 * is "Apply suggestions" and not "Save".
 *
 * Running the model costs money and ~20 s for a PDF, so it never runs on its
 * own by default: one click, remembered as a preference if the admin ticks
 * "Always suggest automatically".
 *
 * The file has three parts: the pure bits (confidence bands, storage), the
 * hook that owns the request lifecycle (`useKnowledgeAssistant`) and the
 * panel itself, which is a function of that hook's state.
 */
import { useCallback, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { StatusPill } from '../primitives';
import { InlineAlert } from '../primitives/form';
import { analyzeKnowledge } from '../data/knowledgeActions';
import { FOCUS_AREAS, isFocusAreaKey } from '../../../src/shared/knowledge/focusAreas';
import {
  knowledgeSpeciesLabel,
  knowledgeToolLabel,
  normalizeKnowledgeSpecies,
  normalizeKnowledgeTools,
} from '../../../src/shared/knowledge/knowledgeScopes';
import type {
  KnowledgeAnalysis,
  KnowledgeAnalyzeRequest,
  KnowledgeAnalyzeResponse,
} from '../../../src/shared/knowledge/knowledgeAnalyze';
import { COLOR } from '../lib/tokens';
import { btnPrimary } from './FlagsScreen';

// ─── Pure bits ──────────────────────────────────────────────────────────────

/** Pasted text shorter than this isn't worth a model call — or a panel. */
export const ASSISTANT_MIN_CHARS = 200;

/** Browser-local preference: run the assistant as soon as there is something to read. */
export const AUTO_SUGGEST_KEY = 'pbt:admin:knowledge_auto_suggest';

export function readAutoSuggest(): boolean {
  try {
    return localStorage.getItem(AUTO_SUGGEST_KEY) === '1';
  } catch {
    return false;
  }
}

export function writeAutoSuggest(value: boolean): void {
  try {
    if (value) localStorage.setItem(AUTO_SUGGEST_KEY, '1');
    else localStorage.removeItem(AUTO_SUGGEST_KEY);
  } catch {
    // Private mode: the checkbox still works for this session.
  }
}

export type ConfidenceBand = {
  label: 'High confidence' | 'Medium confidence' | 'Low confidence';
  tone: 'success' | 'warn' | 'neutral';
  percent: number;
};

/** ≥ 0.8 high · ≥ 0.5 medium · else low. The raw number lives in a tooltip. */
export function confidenceBand(confidence: number): ConfidenceBand {
  const n = Number.isFinite(confidence) ? Math.max(0, Math.min(1, confidence)) : 0;
  const percent = Math.round(n * 100);
  if (n >= 0.8) return { label: 'High confidence', tone: 'success', percent };
  if (n >= 0.5) return { label: 'Medium confidence', tone: 'warn', percent };
  return { label: 'Low confidence', tone: 'neutral', percent };
}

/**
 * The proposal, cleaned to the vocabularies the form can hold. The model is
 * asked for keys, but a form should never trust a model with its own state:
 * unknown tools/species fall back to the defaults, an unknown focus to none.
 */
export interface AppliedSuggestion {
  title: string;
  category: 'clinical' | 'custom';
  focus: string | null;
  tools: string[];
  species: string[];
  citation: string | null;
}

export function sanitizeSuggestion(
  analysis: KnowledgeAnalysis,
  extractedCitation?: string,
): AppliedSuggestion {
  const citation = (analysis.citation ?? extractedCitation ?? '').trim();
  return {
    title: (analysis.title ?? '').trim(),
    category: analysis.category === 'custom' ? 'custom' : 'clinical',
    focus: isFocusAreaKey(analysis.focus) ? analysis.focus : null,
    tools: normalizeKnowledgeTools(analysis.tools),
    species: normalizeKnowledgeSpecies(analysis.species),
    citation: citation || null,
  };
}

// ─── Request lifecycle ──────────────────────────────────────────────────────

export type AssistantStatus = 'idle' | 'analyzing' | 'done' | 'error';

export interface KnowledgeAssistant {
  status: AssistantStatus;
  analysis: KnowledgeAnalysis | null;
  /** PDF only: the text the server already extracted, so ingest can skip it. */
  extractedMarkdown: string | null;
  extractedCitation: string | null;
  error: string | null;
  /** Card folded to one line (after Apply / Keep what I have). */
  hidden: boolean;
  /** Whether the last fold was an Apply — changes the one-line wording. */
  applied: boolean;
  run: (body: KnowledgeAnalyzeRequest) => Promise<void>;
  reset: () => void;
  hide: (applied: boolean) => void;
  show: () => void;
}

interface AssistantState {
  status: AssistantStatus;
  analysis: KnowledgeAnalysis | null;
  extractedMarkdown: string | null;
  extractedCitation: string | null;
  error: string | null;
  hidden: boolean;
  applied: boolean;
}

const IDLE: AssistantState = {
  status: 'idle',
  analysis: null,
  extractedMarkdown: null,
  extractedCitation: null,
  error: null,
  hidden: false,
  applied: false,
};

export function useKnowledgeAssistant(): KnowledgeAssistant {
  const [state, setState] = useState<AssistantState>(IDLE);
  // A reset (new file, modal closed) or a re-run must make the earlier
  // request's answer land nowhere, so every run carries a ticket.
  const ticket = useRef(0);

  const run = useCallback(async (body: KnowledgeAnalyzeRequest) => {
    const mine = ++ticket.current;
    setState({ ...IDLE, status: 'analyzing' });
    try {
      const res: KnowledgeAnalyzeResponse = await analyzeKnowledge(body);
      if (ticket.current !== mine) return;
      setState({
        status: 'done',
        analysis: res.analysis,
        extractedMarkdown: res.extractedMarkdown ?? null,
        extractedCitation: res.extractedCitation ?? null,
        error: null,
        hidden: false,
        applied: false,
      });
    } catch (err) {
      if (ticket.current !== mine) return;
      setState({
        ...IDLE,
        status: 'error',
        error: err instanceof Error ? err.message : 'The assistant did not answer.',
      });
    }
  }, []);

  const reset = useCallback(() => {
    ticket.current += 1;
    setState(IDLE);
  }, []);

  const hide = useCallback((applied: boolean) => {
    setState((s) => ({ ...s, hidden: true, applied }));
  }, []);

  const show = useCallback(() => {
    setState((s) => ({ ...s, hidden: false }));
  }, []);

  return { ...state, run, reset, hide, show };
}

// ─── "Suggested by the assistant" field marks ───────────────────────────────

export type SuggestedKey = 'title' | 'category' | 'focus' | 'tools' | 'species' | 'citation';

export interface SuggestedFields {
  has: (key: SuggestedKey) => boolean;
  /** Replace the set of marked fields and re-trigger the flash. */
  mark: (keys: SuggestedKey[]) => void;
  /** The admin touched a field: its tag goes away. */
  clear: (key: SuggestedKey) => void;
  reset: () => void;
  /** Bumps on every `mark`, so the flash replays on a second Apply. */
  flashKey: number;
}

export function useSuggestedFields(): SuggestedFields {
  const [keys, setKeys] = useState<SuggestedKey[]>([]);
  const [flashKey, setFlashKey] = useState(0);
  return {
    has: (key) => keys.includes(key),
    mark: (next) => {
      setKeys(next);
      setFlashKey((n) => n + 1);
    },
    clear: (key) => setKeys((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : prev)),
    reset: () => setKeys([]),
    flashKey,
  };
}

/** The small pill next to a field the assistant filled in. */
export function SuggestedTag() {
  return (
    <span
      data-testid="suggested-tag"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: '2px 8px',
        borderRadius: 999,
        background: COLOR.brandSoft,
        color: COLOR.brand,
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: 0,
        textTransform: 'none',
        fontFamily: 'var(--pbt-font)',
        verticalAlign: 'middle',
        whiteSpace: 'nowrap',
      }}
    >
      <Sparkle size={10} />
      Suggested by the assistant
    </span>
  );
}

/**
 * Wraps a field so it can glow once when the assistant fills it. Keyed on
 * `flashKey` so a second Apply replays the animation; the wrapper is
 * padding-neutral (negative margin) so it never shifts the layout.
 */
export function SuggestedFieldFrame({
  active,
  flashKey,
  children,
}: {
  active: boolean;
  flashKey: number;
  children: ReactNode;
}) {
  return (
    <div
      key={active ? flashKey : 'still'}
      className={active ? 'pbt-assist-flash' : undefined}
      style={{ borderRadius: 12, margin: -6, padding: 6 }}
    >
      {children}
    </div>
  );
}

// ─── Panel ──────────────────────────────────────────────────────────────────

const STYLE_ID = 'pbt-knowledge-assistant-kf';
const STYLESHEET = `
  @keyframes pbt-assist-flash {
    0% { box-shadow: 0 0 0 0 color-mix(in oklab, ${COLOR.brand} 40%, transparent); background: ${COLOR.brandSoft}; }
    100% { box-shadow: 0 0 0 8px transparent; background: transparent; }
  }
  @keyframes pbt-assist-pulse {
    0%, 100% { transform: scale(1); opacity: 1; }
    50% { transform: scale(1.14); opacity: 0.72; }
  }
  @keyframes pbt-assist-line {
    from { transform: translateX(-100%); }
    to { transform: translateX(400%); }
  }
  @keyframes pbt-assist-in {
    from { opacity: 0; transform: translateY(6px); }
    to { opacity: 1; transform: translateY(0); }
  }
  .pbt-assist-flash { animation: pbt-assist-flash 1.6s ease-out; }
  .pbt-assist-pulse { animation: pbt-assist-pulse 1.4s ease-in-out infinite; }
  .pbt-assist-line { animation: pbt-assist-line 1.6s cubic-bezier(0.4, 0, 0.2, 1) infinite; }
  .pbt-assist-in { animation: pbt-assist-in 0.22s ease-out; }
  .pbt-assist-link {
    background: none; border: none; padding: 0; cursor: pointer;
    font: inherit; font-weight: 700; color: ${COLOR.brand}; text-decoration: underline;
    text-underline-offset: 2px;
  }
  .pbt-assist-link:focus-visible { outline: 2px solid ${COLOR.brand}; outline-offset: 2px; border-radius: 4px; }
  @media (prefers-reduced-motion: reduce) {
    .pbt-assist-flash, .pbt-assist-pulse, .pbt-assist-line, .pbt-assist-in { animation: none !important; }
  }
`;

if (typeof document !== 'undefined' && !document.getElementById(STYLE_ID)) {
  const s = document.createElement('style');
  s.id = STYLE_ID;
  s.textContent = STYLESHEET;
  document.head.appendChild(s);
}

export function Sparkle({ size = 14 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
      style={{ flexShrink: 0 }}
    >
      <path d="M12 2c.4 3.9 3.1 6.6 7 7-3.9.4-6.6 3.1-7 7-.4-3.9-3.1-6.6-7-7 3.9-.4 6.6-3.1 7-7z" />
      <path d="M19 14c.2 1.9 1.5 3.2 3.4 3.4-1.9.2-3.2 1.5-3.4 3.4-.2-1.9-1.5-3.2-3.4-3.4 1.9-.2 3.2-1.5 3.4-3.4z" opacity={0.75} />
      <path d="M5 14c.2 1.4 1.1 2.3 2.5 2.5-1.4.2-2.3 1.1-2.5 2.5-.2-1.4-1.1-2.3-2.5-2.5 1.4-.2 2.3-1.1 2.5-2.5z" opacity={0.55} />
    </svg>
  );
}

function SparkleBadge({ pulsing = false }: { pulsing?: boolean }) {
  return (
    <span
      className={pulsing ? 'pbt-assist-pulse' : undefined}
      style={{
        width: 32,
        height: 32,
        borderRadius: 10,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: `linear-gradient(135deg, ${COLOR.brandSoft}, ${COLOR.infoSoft})`,
        color: COLOR.brand,
        boxShadow: '0 1px 0 rgba(255,255,255,0.9) inset',
        flexShrink: 0,
      }}
    >
      <Sparkle size={16} />
    </span>
  );
}

/** The card chrome shared by every state: soft tinted glass with a brand hairline. */
function AssistantCard({ children, testId }: { children: ReactNode; testId?: string }) {
  return (
    <section
      data-testid={testId ?? 'assistant-panel'}
      className="pbt-assist-in"
      aria-label="AI assistant"
      style={{
        position: 'relative',
        display: 'grid',
        gap: 12,
        padding: 14,
        borderRadius: 16,
        border: `1px solid color-mix(in oklab, ${COLOR.brand} 18%, ${COLOR.border})`,
        // Two layers: the brand hairline along the top edge, then the tinted
        // glass. Layered rather than an absolutely-positioned strip so the
        // card never needs `overflow: hidden` — which, inside the modal's
        // height-constrained grid, would let the row collapse to nothing.
        background: [
          `linear-gradient(90deg, color-mix(in oklab, ${COLOR.brand} 55%, transparent), color-mix(in oklab, ${COLOR.info} 55%, transparent) 60%, transparent) top / 100% 2px no-repeat`,
          `linear-gradient(160deg, rgba(255,255,255,0.78), color-mix(in oklab, ${COLOR.brandSoft} 45%, rgba(255,255,255,0.7)))`,
        ].join(', '),
      }}
    >
      {children}
    </section>
  );
}

function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        fontSize: 10,
        fontWeight: 800,
        textTransform: 'uppercase',
        letterSpacing: '0.10em',
        color: COLOR.inkMute,
        fontFamily: 'var(--pbt-mono)',
      }}
    >
      {children}
    </div>
  );
}

function ValueChip({ children, tone = 'brand' }: { children: ReactNode; tone?: 'brand' | 'neutral' }) {
  const brand = tone === 'brand';
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '4px 10px',
        borderRadius: 999,
        background: brand ? COLOR.brand : 'rgba(255,255,255,0.75)',
        border: brand ? 'none' : `1px solid ${COLOR.border}`,
        color: brand ? '#fff' : COLOR.inkSoft,
        fontSize: 11.5,
        fontWeight: 700,
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </span>
  );
}

function LinkButton({
  children,
  onClick,
  disabled,
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button type="button" className="pbt-assist-link" onClick={onClick} disabled={disabled} style={{ fontSize: 12 }}>
      {children}
    </button>
  );
}

const ghostButton: CSSProperties = {
  padding: '8px 14px',
  borderRadius: 10,
  border: '1px solid transparent',
  background: 'transparent',
  color: COLOR.inkSoft,
  fontWeight: 700,
  cursor: 'pointer',
  fontFamily: 'var(--pbt-font)',
  fontSize: 13,
};

/** One "Focus area · Used by · Species" row: label, value chips, reason. */
function SuggestionRow({
  label,
  values,
  reason,
}: {
  label: string;
  values: string[];
  reason: string;
}) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(96px, 120px) 1fr',
        gap: '4px 12px',
        alignItems: 'start',
        padding: '10px 0',
        borderTop: `1px solid ${COLOR.borderSoft}`,
      }}
    >
      <Eyebrow>{label}</Eyebrow>
      <div style={{ display: 'grid', gap: 5 }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {values.length === 0 ? (
            <ValueChip tone="neutral">None</ValueChip>
          ) : (
            values.map((v) => <ValueChip key={v}>{v}</ValueChip>)
          )}
        </div>
        <div style={{ fontSize: 11.5, lineHeight: 1.45, color: COLOR.inkMute }}>{reason}</div>
      </div>
    </div>
  );
}

export interface KnowledgeAssistantPanelProps {
  assistant: KnowledgeAssistant;
  /** Fires the request; the caller knows whether it is a PDF, text or a slug. */
  onRun: () => void;
  onApply: () => void;
  /** Where the text comes from — changes the waiting copy. */
  source: 'pdf' | 'text' | 'document';
  /** When given, the idle card offers the "Always suggest automatically" box. */
  autoSuggest?: { value: boolean; onChange: (next: boolean) => void };
  /** `hidden` renders nothing while idle (the document modal has its own button). */
  idle?: 'card' | 'hidden';
}

export function KnowledgeAssistantPanel({
  assistant,
  onRun,
  onApply,
  source,
  autoSuggest,
  idle = 'card',
}: KnowledgeAssistantPanelProps) {
  const [collapsed, setCollapsed] = useState(false);

  // ── Idle: the offer ──
  if (assistant.status === 'idle') {
    if (idle === 'hidden') return null;
    return (
      <AssistantCard testId="assistant-idle">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <SparkleBadge />
          <div style={{ flex: 1, minWidth: 240 }}>
            <div style={{ fontSize: 13.5, fontWeight: 800, color: COLOR.ink }}>
              Let the assistant read it
            </div>
            <div style={{ fontSize: 12, lineHeight: 1.45, color: COLOR.inkMute, marginTop: 2 }}>
              It suggests a title, what the document is about and where it should be used.
              You can change anything.
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
            {autoSuggest && (
              <label
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  fontSize: 11.5,
                  color: COLOR.inkSoft,
                  cursor: 'pointer',
                }}
              >
                <input
                  type="checkbox"
                  checked={autoSuggest.value}
                  onChange={(e) => autoSuggest.onChange(e.target.checked)}
                  style={{ accentColor: COLOR.brand }}
                />
                Always suggest automatically
              </label>
            )}
            <button
              type="button"
              className="pbt-btn"
              onClick={onRun}
              style={{ ...btnPrimary, display: 'inline-flex', alignItems: 'center', gap: 7 }}
            >
              <Sparkle size={13} />
              Read and suggest
            </button>
          </div>
        </div>
      </AssistantCard>
    );
  }

  // ── Analyzing: the shimmer line ──
  if (assistant.status === 'analyzing') {
    return (
      <AssistantCard testId="assistant-analyzing">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <SparkleBadge pulsing />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div role="status" style={{ fontSize: 13.5, fontWeight: 800, color: COLOR.ink }}>
              Reading the document…
            </div>
            <div style={{ fontSize: 11.5, color: COLOR.inkMute, marginTop: 2 }}>
              {source === 'pdf'
                ? 'Longer documents take up to half a minute.'
                : 'Usually a few seconds. Longer documents take up to half a minute.'}
            </div>
          </div>
        </div>
        <div
          aria-hidden
          style={{
            position: 'relative',
            height: 3,
            borderRadius: 999,
            overflow: 'hidden',
            background: `color-mix(in oklab, ${COLOR.brand} 12%, transparent)`,
          }}
        >
          <span
            className="pbt-assist-line"
            style={{
              position: 'absolute',
              inset: 0,
              width: '30%',
              borderRadius: 999,
              background: `linear-gradient(90deg, transparent, ${COLOR.brand}, transparent)`,
            }}
          />
        </div>
      </AssistantCard>
    );
  }

  // ── Error: friendly, with a way back ──
  if (assistant.status === 'error') {
    return (
      <AssistantCard testId="assistant-error">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <SparkleBadge />
          <div style={{ flex: 1, minWidth: 240 }}>
            <div style={{ fontSize: 13.5, fontWeight: 800, color: COLOR.ink }}>
              The assistant couldn’t read this one
            </div>
            <div style={{ fontSize: 12, lineHeight: 1.45, color: COLOR.inkMute, marginTop: 2 }}>
              You can still fill it in by hand.
              {assistant.error ? (
                <span style={{ fontFamily: 'var(--pbt-mono)', fontSize: 11 }}> ({assistant.error})</span>
              ) : null}
            </div>
          </div>
          <button type="button" className="pbt-btn" onClick={onRun} style={btnPrimary}>
            Try again
          </button>
        </div>
      </AssistantCard>
    );
  }

  // ── Done ──
  const analysis = assistant.analysis;
  if (!analysis) return null;

  if (assistant.hidden) {
    return (
      <div
        data-testid="assistant-folded"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '8px 12px',
          borderRadius: 12,
          border: `1px solid ${COLOR.border}`,
          background: 'rgba(255,255,255,0.5)',
          fontSize: 12,
          color: COLOR.inkSoft,
          flexWrap: 'wrap',
        }}
      >
        <span style={{ color: COLOR.brand, display: 'inline-flex' }}>
          <Sparkle size={13} />
        </span>
        <span style={{ fontWeight: 700 }}>
          {assistant.applied ? 'Suggestions applied.' : 'Suggestions set aside.'}
        </span>
        <span style={{ marginLeft: 'auto', display: 'flex', gap: 14 }}>
          <LinkButton onClick={assistant.show}>Show them</LinkButton>
          <LinkButton onClick={onRun}>Suggest again</LinkButton>
        </span>
      </div>
    );
  }

  const band = confidenceBand(analysis.confidence);
  const focusLabel = isFocusAreaKey(analysis.focus)
    ? FOCUS_AREAS.find((f) => f.key === analysis.focus)?.label ?? analysis.focus
    : null;
  const toolLabels = normalizeKnowledgeTools(analysis.tools).map((k) => knowledgeToolLabel(k) ?? k);
  const speciesLabels = normalizeKnowledgeSpecies(analysis.species).map(
    (k) => knowledgeSpeciesLabel(k) ?? k,
  );
  const topics = (analysis.topics ?? []).filter(Boolean).slice(0, 6);
  const warnings = (analysis.warnings ?? []).filter(Boolean);

  return (
    <AssistantCard testId="assistant-result">
      {/* Header: what this is, and how sure the model is */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <SparkleBadge />
        <div style={{ flex: 1, minWidth: 200 }}>
          <Eyebrow>AI assistant</Eyebrow>
          <div style={{ fontSize: 14, fontWeight: 800, color: COLOR.ink, marginTop: 1 }}>
            {analysis.title || 'What the assistant found'}
          </div>
        </div>
        <span title={`${band.percent}% confidence`} data-testid="assistant-confidence">
          <StatusPill tone={band.tone} dot>
            {band.label}
          </StatusPill>
        </span>
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          aria-expanded={!collapsed}
          aria-label={collapsed ? 'Show the suggestions' : 'Collapse the suggestions'}
          style={{
            ...ghostButton,
            padding: '4px 8px',
            fontSize: 12,
            color: COLOR.inkMute,
          }}
        >
          <span
            aria-hidden
            style={{
              display: 'inline-block',
              transition: 'transform 0.18s ease',
              transform: collapsed ? 'rotate(0deg)' : 'rotate(90deg)',
            }}
          >
            ▶
          </span>
        </button>
      </div>

      {!collapsed && (
        <>
          <p
            data-testid="assistant-summary"
            style={{ margin: 0, fontSize: 13, lineHeight: 1.55, color: COLOR.inkSoft }}
          >
            {analysis.summary}
          </p>

          {topics.length > 0 && (
            <div data-testid="assistant-topics" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {topics.map((t) => (
                <ValueChip key={t} tone="neutral">
                  {t}
                </ValueChip>
              ))}
            </div>
          )}

          <div>
            <SuggestionRow
              label="Focus area"
              values={focusLabel ? [focusLabel] : []}
              reason={analysis.reasons?.focus ?? ''}
            />
            <SuggestionRow label="Used by" values={toolLabels} reason={analysis.reasons?.tools ?? ''} />
            <SuggestionRow
              label="Species"
              values={speciesLabels}
              reason={analysis.reasons?.species ?? ''}
            />
            <div
              style={{
                display: 'flex',
                gap: 14,
                flexWrap: 'wrap',
                paddingTop: 10,
                borderTop: `1px solid ${COLOR.borderSoft}`,
                fontSize: 11.5,
                color: COLOR.inkMute,
              }}
            >
              <span>
                <strong style={{ color: COLOR.inkSoft }}>Type</strong>{' '}
                {analysis.category === 'custom' ? 'Custom' : 'Clinical reference'}
              </span>
              <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                <strong style={{ color: COLOR.inkSoft }}>Citation</strong>{' '}
                {analysis.citation ?? assistant.extractedCitation ?? 'none found'}
              </span>
            </div>
          </div>

          {warnings.length > 0 && (
            <InlineAlert tone="warn" title="Worth a second look">
              <ul style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 3 }}>
                {warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            </InlineAlert>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <button
              type="button"
              className="pbt-btn"
              onClick={onApply}
              style={{ ...btnPrimary, display: 'inline-flex', alignItems: 'center', gap: 7 }}
            >
              <Sparkle size={13} />
              Apply suggestions
            </button>
            <button
              type="button"
              className="pbt-btn"
              onClick={() => assistant.hide(false)}
              style={ghostButton}
            >
              Keep what I have
            </button>
            <span style={{ marginLeft: 'auto' }}>
              <LinkButton onClick={onRun}>Suggest again</LinkButton>
            </span>
          </div>
        </>
      )}
    </AssistantCard>
  );
}
