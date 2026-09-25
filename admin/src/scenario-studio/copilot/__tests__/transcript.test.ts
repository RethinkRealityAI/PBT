/**
 * Transcript helpers — pure, immutable, bounded, and safe to restore.
 */
import { describe, it, expect } from 'vitest';
import { A2UI_VERSION, getPath, type A2uiMessage } from '../../../lib/a2ui';
import { AGENT_LIMITS } from '../../../../../src/shared/ai/scenarioAgent';
import { EMPTY_TRANSCRIPT, type CopilotTranscript } from '../types';
import {
  TRANSCRIPT_MAX_ITEMS,
  appendAssistant,
  appendSurface,
  appendUser,
  lastUserText,
  removeItem,
  replaceSurfaceWithResult,
  sanitizeTranscript,
  setSuggestions,
  setSurfaceData,
  transcriptToWire,
} from '../transcript';

function card(sid: string, value: Record<string, unknown> = { proposal: { tool: 'go_to_step', step: 'pet' } }): A2uiMessage[] {
  return [
    { version: A2UI_VERSION, createSurface: { surfaceId: sid } },
    { version: A2UI_VERSION, updateDataModel: { surfaceId: sid, path: '/', value } },
    { version: A2UI_VERSION, updateComponents: { surfaceId: sid, components: [{ id: 'root', component: 'Text', text: 'hi' }] } },
  ];
}

describe('appending', () => {
  it('user and assistant items take ids from the monotonic seq, immutably', () => {
    const t1 = appendUser(EMPTY_TRANSCRIPT, 'Hello', 1);
    const t2 = appendAssistant(t1, 'Hi there', { at: 2 });
    expect(EMPTY_TRANSCRIPT.items).toEqual([]); // never mutated
    expect(t1.items).toEqual([{ id: 'u1', kind: 'user', text: 'Hello', at: 1 }]);
    expect(t2.items[1]).toEqual({ id: 'a2', kind: 'assistant', text: 'Hi there', at: 2 });
    expect(t2.seq).toBe(2);
    const off = appendAssistant(t2, 'offline', { offline: true, at: 3 });
    expect(off.items[2]).toMatchObject({ kind: 'assistant', offline: true });
  });

  it('appendSurface hands a builder a fresh surface id and records the card', () => {
    const t = appendSurface(appendUser(EMPTY_TRANSCRIPT, 'x'), (sid) => card(sid), 5);
    expect(t.seq).toBe(2);
    expect(t.items[1]).toEqual({ id: 's2', kind: 'surface', surfaceId: 'card2', at: 5 });
    expect(t.surfaces.card2.components.root.component).toBe('Text');
    expect(getPath(t.surfaces.card2.dataModel, '/proposal/step')).toBe('pet');
  });

  it('appendSurface also takes ready-made messages (id read from them)', () => {
    const t = appendSurface(EMPTY_TRANSCRIPT, card('mine'));
    expect(t.items[0]).toMatchObject({ kind: 'surface', surfaceId: 'mine' });
    expect(t.surfaces.mine).toBeDefined();
  });

  it('a builder that produces nothing leaves the transcript untouched', () => {
    expect(appendSurface(EMPTY_TRANSCRIPT, () => [])).toBe(EMPTY_TRANSCRIPT);
    expect(appendSurface(EMPTY_TRANSCRIPT, () => card('someone-else'))).toBe(EMPTY_TRANSCRIPT);
  });
});

describe('card outcomes', () => {
  const base = appendAssistant(
    appendSurface(appendSurface(appendUser(EMPTY_TRANSCRIPT, 'q'), (sid) => card(sid)), (sid) => card(sid)),
    'after',
  );

  it('replaceSurfaceWithResult swaps the card for a result pill IN PLACE', () => {
    const t = replaceSurfaceWithResult(base, 'card2', 'Applied: Breed', true, 9);
    expect(t.items.map((i) => i.kind)).toEqual(['user', 'result', 'surface', 'assistant']);
    expect(t.items[1]).toEqual({ id: `r${base.seq + 1}`, kind: 'result', text: 'Applied: Breed', ok: true, at: 9 });
    expect(t.surfaces.card2).toBeUndefined();
    expect(t.surfaces.card3).toBe(base.surfaces.card3);
  });

  it('is a no-op when the card is already gone (double-click on Apply)', () => {
    const once = replaceSurfaceWithResult(base, 'card2', 'Dismissed', false);
    expect(replaceSurfaceWithResult(once, 'card2', 'Dismissed', false)).toBe(once);
    expect(replaceSurfaceWithResult(base, 'nope', 'x', true)).toBe(base);
  });

  it('setSurfaceData writes one card’s model; the other cards keep their identity', () => {
    const t = setSurfaceData(base, 'card2', '/proposal/step', 'brief');
    expect(getPath(t.surfaces.card2.dataModel, '/proposal/step')).toBe('brief');
    expect(getPath(base.surfaces.card2.dataModel, '/proposal/step')).toBe('pet');
    expect(t.surfaces.card3).toBe(base.surfaces.card3);
    expect(t.items).toBe(base.items);
    expect(setSurfaceData(base, 'missing', '/x', 1)).toBe(base);
    expect(setSurfaceData(base, 'card2', '/__proto__/x', 1)).toBe(base);
  });

  it('removeItem drops an item and the card it pointed at', () => {
    const cardItem = base.items.find((i) => i.kind === 'surface')!;
    const t = removeItem(base, cardItem.id);
    expect(t.items).toHaveLength(base.items.length - 1);
    expect(t.surfaces.card2).toBeUndefined();
    expect(removeItem(base, 'nope')).toBe(base);
  });

  it('setSuggestions + lastUserText', () => {
    const t = setSuggestions(base, ['Make it harder']);
    expect(t.suggestions).toEqual(['Make it harder']);
    expect(setSuggestions(EMPTY_TRANSCRIPT, [])).toBe(EMPTY_TRANSCRIPT);
    expect(lastUserText(base)).toBe('q');
    expect(lastUserText(EMPTY_TRANSCRIPT)).toBeNull();
  });
});

describe('bounds', () => {
  it(`keeps the newest ${TRANSCRIPT_MAX_ITEMS} items and drops cards nobody points at`, () => {
    let t: CopilotTranscript = appendSurface(EMPTY_TRANSCRIPT, (sid) => card(sid));
    const firstCard = t.items[0].kind === 'surface' ? t.items[0].surfaceId : '';
    for (let i = 0; i < TRANSCRIPT_MAX_ITEMS + 5; i += 1) t = appendUser(t, `m${i}`);
    expect(t.items).toHaveLength(TRANSCRIPT_MAX_ITEMS);
    expect(t.surfaces[firstCard]).toBeUndefined();
    expect(t.items[t.items.length - 1]).toMatchObject({ text: `m${TRANSCRIPT_MAX_ITEMS + 4}` });
    // ids keep counting — never reused after a trim
    expect(t.seq).toBe(TRANSCRIPT_MAX_ITEMS + 6);
  });
});

describe('transcriptToWire', () => {
  it('sends words and card outcomes, never cards or offline notes', () => {
    let t = appendUser(EMPTY_TRANSCRIPT, 'Build a cat scenario');
    t = appendAssistant(t, 'Here is a start.');
    t = appendSurface(t, (sid) => card(sid));
    const sid = t.items[2].kind === 'surface' ? t.items[2].surfaceId : '';
    t = replaceSurfaceWithResult(t, sid, 'Applied: Breed', true);
    t = appendUser(t, 'Now the owner');
    t = appendAssistant(t, 'I couldn’t reach the assistant just now.', { offline: true });
    expect(transcriptToWire(t)).toEqual([
      { role: 'user', content: 'Build a cat scenario' },
      { role: 'assistant', content: 'Here is a start.' },
      // result + the next message fold into one user turn (Gemini alternation)
      { role: 'user', content: '[tool_result] Applied: Breed\n\nNow the owner' },
    ]);
  });

  it('opens on a user turn and keeps only the most recent turns', () => {
    let t = appendAssistant(EMPTY_TRANSCRIPT, 'stray assistant opener');
    for (let i = 0; i < 40; i += 1) {
      t = appendUser(t, `q${i}`);
      t = appendAssistant(t, `a${i}`);
    }
    t = appendUser(t, 'last');
    const wire = transcriptToWire(t);
    expect(wire.length).toBeLessThanOrEqual(AGENT_LIMITS.maxTurns);
    expect(wire[0].role).toBe('user');
    expect(wire[wire.length - 1]).toEqual({ role: 'user', content: 'last' });
  });

  it('clamps each turn to the server’s per-turn limit', () => {
    const t = appendUser(EMPTY_TRANSCRIPT, 'x'.repeat(AGENT_LIMITS.maxTurnChars + 500));
    expect(transcriptToWire(t)[0].content).toHaveLength(AGENT_LIMITS.maxTurnChars);
  });
});

describe('sanitizeTranscript', () => {
  it('returns the very same object when it is already well-formed', () => {
    let t = appendUser(EMPTY_TRANSCRIPT, 'hi');
    t = appendSurface(t, (sid) => card(sid));
    t = setSuggestions(t, ['one']);
    expect(sanitizeTranscript(t)).toBe(t);
    expect(sanitizeTranscript(EMPTY_TRANSCRIPT)).toBe(EMPTY_TRANSCRIPT);
  });

  it('repairs what storage can hand back', () => {
    expect(sanitizeTranscript(null)).toEqual(EMPTY_TRANSCRIPT);
    expect(sanitizeTranscript('garbage')).toEqual(EMPTY_TRANSCRIPT);
    const repaired = sanitizeTranscript({
      items: [
        { id: 'u7', kind: 'user', text: 'kept', at: 1 },
        { id: 'x', kind: 'weird', at: 1 },
        { id: 's8', kind: 'surface', surfaceId: 'gone', at: 1 }, // its surface is missing
        { id: 'r9', kind: 'result', text: 'no ok flag', at: 1 },
        'not an item',
      ],
      surfaces: { bad: { surfaceId: 'other', components: {}, dataModel: {} } },
      suggestions: ['fine', 3],
      seq: 2,
    });
    expect(repaired.items).toEqual([{ id: 'u7', kind: 'user', text: 'kept', at: 1 }]);
    expect(repaired.surfaces).toEqual({});
    expect(repaired.suggestions).toEqual(['fine']);
    // seq is raised above every id in use so new ids never collide
    expect(repaired.seq).toBeGreaterThanOrEqual(7);
    expect(appendUser(repaired, 'next').items[1].id).toBe(`u${repaired.seq + 1}`);
  });
});
