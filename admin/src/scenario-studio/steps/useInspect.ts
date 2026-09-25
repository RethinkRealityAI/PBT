/**
 * `useInspect` — one "show me what the server would do" request for the
 * current draft (the knowledge preview, the full briefing).
 *
 * The answer is pinned to the draft it was asked about: once the draft's
 * relevant fields change, `stale` goes true and the UI says so, because a
 * preview of a draft that no longer exists is worse than no preview. Every
 * run carries a ticket so a slow earlier answer can never overwrite a newer
 * one (or land after unmount).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { inspectScenario } from '../api';
import type { ScenarioInspectResponse } from '../../../../src/shared/ai/contract';
import type { StudioDraft } from '../studioModel';
import { inspectSignature } from './knowledgeModel';

export type InspectKind = 'knowledge' | 'prompt';

export interface InspectState {
  status: 'idle' | 'loading' | 'done' | 'error';
  data: ScenarioInspectResponse | null;
  error: string | null;
  /** The draft changed since `data` was fetched. */
  stale: boolean;
  run: () => void;
}

interface Inner {
  status: InspectState['status'];
  data: ScenarioInspectResponse | null;
  error: string | null;
  signature: string | null;
}

const IDLE: Inner = { status: 'idle', data: null, error: null, signature: null };

export function useInspect(draft: StudioDraft, kind: InspectKind): InspectState {
  const [state, setState] = useState<Inner>(IDLE);
  const ticket = useRef(0);
  const draftRef = useRef(draft);
  draftRef.current = draft;

  useEffect(
    () => () => {
      ticket.current += 1;
    },
    [],
  );

  const run = useCallback(() => {
    const mine = ++ticket.current;
    const snapshot = draftRef.current;
    const signature = inspectSignature(snapshot, kind);
    // Keep the previous answer on screen while refreshing — it is dimmed,
    // not blanked, so the panel doesn't jump.
    setState((s) => ({ ...s, status: 'loading', error: null }));
    inspectScenario({
      draft: snapshot,
      include: kind === 'prompt' ? { prompt: true, knowledge: false } : { prompt: false, knowledge: true },
    }).then(
      (data) => {
        if (ticket.current !== mine) return;
        setState({ status: 'done', data, error: null, signature });
      },
      (err: unknown) => {
        if (ticket.current !== mine) return;
        setState((s) => ({
          ...s,
          status: 'error',
          error: err instanceof Error ? err.message : 'The server didn’t answer.',
        }));
      },
    );
  }, [kind]);

  const current = inspectSignature(draft, kind);
  return {
    status: state.status,
    data: state.data,
    error: state.error,
    stale: state.data !== null && state.signature !== current,
    run,
  };
}
