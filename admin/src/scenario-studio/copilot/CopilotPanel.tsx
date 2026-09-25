/**
 * The Scenario Studio assistant — chat + A2UI proposal cards.
 *
 * Orchestration ported from PhotoBoothAR's CopilotChat, with the same rules:
 *   • The model never writes UI and never writes data. Its actions are
 *     normalised by the server, then AGAIN here (against the documents this
 *     browser can see), and only then turned into cards by the trusted
 *     builders in ./agentSurfaces.ts.
 *   • Card data is two-way bound and editable, so a confirm re-normalises
 *     the card's `/proposal` before anything is applied.
 *   • Applying only patches the on-screen draft through `onPatch`. Saving and
 *     publishing stay the admin's explicit clicks in the Studio header.
 *
 * The transcript is lifted to the shell (persisted with the local draft), so
 * every change goes through `onTranscriptChange`. Async continuations read
 * the latest transcript / draft from refs, never from a stale closure.
 */
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
} from 'react';
import type { A2uiActionEvent } from '../../lib/a2ui';
import { COLOR, RADIUS } from '../../lib/tokens';
import { Glass } from '../../primitives/Glass';
import { resolveDocScope } from '../../data/knowledgeActions';
import { askScenarioAgent } from '../api';
import type { CopilotPanelProps } from '../types';
import type { StudioDraft } from '../studioModel';
import { AssistMark, Chip, TypingDots } from '../ui';
import {
  AGENT_LIMITS,
  ASK_FIELDS,
  OFFER_FIELDS,
  STUDIO_STEP_LABELS,
  applyAgentAction,
  applyFieldValue,
  isStudioStepKey,
  normalizeAgentActions,
  normalizeFieldValue,
  normalizeSuggestions,
  pickAgentDraft,
  type AskField,
  type OfferField,
  type ScenarioAgentAction,
} from '../../../../src/shared/ai/scenarioAgent';
import { SCENARIO_LIMITS } from '../../../../src/shared/scenarios/limits';
import { retrievalSpeciesFor } from '../../../../src/shared/scenarios/species';
import { A2uiSurface } from './A2uiSurface';
import { CARD_EVENTS, buildActionSurface } from './agentSurfaces';
import { composerPlaceholder, greetingFor, starterPrompts } from './starterPrompts';
import {
  appendAssistant,
  appendSurface,
  appendUser,
  removeItem,
  replaceSurfaceWithResult,
  sanitizeTranscript,
  setSuggestions,
  setSurfaceData,
  transcriptToWire,
} from './transcript';
import type { CopilotItem, CopilotTranscript } from './types';

/** How close to the bottom (px) still counts as "following the conversation". */
const NEAR_BOTTOM_PX = 80;
/** Show the character counter from here on. */
const COUNTER_FROM = Math.floor(AGENT_LIMITS.maxTurnChars * 0.8);
const COMPOSER_MAX_HEIGHT = 120;

const FALLBACK_REPLY = 'I’m not sure how to help with that — could you say it another way?';
const INVALID_RESULT = 'That didn’t look valid, so nothing changed.';
const DATA_TOOLS: ReadonlySet<ScenarioAgentAction['tool']> = new Set([
  'update_fields',
  'set_ai_notes',
  'attach_knowledge',
]);

export function offlineMessage(detail: string): string {
  const reason = detail.trim() ? ` (${detail.trim()})` : '';
  return `I couldn’t reach the assistant just now${reason}. Your draft is safe — keep going with the steps, or try again.`;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

/** The keys whose values differ — what `onPatch` should merge. */
function changedKeys(before: StudioDraft, after: StudioDraft): StudioDraft {
  const out: Record<string, unknown> = {};
  const a = after as Record<string, unknown>;
  const b = before as Record<string, unknown>;
  for (const key of Object.keys(a)) if (a[key] !== b[key]) out[key] = a[key];
  return out as StudioDraft;
}

function clipLabel(text: string, max = 60): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max).trimEnd()}…` : flat;
}

function prefersReducedMotion(): boolean {
  try {
    return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

/** Latest-value ref, updated after every commit. */
function useLatest<T>(value: T) {
  const ref = useRef(value);
  useLayoutEffect(() => {
    ref.current = value;
  });
  return ref;
}

export function CopilotPanel(props: CopilotPanelProps) {
  const {
    scenarioId,
    draft,
    step,
    canWrite,
    knowledge,
    pendingPrompt,
    variant,
    onClose,
  } = props;

  const transcript = useMemo(() => sanitizeTranscript(props.transcript), [props.transcript]);

  // ── Latest values for async work + stable callbacks ────────────────────
  const transcriptRef = useRef<CopilotTranscript>(transcript);
  useLayoutEffect(() => {
    transcriptRef.current = transcript;
  }, [transcript]);
  const draftRef = useRef<StudioDraft>(draft);
  useLayoutEffect(() => {
    draftRef.current = draft;
  }, [draft]);
  const stepRef = useLatest(step);
  const scenarioRef = useLatest(scenarioId);
  const canWriteRef = useLatest(canWrite);
  const docsRef = useLatest(knowledge.docs);
  const onPatchRef = useLatest(props.onPatch);
  const onGoToStepRef = useLatest(props.onGoToStep);
  const onTranscriptChangeRef = useLatest(props.onTranscriptChange);
  const onPendingConsumedRef = useLatest(props.onPendingConsumed);

  /**
   * Documents the assistant may attach: readable by the roleplay customer,
   * indexed, and filed for this scenario's species (species is a HARD
   * retrieval scope and attached documents never widen). Anything else
   * would silently retrieve nothing.
   */
  const speciesScope = retrievalSpeciesFor(draft.species, draft.life_stage);
  const knownSlugs = useMemo(
    () =>
      new Set(
        knowledge.docs
          .filter((d) => {
            if (d.chunk_count <= 0) return false;
            const scope = resolveDocScope(d.metadata);
            if (!scope.tools.includes('roleplay')) return false;
            return !speciesScope || scope.species.includes(speciesScope);
          })
          .map((d) => d.slug),
      ),
    [knowledge.docs, speciesScope],
  );
  const knownSlugsRef = useLatest(knownSlugs);

  const [busy, setBusy] = useState(false);
  const sendingRef = useRef(false);
  const [input, setInput] = useState('');
  const [announcement, setAnnouncement] = useState('');

  /** Items this panel added (they animate in; restored ones don't). */
  const freshIdsRef = useRef<Set<string>>(new Set());

  const update = useCallback(
    (fn: (t: CopilotTranscript) => CopilotTranscript) => {
      const prev = transcriptRef.current;
      const next = fn(prev);
      if (next === prev) return;
      const before = new Set(prev.items.map((i) => i.id));
      for (const item of next.items) if (!before.has(item.id)) freshIdsRef.current.add(item.id);
      transcriptRef.current = next;
      onTranscriptChangeRef.current(next);
    },
    [onTranscriptChangeRef],
  );

  /** Merge an applied change into the draft (and our copy of it). */
  const patchDraft = useCallback(
    (next: StudioDraft, changed: string[]) => {
      if (changed.length === 0) return;
      const partial = changedKeys(draftRef.current, next);
      if (Object.keys(partial).length === 0) return;
      draftRef.current = { ...draftRef.current, ...partial };
      onPatchRef.current(partial, `Applied: ${changed.join(', ')}`);
    },
    [onPatchRef],
  );

  // ── The conversation loop ──────────────────────────────────────────────

  /**
   * The docked panel and the drawer are separate mounts, so crossing the
   * dock breakpoint (or hiding the dock) unmounts this panel mid-request.
   * Its late reply would then write a STALE transcript over whatever the new
   * mount has added — so an unmounted panel drops its reply, and the new
   * mount offers Retry for the unanswered message (effect below).
   */
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  /** Ask the model for its next turn. Caller holds `sendingRef`. */
  const runTurn = useCallback(async () => {
    // A reply that lands after the admin switched scenarios belongs to the
    // old one — never write it into the new scenario's transcript.
    const forScenario = scenarioRef.current;
    try {
      const res = await askScenarioAgent({
        messages: transcriptToWire(transcriptRef.current),
        draft: pickAgentDraft(draftRef.current),
        step: stepRef.current,
      });
      if (!mountedRef.current || scenarioRef.current !== forScenario) return;
      // The server normalised these already; the client does it again
      // against the library THIS browser can see before any card is built.
      const actions = normalizeAgentActions(res?.actions, { knownSlugs: knownSlugsRef.current });
      const reply = typeof res?.reply === 'string' ? res.reply.trim() : '';
      const suggestions = normalizeSuggestions(res?.suggestions);
      update((t) => {
        let next = t;
        if (reply || actions.length === 0) next = appendAssistant(next, reply || FALLBACK_REPLY);
        for (const action of actions) {
          next = appendSurface(next, (sid) =>
            buildActionSurface(action, sid, { draft: draftRef.current, docs: docsRef.current }),
          );
        }
        return setSuggestions(next, suggestions);
      });
      setAnnouncement(reply || (actions.length ? 'The assistant made a suggestion.' : FALLBACK_REPLY));
    } catch (err) {
      if (!mountedRef.current || scenarioRef.current !== forScenario) return;
      const detail = err instanceof Error ? err.message : String(err ?? '');
      const text = offlineMessage(detail);
      update((t) => setSuggestions(appendAssistant(t, text, { offline: true }), []));
      setAnnouncement(text);
    } finally {
      sendingRef.current = false;
      setBusy(false);
    }
  }, [update, stepRef, scenarioRef, knownSlugsRef, docsRef]);

  const nearBottomRef = useRef(true);

  /** Send the admin's message. Returns false when nothing was sent. */
  const send = useCallback(
    (raw: string): boolean => {
      const text = raw.trim().slice(0, AGENT_LIMITS.maxTurnChars);
      if (!text || sendingRef.current || !canWriteRef.current) return false;
      sendingRef.current = true;
      setBusy(true);
      nearBottomRef.current = true; // your own message always scrolls into view
      update((t) => setSuggestions(appendUser(t, text), []));
      void runTurn();
      return true;
    },
    [update, runTurn, canWriteRef],
  );

  /** Re-ask after a failure: drop the offline note, resend the same conversation. */
  const retry = useCallback(
    (offlineItemId: string) => {
      if (sendingRef.current || !canWriteRef.current) return;
      const t = removeItem(transcriptRef.current, offlineItemId);
      if (!t.items.some((i) => i.kind === 'user')) return;
      sendingRef.current = true;
      setBusy(true);
      update(() => t);
      void runTurn();
    },
    [update, runTurn, canWriteRef],
  );

  // A transcript whose LAST item is the admin's own message was cut off
  // mid-request (the panel remounted, or the page reloaded). Say so and offer
  // Retry rather than leaving a question hanging with no answer. Runs once
  // per mount; `update` writes through `transcriptRef` immediately, so a
  // StrictMode double-run sees the note and doesn't add a second one.
  useEffect(() => {
    const last = transcriptRef.current.items[transcriptRef.current.items.length - 1];
    if (last?.kind !== 'user' || sendingRef.current) return;
    update((t) =>
      setSuggestions(
        appendAssistant(t, 'The assistant was interrupted before it could reply.', { offline: true }),
        [],
      ),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Card events ────────────────────────────────────────────────────────

  const result = useCallback(
    (surfaceId: string, text: string, ok: boolean) =>
      update((t) => replaceSurfaceWithResult(t, surfaceId, text, ok)),
    [update],
  );

  const confirmAction = useCallback(
    (event: A2uiActionEvent) => {
      const sid = event.surfaceId;
      let proposal: unknown = event.context.proposal;
      // Documents mode: the admin ticks rows; rebuild the slug list from them.
      if (isRecord(proposal) && proposal.tool === 'attach_knowledge' && proposal.mode === 'documents') {
        const picked = Array.isArray(event.context.picked) ? event.context.picked : [];
        const all = Array.isArray(event.context.slugsAll) ? event.context.slugsAll : [];
        const slugs = all.filter((s, i): s is string => typeof s === 'string' && picked[i] === true);
        if (slugs.length === 0) {
          result(sid, 'No documents were ticked, so nothing changed.', false);
          return;
        }
        proposal = { ...proposal, slugs };
      }
      const [action] = normalizeAgentActions([proposal], { knownSlugs: knownSlugsRef.current });
      if (!action || !DATA_TOOLS.has(action.tool)) {
        result(sid, INVALID_RESULT, false);
        return;
      }
      let toApply: ScenarioAgentAction = action;
      if (action.tool === 'attach_knowledge' && action.mode === 'documents') {
        // Add to what the admin already attached — never drop their picks.
        const existing = draftRef.current.knowledge_slugs ?? [];
        const merged = [...new Set([...existing, ...(action.slugs ?? [])])].slice(
          0,
          SCENARIO_LIMITS.knowledgeSlugsMax,
        );
        toApply = { ...action, slugs: merged };
      }
      const { draft: next, changed } = applyAgentAction(draftRef.current, toApply);
      patchDraft(next, changed);
      result(sid, changed.length ? `Applied: ${changed.join(', ')}` : 'Already up to date', true);
    },
    [result, patchDraft, knownSlugsRef],
  );

  const handleAction = useCallback(
    (event: A2uiActionEvent) => {
      const sid = event.surfaceId;
      if (!transcriptRef.current.surfaces[sid]) return; // already handled
      if (!canWriteRef.current) return;
      const c = event.context;
      switch (event.name) {
        case CARD_EVENTS.confirm:
          confirmAction(event);
          return;
        case CARD_EVENTS.cancel:
          result(sid, 'Dismissed', false);
          return;
        case CARD_EVENTS.answer: {
          const label =
            typeof c.label === 'string' && c.label.trim()
              ? c.label.trim()
              : typeof c.value === 'string'
                ? c.value.trim()
                : '';
          if (typeof c.field === 'string' && (ASK_FIELDS as readonly string[]).includes(c.field)) {
            const field = c.field as AskField;
            const value = normalizeFieldValue(field, c.value);
            if (value !== undefined) {
              const r = applyFieldValue(draftRef.current, field, value);
              patchDraft(r.draft, r.changed);
            }
          }
          result(sid, label ? `Answered: ${label}` : 'Answered', true);
          if (label) send(label);
          return;
        }
        case CARD_EVENTS.pick: {
          const field = c.field;
          if (typeof field !== 'string' || !(OFFER_FIELDS as readonly string[]).includes(field)) {
            result(sid, INVALID_RESULT, false);
            return;
          }
          const value = normalizeFieldValue(field as OfferField, c.value);
          if (typeof value !== 'string') {
            result(sid, INVALID_RESULT, false);
            return;
          }
          const r = applyFieldValue(draftRef.current, field as OfferField, value);
          patchDraft(r.draft, r.changed);
          result(sid, `Using: ${clipLabel(value)}`, true);
          return;
        }
        case CARD_EVENTS.goToStep: {
          if (!isStudioStepKey(c.step)) {
            result(sid, INVALID_RESULT, false);
            return;
          }
          onGoToStepRef.current(c.step);
          result(sid, `Opened: ${STUDIO_STEP_LABELS[c.step]}`, true);
          return;
        }
        default:
          return; // unknown event — cards only emit the ones above
      }
    },
    [confirmAction, result, patchDraft, send, canWriteRef, onGoToStepRef],
  );

  const handleDataChange = useCallback(
    (surfaceId: string, path: string, value: unknown) => {
      if (!canWriteRef.current) return;
      update((t) => setSurfaceData(t, surfaceId, path, value));
    },
    [update, canWriteRef],
  );

  // ── Queued prompts (home composer, step buttons) ───────────────────────

  const consumedRef = useRef<number | null>(null);
  useEffect(() => {
    if (!pendingPrompt || busy || sendingRef.current) return;
    if (consumedRef.current === pendingPrompt.id) return; // StrictMode re-run, or already sent
    consumedRef.current = pendingPrompt.id;
    onPendingConsumedRef.current();
    if (canWrite) send(pendingPrompt.text);
  }, [pendingPrompt, busy, canWrite, send, onPendingConsumedRef]);

  // A different scenario starts with an empty composer.
  useEffect(() => {
    setInput('');
  }, [scenarioId]);

  // ── Scrolling ──────────────────────────────────────────────────────────

  const scrollRef = useRef<HTMLDivElement>(null);
  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    nearBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX;
  };
  useEffect(() => {
    if (!nearBottomRef.current) return;
    const el = scrollRef.current;
    if (!el) return;
    if (typeof el.scrollTo === 'function') {
      el.scrollTo({ top: el.scrollHeight, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
    } else {
      el.scrollTop = el.scrollHeight;
    }
  }, [transcript.items.length, transcript.suggestions, busy]);

  // ── Composer ───────────────────────────────────────────────────────────

  const inputRef = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight + 2, COMPOSER_MAX_HEIGHT)}px`;
  }, [input]);

  const submit = () => {
    if (!input.trim() || busy || !canWrite) return;
    if (send(input)) setInput('');
  };

  const onComposerKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────

  const items = transcript.items;
  const last: CopilotItem | undefined = items[items.length - 1];
  const offlineLast = last?.kind === 'assistant' && last.offline ? last : null;
  const greeting = greetingFor(step, draft);
  const starters = starterPrompts(step, draft);
  const showSuggestions = !busy && canWrite && !offlineLast && transcript.suggestions.length > 0;

  return (
    <Glass
      padding={0}
      radius={RADIUS.xl}
      style={{
        height: '100%',
        minHeight: 0,
        boxSizing: 'border-box',
        display: 'grid',
        gridTemplateRows: 'minmax(0, 1fr)',
        gridTemplateColumns: 'minmax(0, 1fr)',
      }}
    >
      <section
        aria-label="Scenario assistant"
        data-variant={variant}
        style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}
      >
        <header
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '14px 16px 12px',
            borderBottom: `1px solid ${COLOR.border}`,
            flexShrink: 0,
          }}
        >
          <AssistMark size={30} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: COLOR.ink, letterSpacing: '-0.01em' }}>
              Scenario assistant
            </h2>
            <div style={{ fontSize: 12, color: COLOR.inkMute, lineHeight: 1.4 }}>
              Suggests — you decide. Nothing is saved until you press Save.
            </div>
          </div>
          {variant === 'drawer' && onClose && (
            <button
              type="button"
              className="pbt-btn"
              onClick={onClose}
              aria-label="Close assistant"
              style={{
                width: 32,
                height: 32,
                borderRadius: 999,
                border: `1px solid ${COLOR.border}`,
                background: 'rgba(255,255,255,0.8)',
                color: COLOR.inkSoft,
                fontSize: 18,
                lineHeight: 1,
                cursor: 'pointer',
                flexShrink: 0,
              }}
            >
              ×
            </button>
          )}
        </header>

        <div
          ref={scrollRef}
          onScroll={onScroll}
          className="pbt-studio-scroll"
          role="group"
          aria-label="Conversation with the scenario assistant"
          style={{
            flex: 1,
            minHeight: 0,
            overflowY: 'auto',
            padding: '16px 14px',
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
          }}
        >
          {items.length === 0 && (
            <EmptyState
              title={greeting.title}
              body={greeting.body}
              starters={starters}
              disabled={!canWrite || busy}
              onPick={send}
            />
          )}

          {items.map((item) => (
            <TranscriptItem
              key={item.id}
              item={item}
              fresh={freshIdsRef.current.has(item.id)}
              transcript={transcript}
              busy={busy}
              readOnly={!canWrite}
              onAction={handleAction}
              onDataChange={handleDataChange}
            />
          ))}

          {busy && (
            <div className="pbt-studio-in" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <AssistMark size={22} />
              <div style={{ ...assistantBubble, padding: '10px 14px' }}>
                <TypingDots label="The assistant is thinking" />
              </div>
            </div>
          )}

          {offlineLast && !busy && canWrite && (
            <div style={{ display: 'flex', gap: 6, paddingLeft: 30 }}>
              <Chip tone="assist" onClick={() => retry(offlineLast.id)}>
                Retry
              </Chip>
            </div>
          )}

          {showSuggestions && (
            <div
              aria-label="Suggested follow-ups"
              role="group"
              style={{ display: 'flex', flexWrap: 'wrap', gap: 6, paddingLeft: 30 }}
            >
              {transcript.suggestions.map((s) => (
                <Chip key={s} tone="assist" onClick={() => send(s)}>
                  {s}
                </Chip>
              ))}
            </div>
          )}
        </div>

        <div
          aria-live="polite"
          style={{
            position: 'absolute',
            width: 1,
            height: 1,
            overflow: 'hidden',
            clip: 'rect(0 0 0 0)',
            whiteSpace: 'nowrap',
          }}
        >
          {announcement}
        </div>

        <footer
          style={{
            flexShrink: 0,
            padding: '10px 12px 12px',
            borderTop: `1px solid ${COLOR.border}`,
            display: 'grid',
            gap: 6,
          }}
        >
          {!canWrite && (
            <div style={{ fontSize: 12, fontWeight: 650, color: COLOR.inkMute }}>
              View only — your role can’t edit scenarios
            </div>
          )}
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
            <textarea
              ref={inputRef}
              className="pbt-studio-field"
              value={input}
              rows={1}
              maxLength={AGENT_LIMITS.maxTurnChars}
              disabled={!canWrite}
              placeholder={composerPlaceholder(step)}
              aria-label="Message the scenario assistant"
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onComposerKey}
              style={composerStyle}
            />
            <button
              type="button"
              className="pbt-btn"
              onClick={submit}
              disabled={!canWrite || busy || !input.trim()}
              aria-label={busy ? 'Waiting for the assistant' : 'Send'}
              style={{
                flexShrink: 0,
                height: 40,
                padding: '0 16px',
                borderRadius: 999,
                border: 'none',
                background: COLOR.brand,
                color: '#fff',
                fontSize: 13,
                fontWeight: 700,
                fontFamily: 'var(--pbt-font)',
                cursor: !canWrite || busy || !input.trim() ? 'not-allowed' : 'pointer',
                opacity: !canWrite || busy || !input.trim() ? 0.45 : 1,
              }}
            >
              Send
            </button>
          </div>
          {input.length >= COUNTER_FROM && (
            <div
              style={{
                justifySelf: 'end',
                fontFamily: 'var(--pbt-mono)',
                fontSize: 11,
                color: input.length >= AGENT_LIMITS.maxTurnChars ? COLOR.danger : COLOR.inkMute,
              }}
            >
              {input.length}/{AGENT_LIMITS.maxTurnChars}
            </div>
          )}
        </footer>
      </section>
    </Glass>
  );
}

// ── Pieces ───────────────────────────────────────────────────────────────

const assistantBubble: CSSProperties = {
  background: 'rgba(255,255,255,0.92)',
  border: '1px solid rgba(60,20,15,0.08)',
  borderRadius: '16px 16px 16px 4px',
  padding: '9px 13px',
  fontSize: 13.5,
  lineHeight: 1.55,
  color: COLOR.ink,
  whiteSpace: 'pre-wrap',
  overflowWrap: 'anywhere',
  boxShadow: '0 1px 2px rgba(60,20,15,0.04)',
  minWidth: 0,
};

const composerStyle: CSSProperties = {
  flex: 1,
  minWidth: 0,
  boxSizing: 'border-box',
  resize: 'none',
  maxHeight: COMPOSER_MAX_HEIGHT,
  padding: '10px 13px',
  borderRadius: 14,
  border: '1px solid rgba(60,20,15,0.14)',
  background: 'rgba(255,255,255,0.85)',
  fontSize: 13.5,
  lineHeight: 1.45,
  fontFamily: 'var(--pbt-font)',
  color: COLOR.ink,
};

function EmptyState({
  title,
  body,
  starters,
  disabled,
  onPick,
}: {
  title: string;
  body: string;
  starters: string[];
  disabled: boolean;
  onPick: (text: string) => void;
}) {
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
        <AssistMark size={22} />
        <div style={assistantBubble}>
          <div style={{ fontWeight: 700, marginBottom: 2 }}>{title}</div>
          <div style={{ color: COLOR.inkSoft }}>{body}</div>
        </div>
      </div>
      <div role="group" aria-label="Starter prompts" style={{ display: 'flex', flexWrap: 'wrap', gap: 6, paddingLeft: 30 }}>
        {starters.map((s) => (
          <Chip key={s} tone="assist" disabled={disabled} onClick={() => onPick(s)}>
            {s}
          </Chip>
        ))}
      </div>
    </div>
  );
}

function TranscriptItem({
  item,
  fresh,
  transcript,
  busy,
  readOnly,
  onAction,
  onDataChange,
}: {
  item: CopilotItem;
  fresh: boolean;
  transcript: CopilotTranscript;
  busy: boolean;
  readOnly: boolean;
  onAction: (event: A2uiActionEvent) => void;
  onDataChange: (surfaceId: string, path: string, value: unknown) => void;
}) {
  const anim = fresh ? 'pbt-studio-in' : undefined;
  switch (item.kind) {
    case 'user':
      return (
        <div
          className={anim}
          data-kind="user"
          style={{
            alignSelf: 'flex-end',
            maxWidth: '88%',
            background: COLOR.brandSoft,
            color: COLOR.ink,
            padding: '9px 13px',
            borderRadius: '16px 16px 4px 16px',
            fontSize: 13.5,
            lineHeight: 1.5,
            whiteSpace: 'pre-wrap',
            overflowWrap: 'anywhere',
          }}
        >
          {item.text}
        </div>
      );
    case 'assistant':
      return (
        <div
          className={anim}
          data-kind={item.offline ? 'offline' : 'assistant'}
          style={{ display: 'flex', gap: 8, alignItems: 'flex-start', maxWidth: '94%' }}
        >
          <AssistMark size={22} />
          <div
            style={
              item.offline
                ? { ...assistantBubble, background: COLOR.warnSoft, borderColor: 'rgba(60,20,15,0.10)' }
                : assistantBubble
            }
          >
            {item.text}
          </div>
        </div>
      );
    case 'surface': {
      const surface = transcript.surfaces[item.surfaceId];
      if (!surface) return null;
      return (
        <div className={anim} data-kind="card" style={{ minWidth: 0 }}>
          <A2uiSurface
            surface={surface}
            onAction={onAction}
            onDataChange={onDataChange}
            busy={busy}
            readOnly={readOnly}
          />
        </div>
      );
    }
    case 'result':
      return (
        <div
          className={anim}
          data-kind="result"
          style={{
            alignSelf: 'center',
            maxWidth: '92%',
            padding: '4px 12px',
            borderRadius: 999,
            fontSize: 12,
            fontWeight: 650,
            textAlign: 'center',
            background: item.ok ? COLOR.successSoft : 'rgba(60,20,15,0.055)',
            color: item.ok ? COLOR.success : COLOR.inkMute,
            overflowWrap: 'anywhere',
          }}
        >
          {item.ok ? '✓ ' : ''}
          {item.text}
        </div>
      );
  }
}
