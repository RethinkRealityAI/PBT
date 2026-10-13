/**
 * The Test drive simulator, driven the way an admin drives it: start the
 * conversation, reply, get an answer, end, see the score — with the AI calls
 * mocked at the Studio's client API (../../api).
 */
import { StrictMode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ChatMessage, ScoreReport } from '../../../../../src/services/types';
import type { StudioDraft } from '../../studioModel';

const api = vi.hoisted(() => ({
  simulateCustomerTurn: vi.fn(),
  simulateScore: vi.fn(),
}));
vi.mock('../../api', () => api);

// eslint-disable-next-line import/first
import { Simulator } from '../Simulator';
// eslint-disable-next-line import/first
import { resetSimulatorSessions } from '../simulatorSession';

// ── fixtures ────────────────────────────────────────────────

const DRAFT: StudioDraft = {
  scenario_id: 'admin:sim',
  species: 'dog',
  breed: 'Labrador Retriever',
  life_stage: 'Adult (3-7)',
  pushback_id: 'cost',
  suggested_driver: 'Analyzer',
  persona_override: 'Skeptical',
  difficulty_override: 2,
  prompt_prefix: 'Mention the price twice.',
  prompt_suffix: '',
};

function aiTurn(text: string, emotion: ChatMessage['emotion'] = 'red'): ChatMessage {
  return { role: 'ai', text, emotion, timestamp: Date.now() };
}

const REPORT: ScoreReport = {
  acknowledge: 82,
  clarify: 76,
  transform: 70,
  empathy: 88,
  rapport: 80,
  overall: 79,
  band: 'ok',
  critique: 'You named the worry before explaining the value.',
  betterAlternative: 'It sounds like cost is the big worry — can I show you the price per day?',
  perDimensionNotes: { acknowledge: '', clarify: '', transform: '', empathy: '', rapport: '' },
  keyMoments: [{ ts: '0:10', type: 'win', label: 'Named the worry', quote: 'I hear you' }],
};

const UNAVAILABLE: ScoreReport = {
  ...REPORT,
  acknowledge: 0,
  clarify: 0,
  transform: 0,
  empathy: 0,
  rapport: 0,
  overall: 0,
  band: 'poor',
  critique: 'Scoring unavailable.',
  scoreUnavailable: true,
};

/** A promise the test resolves by hand, to see in-between states. */
function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

let seq = 0;
function renderSim(overrides: { draft?: StudioDraft; scenarioId?: string } = {}) {
  const onTested = vi.fn();
  const goTo = vi.fn();
  const scenarioId = overrides.scenarioId ?? `admin:sim-${++seq}`;
  const utils = render(
    <Simulator
      draft={overrides.draft ?? DRAFT}
      scenarioId={scenarioId}
      onTested={onTested}
      goTo={goTo}
      onOpenTraineeApp={() => {}}
    />,
  );
  const rerenderWith = (draft: StudioDraft) =>
    utils.rerender(
      <Simulator draft={draft} scenarioId={scenarioId} onTested={onTested} goTo={goTo} onOpenTraineeApp={() => {}} />,
    );
  return { ...utils, onTested, goTo, scenarioId, rerenderWith, user: userEvent.setup() };
}

async function startAndOpen(user: ReturnType<typeof userEvent.setup>, opener = 'It’s far too expensive for what it is.') {
  api.simulateCustomerTurn.mockResolvedValueOnce(aiTurn(opener, 'red'));
  await user.click(screen.getByRole('button', { name: 'Start the conversation' }));
  await screen.findByText(opener);
}

async function reply(user: ReturnType<typeof userEvent.setup>, text: string) {
  const box = screen.getByLabelText('Your reply');
  await user.type(box, text);
  await user.keyboard('{Enter}');
}

beforeEach(() => {
  resetSimulatorSessions();
  api.simulateCustomerTurn.mockReset();
  api.simulateScore.mockReset();
});

// ── tests ───────────────────────────────────────────────────

describe('Simulator', () => {
  it('explains itself, is obviously safe, and the owner opens on Start', async () => {
    const { user } = renderSim();
    expect(screen.getByText('Preview — nothing is recorded and trainees can’t see this.')).toBeInTheDocument();
    expect(screen.getByText('Have a real conversation with the AI owner')).toBeInTheDocument();
    expect(screen.getByText('Cost / price pushback')).toBeInTheDocument();

    await startAndOpen(user);

    expect(api.simulateCustomerTurn).toHaveBeenCalledTimes(1);
    const args = api.simulateCustomerTurn.mock.calls[0][0];
    expect(args.history).toEqual([]);
    expect(args.scenario).toMatchObject({ breed: 'Labrador Retriever', suggestedDriver: 'Analyzer' });
    // The draft's UNSAVED notes go with every turn; a blank one goes as null.
    expect(args.notes).toEqual({ promptPrefix: 'Mention the price twice.', promptSuffix: null });

    expect(screen.getByText('Turn 1 of 16')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /Owner’s mood: Defensive/ })).toBeInTheDocument();
    expect(screen.getByRole('log', { name: 'Conversation with the owner' })).toBeInTheDocument();
  });

  it('shows the trainee’s reply at once, then the owner’s answer', async () => {
    const { user } = renderSim();
    await startAndOpen(user);

    const pending = deferred<ChatMessage>();
    api.simulateCustomerTurn.mockReturnValueOnce(pending.promise);
    await reply(user, 'I hear you — cost matters.');

    const log = screen.getByRole('log');
    expect(within(log).getByText('I hear you — cost matters.')).toBeInTheDocument();
    expect(within(log).getByRole('status', { name: 'The owner is typing' })).toBeInTheDocument();
    expect(screen.getByLabelText('Your reply')).toHaveValue('');

    // History sent = opener + the reply.
    const history = api.simulateCustomerTurn.mock.calls[1][0].history as ChatMessage[];
    expect(history.map((m) => m.role)).toEqual(['ai', 'user']);

    await act(async () => pending.resolve(aiTurn('Okay… go on.', 'yellow')));
    expect(within(log).getByText('Okay… go on.')).toBeInTheDocument();
    expect(within(log).queryByRole('status', { name: 'The owner is typing' })).not.toBeInTheDocument();
    expect(screen.getByRole('img', { name: /Owner’s mood: Receptive/ })).toBeInTheDocument();
  });

  it('a starter chip fills the composer', async () => {
    const { user } = renderSim();
    await startAndOpen(user);
    await user.click(screen.getByRole('button', { name: /A weak reply/ }));
    expect(screen.getByLabelText('Your reply')).toHaveValue('That’s just the price of good food.');
  });

  it('[END_SIMULATION] ends the run, reports it tested once, and scores it', async () => {
    const { user, onTested } = renderSim();
    await startAndOpen(user);

    api.simulateCustomerTurn.mockResolvedValueOnce(aiTurn('Fine, I’ll try a bag. [END_SIMULATION]', 'green'));
    api.simulateScore.mockResolvedValueOnce(REPORT);
    await reply(user, 'Could we try a small bag first?');

    expect(await screen.findByText('The owner ended the conversation')).toBeInTheDocument();
    // The token never reaches the screen.
    expect(screen.getByText('Fine, I’ll try a bag.')).toBeInTheDocument();
    expect(screen.queryByText(/END_SIMULATION/)).not.toBeInTheDocument();
    // The composer is gone.
    expect(screen.queryByLabelText('Your reply')).not.toBeInTheDocument();

    expect(await screen.findByRole('img', { name: 'Overall score 79 out of 100 — On track' })).toBeInTheDocument();
    expect(screen.getByText('The scenario works: good handling scored well.')).toBeInTheDocument();
    expect(screen.getByRole('meter', { name: 'Acknowledge' })).toHaveAttribute('aria-valuenow', '82');
    expect(screen.getByText(REPORT.betterAlternative)).toBeInTheDocument();
    expect(screen.getByText('Named the worry')).toBeInTheDocument();

    expect(onTested).toHaveBeenCalledTimes(1);
    expect(api.simulateScore).toHaveBeenCalledTimes(1);
    const transcript = api.simulateScore.mock.calls[0][0].transcript as ChatMessage[];
    expect(transcript.map((m) => m.text)).toEqual([
      'It’s far too expensive for what it is.',
      'Could we try a small bag first?',
      'Fine, I’ll try a bag.',
    ]);
  });

  it('End & score ends the conversation on the admin’s word', async () => {
    const { user, onTested, goTo } = renderSim();
    await startAndOpen(user);

    const endBtn = screen.getByRole('button', { name: 'End & score' });
    expect(endBtn).toBeDisabled(); // nothing said yet

    api.simulateCustomerTurn.mockResolvedValueOnce(aiTurn('Hm. Maybe.', 'yellow'));
    await reply(user, 'What worries you most about the price?');
    await screen.findByText('Hm. Maybe.');

    const score = deferred<ScoreReport>();
    api.simulateScore.mockReturnValueOnce(score.promise);
    await user.click(screen.getByRole('button', { name: 'End & score' }));

    expect(screen.getByText('You ended the conversation')).toBeInTheDocument();
    expect(screen.getByText('Scoring the conversation…')).toBeInTheDocument();
    expect(onTested).toHaveBeenCalledTimes(1);

    await act(async () => score.resolve({ ...REPORT, overall: 45, band: 'poor' }));
    expect(await screen.findByRole('img', { name: 'Overall score 45 out of 100 — Needs work' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Looks good → Publish' }));
    expect(goTo).toHaveBeenCalledWith('publish');
    expect(onTested).toHaveBeenCalledTimes(1);
  });

  it('an unavailable score is said honestly — no 0/100 — and can be retried', async () => {
    const { user, onTested } = renderSim();
    await startAndOpen(user);
    api.simulateCustomerTurn.mockResolvedValueOnce(aiTurn('Bye [END_SIMULATION]', 'red'));
    api.simulateScore.mockResolvedValueOnce(UNAVAILABLE);
    await reply(user, 'That’s just the price of good food.');

    expect(
      await screen.findByText('Scoring didn’t come back this time — the conversation still counts as tested.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: /Overall score/ })).not.toBeInTheDocument();
    expect(screen.queryByText('0')).not.toBeInTheDocument();
    expect(onTested).toHaveBeenCalledTimes(1);

    api.simulateScore.mockResolvedValueOnce(REPORT);
    await user.click(screen.getByRole('button', { name: 'Retry scoring' }));
    expect(await screen.findByRole('img', { name: /Overall score 79/ })).toBeInTheDocument();
    expect(api.simulateScore).toHaveBeenCalledTimes(2);
    expect(onTested).toHaveBeenCalledTimes(1);
  });

  it('a failed owner turn shows a retry bubble, and Retry works', async () => {
    const { user } = renderSim();
    await startAndOpen(user);

    api.simulateCustomerTurn.mockRejectedValueOnce(new Error('Request failed (502)'));
    await reply(user, 'Tell me more?');
    expect(
      await screen.findByText('The owner didn’t answer (the AI service had a hiccup). Try again.'),
    ).toBeInTheDocument();

    api.simulateCustomerTurn.mockResolvedValueOnce(aiTurn('Well, it’s the monthly cost.', 'yellow'));
    await user.click(screen.getByRole('button', { name: /Retry/ }));
    expect(await screen.findByText('Well, it’s the monthly cost.')).toBeInTheDocument();
    expect(screen.queryByText(/didn’t answer/)).not.toBeInTheDocument();

    // The retry re-sent the same history — the trainee's turn only once.
    const history = api.simulateCustomerTurn.mock.calls[2][0].history as ChatMessage[];
    expect(history.map((m) => m.text)).toEqual(['It’s far too expensive for what it is.', 'Tell me more?']);
  });

  it('a rate limit reads as “going a little fast”', async () => {
    const { user } = renderSim();
    api.simulateCustomerTurn.mockRejectedValueOnce(new Error('Too many requests — please slow down.'));
    await user.click(screen.getByRole('button', { name: 'Start the conversation' }));
    expect(
      await screen.findByText('You’re going a little fast — wait a few seconds and try again.'),
    ).toBeInTheDocument();
    // Nobody can reply before the owner has opened.
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
  });

  it('a draft missing core fields is blocked, with a way to each step that fixes it', async () => {
    const { user, goTo } = renderSim({
      draft: { ...DRAFT, breed: '', life_stage: null, suggested_driver: null },
    });
    expect(screen.getByText('A few answers are missing before the owner can talk')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Start the conversation' })).not.toBeInTheDocument();
    expect(screen.getByText('Needs a breed and a life stage')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Go to the pet →' }));
    expect(goTo).toHaveBeenLastCalledWith('pet');
    await user.click(screen.getByRole('button', { name: 'Go to the owner →' }));
    expect(goTo).toHaveBeenLastCalledWith('customer');
    expect(screen.queryByRole('button', { name: 'Go to the pushback →' })).not.toBeInTheDocument();
    expect(api.simulateCustomerTurn).not.toHaveBeenCalled();
  });

  it('warns when the scenario changed since the conversation started, and Restart tests the new version', async () => {
    const { user, rerenderWith } = renderSim();
    await startAndOpen(user);

    // Card-only changes don't make the test stale…
    rerenderWith({ ...DRAFT, card_title_override: 'A new card title' });
    expect(screen.queryByText(/You’ve changed the scenario/)).not.toBeInTheDocument();

    // …an AI-relevant one does.
    const changed = { ...DRAFT, breed: 'Beagle' };
    rerenderWith(changed);
    expect(
      screen.getByText(
        'You’ve changed the scenario since this conversation started — restart to test the new version.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByText(/Changed: Breed\./)).toBeInTheDocument();

    api.simulateCustomerTurn.mockResolvedValueOnce(aiTurn('Beagles eat a lot, you know.', 'red'));
    const banner = screen.getByText(/Changed: Breed\./).closest('div')!;
    await user.click(within(banner).getByRole('button', { name: /Restart/ }));
    expect(await screen.findByText('Beagles eat a lot, you know.')).toBeInTheDocument();
    expect(screen.queryByText(/You’ve changed the scenario/)).not.toBeInTheDocument();
    expect(api.simulateCustomerTurn.mock.calls.at(-1)![0].scenario.breed).toBe('Beagle');
  });

  it('a run that ends after the draft changed does not mark the new version tested', async () => {
    const { user, onTested, rerenderWith } = renderSim();
    await startAndOpen(user);
    rerenderWith({ ...DRAFT, difficulty_override: 4 });

    api.simulateCustomerTurn.mockResolvedValueOnce(aiTurn('Fine. [END_SIMULATION]', 'green'));
    api.simulateScore.mockResolvedValueOnce(REPORT);
    await reply(user, 'Shall we try it?');
    await screen.findByRole('img', { name: /Overall score 79/ });

    expect(onTested).not.toHaveBeenCalled();
    expect(screen.getByText(/doesn’t count as the test for the current/)).toBeInTheDocument();
  });

  it('StrictMode’s double effects neither double-score nor double-report', async () => {
    const onTested = vi.fn();
    const user = userEvent.setup();
    render(
      <StrictMode>
        <Simulator draft={DRAFT} scenarioId="admin:strict" onTested={onTested} goTo={() => {}} />
      </StrictMode>,
    );
    await startAndOpen(user);
    api.simulateCustomerTurn.mockResolvedValueOnce(aiTurn('Deal. [END_SIMULATION]', 'green'));
    api.simulateScore.mockResolvedValueOnce(REPORT);
    await reply(user, 'Shall we start with a small bag?');
    await screen.findByRole('img', { name: /Overall score 79/ });
    expect(api.simulateCustomerTurn).toHaveBeenCalledTimes(2);
    expect(api.simulateScore).toHaveBeenCalledTimes(1);
    expect(onTested).toHaveBeenCalledTimes(1);
  });

  it('keeps the conversation when the step is left and reopened', async () => {
    const { user, unmount, scenarioId } = renderSim();
    await startAndOpen(user, 'We don’t need a fancy diet.');
    unmount();

    renderSim({ scenarioId });
    expect(screen.getByText('We don’t need a fancy diet.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Start the conversation' })).not.toBeInTheDocument();
  });

  it('reports a run that ended while the step was away once, on return', async () => {
    const { user, unmount, scenarioId, onTested } = renderSim();
    await startAndOpen(user);

    const pending = deferred<ChatMessage>();
    api.simulateCustomerTurn.mockReturnValueOnce(pending.promise);
    api.simulateScore.mockResolvedValueOnce(REPORT);
    await reply(user, 'Can we try a bag?');
    unmount();

    await act(async () => pending.resolve(aiTurn('Sure. [END_SIMULATION]', 'green')));
    expect(onTested).not.toHaveBeenCalled();

    const again = renderSim({ scenarioId });
    await waitFor(() => expect(again.onTested).toHaveBeenCalledTimes(1));
    expect(await screen.findByRole('img', { name: /Overall score 79/ })).toBeInTheDocument();
    expect(onTested).not.toHaveBeenCalled();
  });
});
