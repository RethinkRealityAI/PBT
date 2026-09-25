/**
 * Test drive — one simulated conversation per scenario, kept OUTSIDE React.
 *
 * Why a module-level store rather than component state: the admin often
 * leaves the Test drive mid-conversation to tweak the owner or the brief,
 * then comes back. The conversation (and a score that landed while they were
 * away) should still be there — with the "you've changed the scenario" banner
 * telling them to restart — instead of silently vanishing. Requests resolve
 * into the store whether or not the step is on screen.
 *
 * In memory only: nothing here is persisted, and a reload starts fresh. That
 * is the point of a preview.
 */
import { simulateCustomerTurn, simulateScore } from '../api';
import {
  describeSimError,
  initialSimState,
  simReducer,
  type SimAction,
  type SimConversation,
  type SimState,
} from './simulatorModel';

export interface SimulatorSession {
  getState: () => SimState;
  subscribe: (listener: () => void) => () => void;
  /** The owner opens the conversation. */
  start: (convo: SimConversation) => void;
  /** Send the trainee's reply and wait for the owner. */
  send: (text: string) => void;
  /** Ask again after a failed customer turn (same history). */
  retry: () => void;
  /** End the conversation now and score it. */
  endAndScore: () => void;
  /** Score again after the scorer failed or came back unavailable. */
  retryScore: () => void;
  /** Throw the conversation away (back to idle). */
  restart: () => void;
  /**
   * Take the "a run just ended" notice. True exactly once per ended run —
   * StrictMode's double effects and remounts can't report a run twice.
   */
  takeTestedNotice: () => boolean;
}

export function createSimulatorSession(): SimulatorSession {
  let state: SimState = initialSimState();
  const listeners = new Set<() => void>();

  function dispatch(action: SimAction) {
    const prev = state;
    state = simReducer(state, action);
    if (state === prev) return;
    listeners.forEach((l) => l());
    // Every way into `ended` (token, cap, End & score) scores straight away.
    if (prev.phase !== 'ended' && state.phase === 'ended') void score();
  }

  async function requestCustomerTurn() {
    const { run, convo, messages } = state;
    if (!convo) return;
    try {
      const message = await simulateCustomerTurn({
        scenario: convo.scenario,
        // The canonical transcript never holds error bubbles, so this is
        // exactly what the owner has said and heard so far.
        history: messages.filter((m) => !m._transientError),
        notes: convo.notes,
      });
      dispatch({ type: 'customerReplied', run, message });
    } catch (err) {
      dispatch({ type: 'customerFailed', run, error: describeSimError(err) });
    }
  }

  async function score() {
    const { run, convo, messages } = state;
    if (!convo) return;
    dispatch({ type: 'scoreStarted' });
    if (state.phase !== 'scoring') return;
    try {
      const report = await simulateScore({ scenario: convo.scenario, transcript: messages });
      dispatch({ type: 'scored', run, report });
    } catch (err) {
      dispatch({ type: 'scoreFailed', run, error: describeSimError(err) });
    }
  }

  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    start(convo) {
      if (state.phase !== 'idle') return;
      dispatch({ type: 'start', run: state.run + 1, convo });
      void requestCustomerTurn();
    },
    send(text) {
      const before = state;
      dispatch({ type: 'send', message: { role: 'user', text, timestamp: Date.now() } });
      if (state !== before && state.phase === 'customerTyping') void requestCustomerTurn();
    },
    retry() {
      const before = state;
      dispatch({ type: 'retry' });
      if (state !== before) void requestCustomerTurn();
    },
    endAndScore() {
      dispatch({ type: 'endManually' });
    },
    retryScore() {
      if (state.phase !== 'scoreFailed') return;
      void score();
    },
    restart() {
      dispatch({ type: 'restart', run: state.run + 1 });
    },
    takeTestedNotice() {
      if (!state.testedPending) return false;
      dispatch({ type: 'testedAcknowledged' });
      return true;
    },
  };
}

// ── One session per scenario ────────────────────────────────

const MAX_SESSIONS = 12;
const sessions = new Map<string, SimulatorSession>();

/** The (lazily created) session for a scenario id. */
export function getSimulatorSession(scenarioId: string): SimulatorSession {
  let s = sessions.get(scenarioId);
  if (!s) {
    s = createSimulatorSession();
    sessions.set(scenarioId, s);
    // Oldest first in insertion order — drop the stalest when over the cap.
    while (sessions.size > MAX_SESSIONS) {
      const oldest = sessions.keys().next().value;
      if (oldest === undefined) break;
      sessions.delete(oldest);
    }
  }
  return s;
}

/** Tests only: forget every conversation. */
export function resetSimulatorSessions(): void {
  sessions.clear();
}
