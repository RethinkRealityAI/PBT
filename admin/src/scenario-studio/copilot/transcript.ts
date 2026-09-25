/**
 * Pure helpers over the assistant transcript (`CopilotTranscript`).
 *
 * The transcript is lifted to the Studio shell and persisted with the local
 * draft, so every change goes through these immutable helpers: the panel
 * never mutates it, and a restored transcript is sanitised before it is
 * rendered (storage is untrusted — it can be stale, truncated or edited).
 *
 * Ids come from the monotonic `seq`: every append takes the next number, so
 * ids stay unique across a session even after old items are dropped.
 */
import { applySurfaceMessages, setPath, type A2uiMessage, type SurfaceState } from '../../lib/a2ui';
import { AGENT_LIMITS, mergeWireTurns, type AgentTurn } from '../../../../src/shared/ai/scenarioAgent';
import { EMPTY_TRANSCRIPT, type CopilotItem, type CopilotTranscript } from './types';

/** Items kept; older ones (and the cards they pointed at) are dropped. */
export const TRANSCRIPT_MAX_ITEMS = 60;

/** Prefix that marks a card outcome on the wire. */
export const TOOL_RESULT_PREFIX = '[tool_result]';

/** Keep the newest items and only the surfaces they still reference. */
function bound(t: CopilotTranscript): CopilotTranscript {
  const items = t.items.length > TRANSCRIPT_MAX_ITEMS ? t.items.slice(-TRANSCRIPT_MAX_ITEMS) : t.items;
  const referenced = new Set<string>();
  for (const item of items) if (item.kind === 'surface') referenced.add(item.surfaceId);
  let surfaces = t.surfaces;
  const orphans = Object.keys(surfaces).filter((id) => !referenced.has(id));
  if (orphans.length) {
    surfaces = { ...surfaces };
    for (const id of orphans) delete surfaces[id];
  }
  return items === t.items && surfaces === t.surfaces ? t : { ...t, items, surfaces };
}

export function appendUser(t: CopilotTranscript, text: string, at = Date.now()): CopilotTranscript {
  const seq = t.seq + 1;
  return bound({ ...t, seq, items: [...t.items, { id: `u${seq}`, kind: 'user', text, at }] });
}

export function appendAssistant(
  t: CopilotTranscript,
  text: string,
  opts: { offline?: boolean; at?: number } = {},
): CopilotTranscript {
  const seq = t.seq + 1;
  const item: CopilotItem = {
    id: `a${seq}`,
    kind: 'assistant',
    text,
    at: opts.at ?? Date.now(),
    ...(opts.offline ? { offline: true } : {}),
  };
  return bound({ ...t, seq, items: [...t.items, item] });
}

/**
 * Append an interactive card. Pass either the surface messages themselves
 * (the surface id is read from them) or a builder that receives a fresh,
 * unique surface id — the usual form:
 *
 *   appendSurface(t, (sid) => buildActionSurface(action, sid, ctx))
 *
 * Returns `t` unchanged when the messages don't produce a surface.
 */
export function appendSurface(
  t: CopilotTranscript,
  messages: A2uiMessage[] | ((surfaceId: string) => A2uiMessage[]),
  at = Date.now(),
): CopilotTranscript {
  const seq = t.seq + 1;
  const list = typeof messages === 'function' ? messages(`card${seq}`) : messages;
  const surfaceId = typeof messages === 'function' ? `card${seq}` : surfaceIdOf(list);
  if (!surfaceId || list.length === 0) return t;
  const surfaces = applySurfaceMessages(t.surfaces, list);
  if (!surfaces[surfaceId]) return t;
  return bound({
    ...t,
    seq,
    surfaces,
    items: [...t.items, { id: `s${seq}`, kind: 'surface', surfaceId, at }],
  });
}

function surfaceIdOf(messages: A2uiMessage[]): string | null {
  for (const m of messages) {
    const id =
      m.createSurface?.surfaceId ??
      m.updateComponents?.surfaceId ??
      m.updateDataModel?.surfaceId ??
      null;
    if (id) return id;
  }
  return null;
}

/**
 * A card's outcome: the card (item + surface) is removed and a result pill
 * takes its place in the conversation. No-op when the card is already gone,
 * which is what makes a double-click on Apply harmless.
 */
export function replaceSurfaceWithResult(
  t: CopilotTranscript,
  surfaceId: string,
  text: string,
  ok: boolean,
  at = Date.now(),
): CopilotTranscript {
  const idx = t.items.findIndex((i) => i.kind === 'surface' && i.surfaceId === surfaceId);
  if (idx < 0) return t;
  const seq = t.seq + 1;
  const items = t.items.slice();
  items[idx] = { id: `r${seq}`, kind: 'result', text, ok, at };
  const { [surfaceId]: _gone, ...surfaces } = t.surfaces;
  void _gone;
  return bound({ ...t, seq, items, surfaces });
}

/** Remove one item (and its card, if it was one). */
export function removeItem(t: CopilotTranscript, itemId: string): CopilotTranscript {
  const item = t.items.find((i) => i.id === itemId);
  if (!item) return t;
  return bound({ ...t, items: t.items.filter((i) => i.id !== itemId) });
}

/** Two-way binding write into one card's data model. Other cards keep identity. */
export function setSurfaceData(
  t: CopilotTranscript,
  surfaceId: string,
  path: string,
  value: unknown,
): CopilotTranscript {
  const surf = t.surfaces[surfaceId];
  if (!surf) return t;
  const model = setPath(surf.dataModel, path, value);
  const dataModel =
    model !== null && typeof model === 'object' && !Array.isArray(model)
      ? (model as Record<string, unknown>)
      : {};
  if (dataModel === surf.dataModel) return t;
  return { ...t, surfaces: { ...t.surfaces, [surfaceId]: { ...surf, dataModel } } };
}

export function setSuggestions(t: CopilotTranscript, suggestions: string[]): CopilotTranscript {
  if (suggestions.length === 0 && t.suggestions.length === 0) return t;
  return { ...t, suggestions };
}

/** The last thing the admin said, or null. */
export function lastUserText(t: CopilotTranscript): string | null {
  for (let i = t.items.length - 1; i >= 0; i -= 1) {
    const item = t.items[i];
    if (item.kind === 'user') return item.text;
  }
  return null;
}

/**
 * The conversation as the model sees it: what the admin typed, what the
 * assistant said, and each card's outcome as a `[tool_result] …` user turn.
 * Cards themselves are UI, not conversation, and offline fallbacks are not
 * the model's words — both are left out. Consecutive same-role turns are
 * merged (Gemini needs alternation), the window is capped to the server's
 * turn limit, and it always opens on a user turn.
 */
export function transcriptToWire(t: CopilotTranscript): AgentTurn[] {
  const turns: AgentTurn[] = [];
  for (const item of t.items) {
    if (item.kind === 'user') turns.push({ role: 'user', content: item.text });
    else if (item.kind === 'assistant' && !item.offline) turns.push({ role: 'assistant', content: item.text });
    else if (item.kind === 'result') turns.push({ role: 'user', content: `${TOOL_RESULT_PREFIX} ${item.text}` });
  }
  const merged = mergeWireTurns(
    turns.map((turn) => ({ ...turn, content: turn.content.slice(0, AGENT_LIMITS.maxTurnChars) })),
  ).slice(-AGENT_LIMITS.maxTurns);
  while (merged.length && merged[0].role !== 'user') merged.shift();
  return merged;
}

// ── Restoring persisted transcripts ──────────────────────────────────────

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function validItem(raw: unknown): raw is CopilotItem {
  if (!isRecord(raw) || typeof raw.id !== 'string' || typeof raw.at !== 'number') return false;
  switch (raw.kind) {
    case 'user':
    case 'assistant':
      return typeof raw.text === 'string';
    case 'surface':
      return typeof raw.surfaceId === 'string';
    case 'result':
      return typeof raw.text === 'string' && typeof raw.ok === 'boolean';
    default:
      return false;
  }
}

function validSurface(raw: unknown, id: string): raw is SurfaceState {
  return (
    isRecord(raw) &&
    raw.surfaceId === id &&
    isRecord(raw.components) &&
    isRecord(raw.dataModel)
  );
}

/**
 * A transcript that is safe to render. Returns the SAME object when it is
 * already well-formed (so identity-based change detection keeps working);
 * otherwise a repaired copy: malformed items and surfaces dropped, cards
 * whose surface is missing dropped, and `seq` raised above every id in use.
 */
export function sanitizeTranscript(raw: unknown): CopilotTranscript {
  if (!isRecord(raw)) return EMPTY_TRANSCRIPT;
  const rawItems = Array.isArray(raw.items) ? raw.items : [];
  const rawSurfaces = isRecord(raw.surfaces) ? raw.surfaces : {};
  const surfaces: Record<string, SurfaceState> = {};
  for (const [id, s] of Object.entries(rawSurfaces)) if (validSurface(s, id)) surfaces[id] = s;
  const items = rawItems.filter(
    (i): i is CopilotItem => validItem(i) && (i.kind !== 'surface' || i.surfaceId in surfaces),
  );
  const suggestions = Array.isArray(raw.suggestions)
    ? raw.suggestions.filter((s): s is string => typeof s === 'string')
    : [];
  let seq = typeof raw.seq === 'number' && Number.isFinite(raw.seq) ? Math.floor(raw.seq) : 0;
  for (const item of items) {
    const n = Number(item.id.replace(/^\D+/, ''));
    if (Number.isFinite(n) && n > seq) seq = n;
  }
  const clean =
    Array.isArray(raw.items) &&
    items.length === rawItems.length &&
    isRecord(raw.surfaces) &&
    Object.keys(surfaces).length === Object.keys(rawSurfaces).length &&
    Array.isArray(raw.suggestions) &&
    suggestions.length === raw.suggestions.length &&
    seq === raw.seq;
  if (clean) return bound(raw as unknown as CopilotTranscript);
  return bound({ items, surfaces, suggestions, seq });
}
