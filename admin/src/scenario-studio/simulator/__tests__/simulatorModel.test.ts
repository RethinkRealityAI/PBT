import { describe, expect, it } from 'vitest';
import type { ChatMessage, ScoreReport } from '../../../../../src/services/types';
import type { ScenarioOverrideRow } from '../../../data/types';
import { STUDIO_STEPS, type StudioDraft } from '../../studioModel';
import {
  AI_RELEVANT_FIELDS,
  EMOTION_META,
  MAX_CUSTOMER_TURNS,
  MAX_REPLY_CHARS,
  RATE_LIMIT_COPY,
  canEnd,
  canSend,
  changedAiFields,
  changedFieldLabels,
  customerTurnCount,
  describeSimError,
  emotionMeta,
  endReasonAfterCustomerTurn,
  groupMissingByStep,
  hasEndToken,
  initialSimState,
  joinList,
  latestEmotion,
  simReducer,
  snapshotAiFields,
  stripEndToken,
  trySayingFor,
  verdictFor,
  type SimConversation,
  type SimState,
} from '../simulatorModel';

// ── fixtures ────────────────────────────────────────────────

const DRAFT: StudioDraft = {
  scenario_id: 'admin:test',
  species: 'dog',
  breed: 'Labrador Retriever',
  life_stage: 'Adult (3-7)',
  pushback_id: 'cost',
  suggested_driver: 'Analyzer',
  persona_override: 'Skeptical',
  difficulty_override: 2,
  knowledge_slugs: ['b-doc', 'a-doc'],
  prompt_prefix: null,
  card_title_override: 'Card',
};

const CONVO: SimConversation = {
  scenario: {
    breed: 'Labrador Retriever',
    age: 'Adult (3-7)',
    persona: 'Skeptical',
    difficulty: 2,
    pushback: { id: 'cost', title: 'Cost / price pushback', example: '' },
    suggestedDriver: 'Analyzer',
  },
  notes: { promptPrefix: null, promptSuffix: null },
  snapshot: snapshotAiFields(DRAFT),
};

function ai(text: string, emotion?: ChatMessage['emotion']): ChatMessage {
  return { role: 'ai', text, emotion, timestamp: 1 };
}
function user(text: string): ChatMessage {
  return { role: 'user', text, timestamp: 2 };
}

function report(overrides: Partial<ScoreReport> = {}): ScoreReport {
  return {
    acknowledge: 80,
    clarify: 75,
    transform: 70,
    empathy: 85,
    rapport: 78,
    overall: 77,
    band: 'ok',
    critique: 'Solid.',
    betterAlternative: 'Try this.',
    perDimensionNotes: { acknowledge: '', clarify: '', transform: '', empathy: '', rapport: '' },
    keyMoments: [],
    ...overrides,
  };
}

/** Walk a state through a list of actions. */
function run(state: SimState, ...actions: Parameters<typeof simReducer>[1][]): SimState {
  return actions.reduce(simReducer, state);
}

const started = () => run(initialSimState(), { type: 'start', run: 1, convo: CONVO });

// ── end token ───────────────────────────────────────────────

describe('end token', () => {
  it.each([
    '[END_SIMULATION]',
    '[end simulation]',
    '[End-Simulation]',
    '[ END_SIMULATION ]',
    'Thanks for your time. [END_SIMULATION]',
  ])('detects %s', (text) => {
    expect(hasEndToken(text)).toBe(true);
  });

  it('needs the brackets — an owner asking to end is not a close', () => {
    expect(hasEndToken('Can we end this simulation now?')).toBe(false);
    expect(hasEndToken('END_SIMULATION')).toBe(false);
  });

  it('strips every token and tidies the punctuation it leaves behind', () => {
    expect(stripEndToken('Thanks for listening [END_SIMULATION], have a great day')).toBe(
      'Thanks for listening, have a great day',
    );
    expect(stripEndToken('Okay. [END_SIMULATION] [end simulation]')).toBe('Okay.');
    expect(stripEndToken('Deal [END_SIMULATION] .')).toBe('Deal.');
    expect(stripEndToken('[END_SIMULATION]')).toBe('');
    expect(stripEndToken('Nothing to strip here.')).toBe('Nothing to strip here.');
  });
});

// ── mood ────────────────────────────────────────────────────

describe('mood', () => {
  it('names every emotion in the trainee app’s words', () => {
    expect(EMOTION_META.red.label).toBe('Defensive');
    expect(EMOTION_META.yellow.label).toBe('Receptive');
    expect(EMOTION_META.green.label).toBe('Convinced');
    expect([EMOTION_META.red.level, EMOTION_META.yellow.level, EMOTION_META.green.level]).toEqual([1, 2, 3]);
  });

  it('returns null for anything that isn’t a known emotion', () => {
    expect(emotionMeta(undefined)).toBeNull();
    expect(emotionMeta('blue')).toBeNull();
    expect(emotionMeta('green')?.tone).toBe('success');
  });

  it('reads the latest mood, skipping user turns, error bubbles and unread turns', () => {
    const msgs: ChatMessage[] = [
      ai('a', 'red'),
      user('b'),
      ai('c', 'yellow'),
      ai('d'),
      { ...ai('err', 'green'), _transientError: true },
      user('e'),
    ];
    expect(latestEmotion(msgs)).toBe('yellow');
    expect(latestEmotion([])).toBeNull();
  });
});

// ── stale check ─────────────────────────────────────────────

describe('what changed since the conversation started', () => {
  it('ignores card and publish fields', () => {
    const snap = snapshotAiFields(DRAFT);
    const changed = changedAiFields(snap, {
      ...DRAFT,
      card_title_override: 'New card',
      card_subtitle_override: 'Sub',
      visible: true,
      sort_order: 3,
      info_modal_body: 'Hello',
      start_button_label: 'Go',
      title_override: 'Legacy',
    });
    expect(changed).toEqual([]);
  });

  it('reports AI-relevant changes with human labels', () => {
    const snap = snapshotAiFields(DRAFT);
    const changed = changedAiFields(snap, {
      ...DRAFT,
      breed: 'Beagle',
      opening_line_override: 'Hi there.',
      prompt_suffix: 'Stay firm.',
    });
    expect(changed).toEqual(['breed', 'opening_line_override', 'prompt_suffix']);
    expect(changedFieldLabels(changed)).toEqual([
      'Breed',
      'Opening line',
      'Final reminders for the AI',
    ]);
  });

  it('treats blank, null and missing as the same, and document lists as sets', () => {
    const snap = snapshotAiFields(DRAFT);
    expect(
      changedAiFields(snap, {
        ...DRAFT,
        prompt_prefix: '   ',
        context_override: '',
        weight_kg: Number.NaN,
        knowledge_slugs: ['a-doc', 'b-doc'],
      }),
    ).toEqual([]);
    expect(changedAiFields(snap, { ...DRAFT, knowledge_slugs: ['a-doc'] })).toEqual(['knowledge_slugs']);
    expect(changedAiFields(snap, { ...DRAFT, knowledge_slugs: [] })).toEqual(['knowledge_slugs']);
  });

  it('covers every column the Studio edits outside the card/publish/legacy-title fields', () => {
    // Every step's fields, bar the Publish step (card + visibility) and the
    // legacy title (never reaches the AI), must be tracked.
    const untracked: Array<keyof ScenarioOverrideRow> = ['title_override'];
    const expected = STUDIO_STEPS.filter((s) => s.key !== 'publish')
      .flatMap((s) => s.fields)
      .filter((f) => !untracked.includes(f));
    expect([...AI_RELEVANT_FIELDS].sort()).toEqual([...expected].sort());
  });
});

// ── caps ────────────────────────────────────────────────────

describe('turn caps', () => {
  it('counts customer and trainee turns without error bubbles', () => {
    const msgs = [ai('a'), user('b'), { ...ai('x'), _transientError: true as const }, ai('c')];
    expect(customerTurnCount(msgs)).toBe(2);
  });

  it('ends on the token, or at the cap', () => {
    expect(endReasonAfterCustomerTurn(3, false)).toBeNull();
    expect(endReasonAfterCustomerTurn(3, true)).toBe('token');
    expect(endReasonAfterCustomerTurn(MAX_CUSTOMER_TURNS - 1, false)).toBeNull();
    expect(endReasonAfterCustomerTurn(MAX_CUSTOMER_TURNS, false)).toBe('cap');
    // The owner saying goodbye on the last turn is still the owner ending it.
    expect(endReasonAfterCustomerTurn(MAX_CUSTOMER_TURNS, true)).toBe('token');
  });
});

// ── state machine ───────────────────────────────────────────

describe('simReducer', () => {
  it('idle → opening → awaitingTrainee → customerTyping → awaitingTrainee', () => {
    let s = started();
    expect(s.phase).toBe('opening');
    expect(s.run).toBe(1);
    expect(s.convo).toBe(CONVO);

    s = simReducer(s, { type: 'customerReplied', run: 1, message: ai('Hi. It costs too much.', 'red') });
    expect(s.phase).toBe('awaitingTrainee');
    expect(canSend(s)).toBe(true);
    expect(canEnd(s)).toBe(false); // nobody has replied yet

    s = simReducer(s, { type: 'send', message: user('  I hear you.  ') });
    expect(s.phase).toBe('customerTyping');
    expect(s.messages.at(-1)).toMatchObject({ role: 'user', text: 'I hear you.' });

    s = simReducer(s, { type: 'customerReplied', run: 1, message: ai('Go on.', 'yellow') });
    expect(s.phase).toBe('awaitingTrainee');
    expect(canEnd(s)).toBe(true);
  });

  it('only starts from idle', () => {
    const s = started();
    expect(simReducer(s, { type: 'start', run: 2, convo: CONVO })).toBe(s);
  });

  it('ignores empty sends and sends while the owner is typing; caps reply length', () => {
    let s = run(started(), { type: 'customerReplied', run: 1, message: ai('Hi', 'red') });
    expect(simReducer(s, { type: 'send', message: user('   ') })).toBe(s);
    s = simReducer(s, { type: 'send', message: user('x'.repeat(MAX_REPLY_CHARS + 50)) });
    expect(s.messages.at(-1)!.text).toHaveLength(MAX_REPLY_CHARS);
    expect(simReducer(s, { type: 'send', message: user('again') })).toBe(s);
  });

  it('ends on the token, strips it, and flags the run as tested', () => {
    let s = run(
      started(),
      { type: 'customerReplied', run: 1, message: ai('Hi', 'red') },
      { type: 'send', message: user('Let’s try a small bag.') },
    );
    s = simReducer(s, {
      type: 'customerReplied',
      run: 1,
      message: ai('Fine, I’ll try it [END_SIMULATION]', 'green'),
    });
    expect(s.phase).toBe('ended');
    expect(s.endReason).toBe('token');
    expect(s.testedPending).toBe(true);
    expect(s.messages.at(-1)!.text).toBe('Fine, I’ll try it');
  });

  it('adds no empty bubble when the turn was only the token', () => {
    let s = run(
      started(),
      { type: 'customerReplied', run: 1, message: ai('Hi', 'red') },
      { type: 'send', message: user('Bye') },
    );
    s = simReducer(s, { type: 'customerReplied', run: 1, message: ai('[END_SIMULATION]', 'green') });
    expect(s.phase).toBe('ended');
    expect(s.messages).toHaveLength(2);
  });

  it('ends at the 16th customer turn', () => {
    let s = started();
    for (let i = 1; i < MAX_CUSTOMER_TURNS; i++) {
      s = simReducer(s, { type: 'customerReplied', run: 1, message: ai(`turn ${i}`, 'yellow') });
      expect(s.phase).toBe('awaitingTrainee');
      s = simReducer(s, { type: 'send', message: user(`reply ${i}`) });
    }
    s = simReducer(s, { type: 'customerReplied', run: 1, message: ai('turn 16', 'yellow') });
    expect(s.phase).toBe('ended');
    expect(s.endReason).toBe('cap');
    expect(customerTurnCount(s.messages)).toBe(MAX_CUSTOMER_TURNS);
  });

  it('a failed opening waits for Retry and blocks sending', () => {
    let s = simReducer(started(), {
      type: 'customerFailed',
      run: 1,
      error: { reason: 'no connection to the server', rateLimited: false },
    });
    expect(s.phase).toBe('awaitingTrainee');
    expect(s.error?.kind).toBe('opening');
    expect(canSend(s)).toBe(false);
    s = simReducer(s, { type: 'retry' });
    expect(s.phase).toBe('opening');
    expect(s.error).toBeNull();
  });

  it('a failed reply keeps the trainee’s message and retries the same history', () => {
    let s = run(
      started(),
      { type: 'customerReplied', run: 1, message: ai('Hi', 'red') },
      { type: 'send', message: user('Hello') },
      { type: 'customerFailed', run: 1, error: { reason: 'x', rateLimited: false } },
    );
    expect(s.error?.kind).toBe('reply');
    expect(s.messages.map((m) => m.text)).toEqual(['Hi', 'Hello']);
    expect(canSend(s)).toBe(true); // may rephrase instead of retrying
    s = simReducer(s, { type: 'retry' });
    expect(s.phase).toBe('customerTyping');
    s = simReducer(s, { type: 'customerReplied', run: 1, message: ai('Hm.', 'yellow') });
    expect(s.error).toBeNull();
    expect(s.messages.map((m) => m.text)).toEqual(['Hi', 'Hello', 'Hm.']);
  });

  it('drops answers that belong to an earlier run', () => {
    let s = run(started(), { type: 'restart', run: 2 });
    s = simReducer(s, { type: 'start', run: 3, convo: CONVO });
    const late = simReducer(s, { type: 'customerReplied', run: 1, message: ai('stale', 'red') });
    expect(late).toBe(s);
    const lateFail = simReducer(s, { type: 'customerFailed', run: 2, error: { reason: 'x', rateLimited: false } });
    expect(lateFail).toBe(s);
  });

  it('End & score needs one trainee turn and a quiet owner', () => {
    let s = run(started(), { type: 'customerReplied', run: 1, message: ai('Hi', 'red') });
    expect(simReducer(s, { type: 'endManually' })).toBe(s);
    s = simReducer(s, { type: 'send', message: user('Hello') });
    expect(simReducer(s, { type: 'endManually' })).toBe(s); // owner still typing
    s = simReducer(s, { type: 'customerReplied', run: 1, message: ai('Mm', 'yellow') });
    s = simReducer(s, { type: 'endManually' });
    expect(s.phase).toBe('ended');
    expect(s.endReason).toBe('manual');
    expect(s.testedPending).toBe(true);
  });

  it('scores: real report → scored; unavailable → scoreFailed (never a zero); thrown → scoreFailed', () => {
    const ended = run(
      started(),
      { type: 'customerReplied', run: 1, message: ai('Hi', 'red') },
      { type: 'send', message: user('Hello') },
      { type: 'customerReplied', run: 1, message: ai('Ok [END_SIMULATION]', 'green') },
      { type: 'scoreStarted' },
    );
    expect(ended.phase).toBe('scoring');

    const scored = simReducer(ended, { type: 'scored', run: 1, report: report() });
    expect(scored.phase).toBe('scored');
    expect(scored.report?.overall).toBe(77);

    const unavailable = simReducer(ended, {
      type: 'scored',
      run: 1,
      report: report({ overall: 0, scoreUnavailable: true }),
    });
    expect(unavailable.phase).toBe('scoreFailed');
    expect(unavailable.report).toBeNull();

    const thrown = simReducer(ended, { type: 'scoreFailed', run: 1, error: { reason: RATE_LIMIT_COPY, rateLimited: true } });
    expect(thrown.phase).toBe('scoreFailed');
    expect(thrown.scoreError?.rateLimited).toBe(true);

    // Retry scoring from a failure.
    expect(simReducer(thrown, { type: 'scoreStarted' }).phase).toBe('scoring');
  });

  it('acknowledges the tested notice once; restart clears everything', () => {
    let s = run(
      started(),
      { type: 'customerReplied', run: 1, message: ai('Hi', 'red') },
      { type: 'send', message: user('Hello') },
      { type: 'customerReplied', run: 1, message: ai('[END_SIMULATION]') },
    );
    s = simReducer(s, { type: 'testedAcknowledged' });
    expect(s.testedPending).toBe(false);
    expect(simReducer(s, { type: 'testedAcknowledged' })).toBe(s);
    const fresh = simReducer(s, { type: 'restart', run: 5 });
    expect(fresh).toEqual(initialSimState(5));
  });
});

// ── errors ──────────────────────────────────────────────────

describe('describeSimError', () => {
  it('maps rate limits to the slow-down line', () => {
    expect(describeSimError(new Error('Too many requests — please slow down.'))).toEqual({
      reason: RATE_LIMIT_COPY,
      rateLimited: true,
    });
    expect(describeSimError(new Error('Request failed (429)')).rateLimited).toBe(true);
  });

  it('says what went wrong in plain words', () => {
    expect(describeSimError(new TypeError('Failed to fetch')).reason).toBe('no connection to the server');
    expect(describeSimError(new Error('Not signed in')).reason).toMatch(/signed out/);
    expect(describeSimError(new Error('Request failed (502)')).reason).toBe('the AI service had a hiccup');
    expect(describeSimError(new Error('scenario is missing required fields.')).reason).toBe(
      'scenario is missing required fields',
    );
    expect(describeSimError(null).reason).toBe('no reason given');
  });
});

// ── composer + blocked helpers ──────────────────────────────

describe('helpers', () => {
  it('offers a weak reply, an acknowledge and a clarify question', () => {
    const cost = trySayingFor('cost');
    expect(cost.map((t) => t.kind)).toEqual(['weak', 'acknowledge', 'clarify']);
    expect(cost[0].text).toBe('That’s just the price of good food.');
    expect(cost[1].text).toBe('It sounds like you’re worried about…');
    expect(cost[2].text).toBe('Can you tell me more about…');
    expect(trySayingFor('custom')[0].text).toBe('That’s just what we recommend.');
    expect(trySayingFor(null)[0].text).toBe('That’s just what we recommend.');
  });

  it('groups missing fields under the step that fixes them', () => {
    expect(groupMissingByStep(['ECHO driver', 'Breed', 'Life stage'])).toEqual([
      { step: 'pet', fields: ['Breed', 'Life stage'] },
      { step: 'customer', fields: ['ECHO driver'] },
    ]);
    expect(groupMissingByStep(['Pushback'])).toEqual([{ step: 'pushback', fields: ['Pushback'] }]);
  });

  it('joins lists in plain English', () => {
    expect(joinList([])).toBe('');
    expect(joinList(['a'])).toBe('a');
    expect(joinList(['a', 'b'])).toBe('a and b');
    expect(joinList(['a', 'b', 'c'])).toBe('a, b and c');
  });
});

// ── verdict ─────────────────────────────────────────────────

describe('verdictFor', () => {
  const cameRound = [ai('No.', 'red'), user('I hear you.'), ai('Okay, fine.', 'green')];
  const heldFirm = [ai('No.', 'red'), user('It’s just the price.'), ai('Still no.', 'red')];

  it('good handling + owner came round → the scenario works', () => {
    const v = verdictFor(report({ overall: 82 }), cameRound);
    expect(v.tone).toBe('success');
    expect(v.headline).toBe('The scenario works: good handling scored well.');
    expect(v.fix).toBeUndefined();
  });

  it('good handling but the owner never moved → suggests the owner step', () => {
    const v = verdictFor(report({ overall: 72 }), heldFirm);
    expect(v.tone).toBe('warn');
    expect(v.fix?.step).toBe('customer');
  });

  it('weak handling + owner held firm → the scenario is doing its job', () => {
    const v = verdictFor(report({ overall: 40, band: 'poor' }), heldFirm);
    expect(v.tone).toBe('info');
    expect(v.headline).toMatch(/held firm/);
  });

  it('weak handling but the owner caved → too easy', () => {
    const v = verdictFor(report({ overall: 40, band: 'poor' }), cameRound);
    expect(v.tone).toBe('warn');
    expect(v.headline).toMatch(/came round/);
  });
});
