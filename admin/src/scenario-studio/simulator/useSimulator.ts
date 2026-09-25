/**
 * Test drive — the React face of a scenario's simulator session.
 *
 * Adds what depends on the LIVE draft: can it run at all (missing fields),
 * and has it changed since the conversation started (the stale check). It
 * also reports a finished run to the editor (`onTested`) — once per run, and
 * only when the run tested the draft that is on screen now. A run that
 * tested an older version must not mark the new one as tested.
 */
import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import {
  draftToScenario,
  missingScenarioFields,
} from '../../../../src/shared/scenarios/draftToScenario';
import type { Scenario } from '../../../../src/data/scenarios';
import type { StudioDraft } from '../studioModel';
import {
  changedAiFields,
  snapshotAiFields,
  type AiRelevantField,
  type SimConversation,
  type SimState,
} from './simulatorModel';
import { getSimulatorSession } from './simulatorSession';

export interface UseSimulator {
  state: SimState;
  /** The scenario the CURRENT draft would run as (null = something's missing). */
  scenario: Scenario | null;
  /** Human labels of the fields the draft still needs to run. */
  missing: string[];
  /** AI-relevant fields changed since this conversation started. */
  staleFields: AiRelevantField[];
  start: () => void;
  send: (text: string) => void;
  retry: () => void;
  endAndScore: () => void;
  retryScore: () => void;
  restart: () => void;
  /** Restart and, when the draft can run, have the owner open straight away. */
  runAgain: () => void;
}

function blankToNull(v: string | null | undefined): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v : null;
}

/** Freeze what this run tests: the scenario, the draft's notes, a snapshot. */
export function conversationFor(draft: StudioDraft, scenario: Scenario): SimConversation {
  return {
    scenario,
    notes: {
      promptPrefix: blankToNull(draft.prompt_prefix),
      promptSuffix: blankToNull(draft.prompt_suffix),
    },
    snapshot: snapshotAiFields(draft),
  };
}

export function useSimulator({
  draft,
  scenarioId,
  onTested,
}: {
  draft: StudioDraft;
  scenarioId: string;
  onTested: () => void;
}): UseSimulator {
  const session = getSimulatorSession(scenarioId);
  const state = useSyncExternalStore(session.subscribe, session.getState, session.getState);

  const scenario = useMemo(() => draftToScenario(draft), [draft]);
  const missing = useMemo(() => missingScenarioFields(draft), [draft]);
  const staleFields = useMemo(
    () => (state.convo ? changedAiFields(state.convo.snapshot, draft) : []),
    [state.convo, draft],
  );

  const onTestedRef = useRef(onTested);
  onTestedRef.current = onTested;

  // A run ended (token, cap or End & score) — tell the editor, once. The
  // notice is taken even when the run is stale, so it can never fire later
  // against a draft it didn't test.
  const stale = staleFields.length > 0;
  useEffect(() => {
    if (!state.testedPending) return;
    if (!session.takeTestedNotice()) return;
    if (!stale) onTestedRef.current();
  }, [state.testedPending, session, stale]);

  const start = useCallback(() => {
    if (!scenario) return;
    session.start(conversationFor(draft, scenario));
  }, [session, draft, scenario]);

  const runAgain = useCallback(() => {
    session.restart();
    if (scenario) session.start(conversationFor(draft, scenario));
  }, [session, draft, scenario]);

  return {
    state,
    scenario,
    missing,
    staleFields,
    start,
    send: session.send,
    retry: session.retry,
    endAndScore: session.endAndScore,
    retryScore: session.retryScore,
    restart: session.restart,
    runAgain,
  };
}
