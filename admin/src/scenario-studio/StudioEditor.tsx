/**
 * Scenario Studio — the guided editor frame.
 *
 *   ┌ header: ← Studio · title · Live/Draft · saved state · [More] [Save draft] [Publish] ┐
 *   │ step rail │ one step at a time (Continue →)            │ ✦ assistant (≥ dock width) │
 *   └───────────┴────────────────────────────────────────────┴────────────────────────────┘
 *
 * The frame owns the draft, saving/publishing, local persistence and the
 * assistant plumbing; the steps (./steps/*) only render fields through
 * `StepProps`. Breakpoints are measured on the editor's own width, not the
 * window's — the admin sidebar takes a variable share of the screen:
 *
 *   ≥ DOCK_MIN_WIDTH   rail · step · docked assistant
 *   ≥ RAIL_MIN_WIDTH   rail · step, assistant in a slide-over drawer
 *   narrower           step chips above the step, drawer assistant
 *
 * Nothing is lost by leaving: unsaved work (and the assistant conversation)
 * is written to this browser as you go (./localDrafts), and the Studio offers
 * it back. The only unload guard is while a save is in flight.
 */
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Glass } from '../primitives/Glass';
import { SectionTabsProvider } from '../primitives/Shell';
import { Button, InlineAlert } from '../primitives/form';
import { ReadOnlyBanner } from '../primitives/access';
import { useConfirm } from '../primitives/Confirm';
import { useToast } from '../primitives/Toast';
import { COLOR } from '../lib/tokens';
import { deleteScenarioOverride, upsertScenarioOverride } from '../data/queries';
import { stripServerManaged } from '../data/scenarioManifest';
import { speciesOf } from '../../../src/shared/scenarios/species';
import {
  SOURCE_LABELS,
  STUDIO_STEPS,
  aiSignature,
  blankToNull,
  buildStudioContext,
  canPublish,
  draftsDiffer,
  FIELD_LABELS,
  localEntryHasChanges,
  rebaseLocalDraft,
  nextStep,
  overriddenFieldLabels,
  previousStep,
  readiness,
  relativeTime,
  saveBlockers,
  stepIndex,
  stepStatus,
  studioTitle,
  type SaveBlocker,
  type StudioDraft,
  type StudioSource,
  type StudioStepKey,
} from './studioModel';
import {
  clearLocalDraft,
  readLocalDraft,
  writeLocalDraft,
  type LocalDraftEntry,
} from './localDrafts';
import { EMPTY_TRANSCRIPT, type CopilotTranscript } from './copilot/types';
import type { KnowledgeState, StepProps } from './types';
import { StatusDot, StepHeading, SPECIES_GLYPH } from './ui';
import { StepRail, type RailStep } from './StepRail';
import {
  AssistantColumn,
  AssistantDrawer,
  AssistantLauncher,
  type AssistantPanelProps,
} from './AssistantDock';
import { PetStep } from './steps/PetStep';
import { PushbackStep } from './steps/PushbackStep';
import { CustomerStep } from './steps/CustomerStep';
import { KnowledgeStep } from './steps/KnowledgeStep';
import { BriefStep } from './steps/BriefStep';
import { TestDriveStep } from './steps/TestDriveStep';
import { PublishStep } from './steps/PublishStep';

/** Editor width at which the assistant docks as a third column. */
export const DOCK_MIN_WIDTH = 1140;
/** Editor width at which the step rail sits beside the step. */
export const RAIL_MIN_WIDTH = 900;

/** The step card: Glass's look without its backdrop-filter (see where it's used). */
const STEP_SURFACE: React.CSSProperties = {
  position: 'relative',
  borderRadius: 22,
  background: 'linear-gradient(180deg, rgba(255,255,255,0.94) 0%, rgba(255,255,255,0.84) 100%)',
  border: '0.5px solid rgba(255,255,255,0.95)',
  boxShadow: [
    '0 1px 0 rgba(255,255,255,0.95) inset',
    '0 1px 2px rgba(60,20,15,0.04)',
    '0 8px 24px -10px rgba(60,20,15,0.10)',
    '0 24px 60px -24px rgba(60,20,15,0.12)',
  ].join(', '),
};

const RAIL_WIDTH = 220;
const DOCK_WIDTH = 380;
/** How long an edit waits before it is written to this browser. */
const PERSIST_DEBOUNCE_MS = 400;

type Busy = 'save' | 'publish' | 'unpublish' | 'delete' | null;

export interface StudioEditorProps {
  scenarioId: string;
  source: StudioSource;
  /** The saved state (server-hydrated), or the seed of a never-saved draft. */
  initialDraft: StudioDraft;
  /** The built-in values of a library scenario (what Revert restores). */
  base: StudioDraft | null;
  /** Nothing is on the server yet — a new scenario or an unsaved copy. */
  isNew: boolean;
  /** An override row exists, so Revert / Delete apply. */
  hasOverride: boolean;
  /** Title of the scenario this unsaved copy was made from. */
  copiedFrom?: string | null;
  /** The name the scenario goes by elsewhere (built-in / trainee title). */
  fallbackTitle?: string | null;
  /** Draft → the sparse row a save writes (fields equal to the base → null). */
  sparsify: (d: StudioDraft) => StudioDraft;
  /** Every OTHER library/admin scenario is hidden — unpublishing empties the app. */
  isOnlyVisible: boolean;
  canWrite: boolean;
  knowledge: KnowledgeState;
  /**
   * Whether the database can store `species` (deferred migration). `false`
   * blocks publishing a CAT scenario; undefined = unknown, never blocks.
   */
  speciesSupported?: boolean;
  initialStep?: StudioStepKey;
  /** Open with the assistant showing. */
  openAssistant?: boolean;
  /** A first message for the assistant (the home composer's description). */
  initialPrompt?: string | null;
  /** Apply this scenario's locally kept work straight away (the admin chose Resume). */
  resumeLocal?: boolean;
  onClose: () => void;
  /** Something reached the server — refresh the list. */
  onSaved: () => void;
  /** Open an unsaved copy of this draft. */
  onDuplicate: (draft: StudioDraft, title: string) => void;
}

// ── Small hooks ──────────────────────────────────────────────

/** The element's width; null until first measured (before the first paint). */
function useElementWidth(ref: React.RefObject<HTMLElement | null>): number | null {
  const [width, setWidth] = useState<number | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const w = el.getBoundingClientRect().width;
      setWidth(w > 0 ? w : window.innerWidth);
    };
    measure();
    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(measure);
      ro.observe(el);
    }
    window.addEventListener('resize', measure);
    return () => {
      ro?.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [ref]);
  return width;
}

function useElementHeight(ref: React.RefObject<HTMLElement | null>, fallback: number): number {
  const [height, setHeight] = useState(fallback);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const h = el.getBoundingClientRect().height;
      if (h > 0) setHeight(h);
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return height;
}

function errorText(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback;
}

/** "the pushback" / "Knowledge" — how a step name reads mid-sentence. */
function inSentence(label: string): string {
  return label.replace(/^The /, 'the ');
}

// ── The editor ───────────────────────────────────────────────

export function StudioEditor(props: StudioEditorProps) {
  const {
    scenarioId,
    source,
    initialDraft,
    base,
    isNew,
    hasOverride,
    copiedFrom = null,
    fallbackTitle = null,
    sparsify,
    isOnlyVisible,
    canWrite,
    knowledge,
    onClose,
    onSaved,
    onDuplicate,
  } = props;
  const toast = useToast();
  const confirm = useConfirm();

  // ── Initial state, including anything kept in this browser ──
  const [boot] = useState(() => {
    const local = canWrite ? readLocalDraft(scenarioId) : null;
    const seed: StudioDraft = { ...initialDraft, scenario_id: scenarioId };
    const start = {
      draft: seed,
      step: props.initialStep ?? ('pet' as StudioStepKey),
      transcript: EMPTY_TRANSCRIPT as CopilotTranscript,
      testedSig: null as string | null,
      offer: null as LocalDraftEntry | null,
    };
    if (!local) return start;
    // Only the admin's OWN edits count as unsaved work — measured against
    // the version they started from (`baseline`), not against today's
    // server copy. A kept assistant conversation or a Test drive with no
    // edits restores silently; it never raises the offer.
    const hasEdits = localEntryHasChanges(local);
    if (hasEdits && !props.resumeLocal) {
      // Unsaved work from earlier that the server doesn't have: offer it,
      // don't impose it — the saved version may have moved on since.
      return { ...start, offer: local };
    }
    // Resuming lays ONLY those edits over the current server draft;
    // `visible` (publish state) always comes from the server.
    const draft = hasEdits ? rebaseLocalDraft(local, seed).draft : seed;
    return {
      draft,
      step: props.initialStep ?? local.step ?? 'pet',
      transcript: local.transcript ?? EMPTY_TRANSCRIPT,
      testedSig: local.tested ? aiSignature(local.draft) : null,
      offer: null,
    };
  });

  const [draft, setDraft] = useState<StudioDraft>(boot.draft);
  const [step, setStep] = useState<StudioStepKey>(boot.step);
  const [transcript, setTranscript] = useState<CopilotTranscript>(boot.transcript);
  const [testedSig, setTestedSig] = useState<string | null>(boot.testedSig);
  const [offer, setOffer] = useState<LocalDraftEntry | null>(boot.offer);
  /**
   * Editing waits for an answer to the "unsaved changes from earlier" offer:
   * new edits made on top of the saved version would otherwise have to either
   * overwrite that older work or go unkept — both are lost work.
   */
  const editable = canWrite && offer === null;
  /** The server has this scenario (false for a new scenario / unsaved copy). */
  const [savedOnce, setSavedOnce] = useState(!isNew);
  /** What the server holds — `{}` until a never-saved draft is first saved. */
  const [baseline, setBaseline] = useState<StudioDraft>(() =>
    isNew ? {} : { ...initialDraft, scenario_id: scenarioId },
  );
  const [rowSaved, setRowSaved] = useState(false);
  const [busy, setBusy] = useState<Busy>(null);
  const [blockers, setBlockers] = useState<SaveBlocker[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [speciesPending, setSpeciesPending] = useState(false);
  const [pending, setPending] = useState<{ id: number; text: string } | null>(() =>
    canWrite && props.initialPrompt ? { id: 1, text: props.initialPrompt } : null,
  );
  const pendingSeq = useRef(1);
  const [dockHidden, setDockHidden] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(Boolean(props.openAssistant && canWrite));
  const [seenItems, setSeenItems] = useState(boot.transcript.items.length);

  const rootRef = useRef<HTMLDivElement | null>(null);
  const headerRef = useRef<HTMLDivElement | null>(null);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const headingRef = useRef<HTMLDivElement | null>(null);
  const alertRef = useRef<HTMLDivElement | null>(null);
  const measuredWidth = useElementWidth(rootRef);
  const width = measuredWidth ?? (typeof window !== 'undefined' ? window.innerWidth : 1280);
  const headerHeight = useElementHeight(headerRef, 76);

  const layout: 'wide' | 'medium' | 'narrow' =
    width >= DOCK_MIN_WIDTH ? 'wide' : width >= RAIL_MIN_WIDTH ? 'medium' : 'narrow';
  // The assistant waits for the real width: mounting it docked and then
  // re-mounting it in the drawer would start (and drop) its first reply twice.
  const assistantAvailable = canWrite && measuredWidth !== null;
  const docked = assistantAvailable && layout === 'wide' && !dockHidden;

  // ── Derived ──
  const offerSummary = useMemo(() => {
    if (!offer) return { edited: [] as string[], serverMoved: false };
    const r = rebaseLocalDraft(offer, { ...initialDraft, scenario_id: scenarioId });
    return {
      edited: r.edited.map((k) => FIELD_LABELS[k] ?? String(k)),
      serverMoved: r.serverMoved,
    };
  }, [offer, initialDraft, scenarioId]);
  const tested = testedSig !== null && testedSig === aiSignature(draft);
  const knowledgeDocs = knowledge.loading || knowledge.error ? null : knowledge.docs;
  const ctx = useMemo(
    () =>
      buildStudioContext({
        draft,
        source,
        tested,
        docs: knowledgeDocs,
        // A save already told us the column is missing — believe it even if
        // the capabilities probe hasn't answered.
        speciesSupported: speciesPending ? false : props.speciesSupported,
      }),
    [draft, source, tested, knowledgeDocs, speciesPending, props.speciesSupported],
  );
  const dirty = draftsDiffer(draft, baseline);
  const title = studioTitle(draft, fallbackTitle);
  /** Trainees can see the SAVED version. User-built scenarios are never "live" for everyone. */
  const live = source !== 'user' && savedOnce && baseline.visible === true;
  const rowExists = hasOverride || rowSaved;
  /**
   * A blank new scenario nobody has touched yet — nothing worth keeping.
   * (A copy, or never-saved work being resumed, is worth keeping as it is.)
   */
  const startedBlank = isNew && !copiedFrom && !props.resumeLocal;
  const untouchedSeed =
    startedBlank &&
    !savedOnce &&
    !draftsDiffer(draft, { ...initialDraft, scenario_id: scenarioId }) &&
    transcript.items.length === 0;

  // Live refs for callbacks that must not go stale (persist-on-unmount, the
  // assistant's handlers).
  const latest = useRef({ draft, baseline, step, transcript, tested, title, untouchedSeed, dirty, offer });
  latest.current = { draft, baseline, step, transcript, tested, title, untouchedSeed, dirty, offer };
  const suppressLeaveToast = useRef(false);

  // ── Local persistence ──
  const persistNow = useCallback(() => {
    if (!canWrite) return;
    const s = latest.current;
    // Older unsaved work is waiting for a Resume / Discard answer — writing
    // now would overwrite it without asking.
    if (s.offer) return;
    const keep =
      !s.untouchedSeed &&
      (draftsDiffer(s.draft, s.baseline) || s.transcript.items.length > 0 || s.tested);
    if (!keep) {
      if (readLocalDraft(scenarioId)) clearLocalDraft(scenarioId);
      return;
    }
    writeLocalDraft(scenarioId, {
      draft: s.draft,
      baseline: JSON.stringify(s.baseline),
      step: s.step,
      transcript: s.transcript,
      tested: s.tested,
      title: s.title,
      savedAt: Date.now(),
    });
  }, [canWrite, scenarioId]);

  useEffect(() => {
    const id = window.setTimeout(persistNow, PERSIST_DEBOUNCE_MS);
    return () => window.clearTimeout(id);
  }, [draft, baseline, step, transcript, tested, offer, persistNow]);

  // Flush on refresh / tab close, so the last keystroke isn't the one lost.
  useEffect(() => {
    const flush = () => {
      if (!suppressLeaveToast.current) persistNow();
    };
    window.addEventListener('pagehide', flush);
    return () => window.removeEventListener('pagehide', flush);
  }, [persistNow]);

  // Leaving the editor never asks — the work is kept — but it says so. The
  // toast is scheduled from the cleanup and cancelled if the effect re-runs
  // (StrictMode's mount → unmount → mount), so only a real unmount shows it.
  const leaveTimer = useRef<number | null>(null);
  useEffect(() => {
    if (leaveTimer.current !== null) {
      window.clearTimeout(leaveTimer.current);
      leaveTimer.current = null;
    }
    return () => {
      if (suppressLeaveToast.current) return;
      persistNow();
      const s = latest.current;
      if (!canWrite || !s.dirty || s.untouchedSeed || s.offer) return;
      leaveTimer.current = window.setTimeout(() => {
        toast({
          message: 'Your changes are kept — resume any time from the Studio.',
          tone: 'info',
        });
      }, 0);
    };
  }, [persistNow, toast, canWrite]);

  // A save is the one moment closing the tab can lose something.
  useEffect(() => {
    if (!busy) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [busy]);

  // Once the admin has been shown what blocks a save, keep the list live so
  // fixing a field visibly clears its line.
  useEffect(() => {
    setBlockers((b) => (b.length === 0 ? b : saveBlockers(draft, source)));
  }, [draft, source]);

  // ── Step navigation ──
  // On a step change (not on mount): bring the step's top into view and move
  // focus to its heading, so keyboard and screen-reader users land on it.
  const shownStep = useRef(step);
  useEffect(() => {
    if (shownStep.current === step) return;
    shownStep.current = step;
    const host = hostRef.current;
    if (host && host.getBoundingClientRect().top < headerHeight) {
      host.scrollIntoView?.({ block: 'start' });
    }
    headingRef.current?.focus({ preventScroll: true });
    // Only when the step changes; the header height is read, not tracked.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  const goTo = useCallback((next: StudioStepKey) => setStep(next), []);

  const patch = useCallback(
    (p: StudioDraft) => setDraft((d) => ({ ...d, ...p, scenario_id: scenarioId })),
    [scenarioId],
  );

  // ── Assistant plumbing ──
  const askAssistant = useCallback(
    (text: string) => {
      if (!canWrite) return;
      pendingSeq.current += 1;
      setPending({ id: pendingSeq.current, text });
      if (layout === 'wide') setDockHidden(false);
      else setDrawerOpen(true);
    },
    [canWrite, layout],
  );

  const onAssistantPatch = useCallback(
    (p: StudioDraft, summary: string) => {
      patch(p);
      // `summary` already reads "Applied: …" (CopilotPanelProps contract).
      toast({ message: summary, tone: 'success', duration: 3500 });
    },
    [patch, toast],
  );

  const assistantVisible = docked || (layout !== 'wide' && drawerOpen);
  useEffect(() => {
    if (assistantVisible) setSeenItems(transcript.items.length);
  }, [assistantVisible, transcript.items.length]);
  const hasNews = !assistantVisible && transcript.items.length > seenItems;

  const panel: AssistantPanelProps = {
    scenarioId,
    draft,
    step,
    canWrite: editable,
    knowledge,
    onPatch: onAssistantPatch,
    onGoToStep: goTo,
    transcript,
    onTranscriptChange: setTranscript,
    pendingPrompt: pending,
    onPendingConsumed: () => setPending(null),
  };

  // ── Saving ──
  function focusAlerts() {
    window.setTimeout(() => alertRef.current?.focus({ preventScroll: false }), 0);
  }

  async function persist(mode: 'save' | 'publish' | 'unpublish'): Promise<boolean> {
    if (!editable || busy) return false;
    const next: StudioDraft =
      mode === 'publish'
        ? { ...draft, visible: true }
        : mode === 'unpublish'
          ? { ...draft, visible: false }
          : draft;

    // Everything the server would refuse, said before the request goes out —
    // and in the field's own words rather than a column name.
    const blocking = saveBlockers(next, source);
    setBlockers(blocking);
    if (blocking.length > 0) {
      setError(null);
      toast({
        message:
          blocking.length === 1
            ? 'One thing to sort out before this can be saved — it’s shown at the top.'
            : `${blocking.length} things to sort out before this can be saved — they’re shown at the top.`,
        tone: 'error',
      });
      focusAlerts();
      return false;
    }

    // Hiding the last scenario anyone can see empties the trainee app.
    if (next.visible === false && live && isOnlyVisible) {
      const ok = await confirm({
        title: 'Hide the last visible scenario?',
        body: 'Every other scenario is already hidden from trainees.',
        consequences: [
          'The app will show “no scenarios available” to every trainee.',
          'Nobody can start a session until something is published again.',
        ],
        confirmLabel: 'Hide it anyway',
        tone: 'danger',
      });
      if (!ok) return false;
    }

    setBusy(mode);
    setError(null);
    try {
      const payload = blankToNull(stripServerManaged(sparsify(next)));
      const res = await upsertScenarioOverride({ ...payload, scenario_id: scenarioId });
      const notice = (res as { _notice?: unknown } | null | undefined)?._notice;
      setBaseline(next);
      // Keep anything typed while the request was in flight; only the
      // published flag is taken from what was saved.
      setDraft((cur) => ({ ...cur, visible: next.visible }));
      setSavedOnce(true);
      setRowSaved(true);
      setBlockers([]);
      onSaved();

      const name = studioTitle(next, fallbackTitle);
      if (mode === 'publish') {
        toast({
          message: live
            ? `Updated — trainees get the new “${name}” from their next session.`
            : `“${name}” is live — trainees can practise it now.`,
          tone: 'success',
        });
      } else if (mode === 'unpublish') {
        toast({ message: `Unpublished — trainees can’t see “${name}” any more.`, tone: 'success' });
      } else if (source === 'user') {
        toast({
          message: 'Saved. The trainee who built it still sees their own version.',
          tone: 'success',
        });
      } else if (next.visible) {
        toast({ message: `Saved — trainees see the new “${name}” now.`, tone: 'success' });
      } else {
        toast({
          message: 'Saved as a draft — trainees can’t see it yet.',
          tone: 'success',
          action: { label: 'Go to Publish', onClick: () => setStep('publish') },
        });
      }

      if (notice === 'species_column_missing') {
        setSpeciesPending(true);
        // Published before we knew the species couldn't be stored (the
        // capabilities probe hadn't answered): a CAT scenario must not stay
        // live as a dog roleplay. Take it straight back to a hidden draft.
        if (next.visible === true && next.species === 'cat') {
          try {
            const hidden = { ...next, visible: false };
            await upsertScenarioOverride({
              ...blankToNull(stripServerManaged(sparsify(hidden))),
              scenario_id: scenarioId,
            });
            setBaseline(hidden);
            setDraft((cur) => ({ ...cur, visible: false }));
            onSaved();
            toast({
              message:
                'Saved as a hidden draft instead — cat scenarios can go live once a pending database update is applied. Until then trainees would get it as a dog.',
              tone: 'error',
              duration: 14000,
            });
          } catch (err) {
            toast({
              message: `This cat scenario is live but will play as a dog until a database update is applied — unpublish it from the Publish step. (${errorText(err, 'unpublish failed')})`,
              tone: 'error',
              duration: 16000,
            });
          }
          return false;
        }
        toast({
          message:
            'Saved — but the species isn’t stored yet (a database update is pending), so trainees will see this as a dog scenario for now.',
          tone: 'info',
          duration: 12000,
        });
      }
      return true;
    } catch (err) {
      const message = errorText(err, 'The save didn’t go through');
      setError(message);
      toast({ message: `Couldn’t save — ${message}`, tone: 'error' });
      return false;
    } finally {
      setBusy(null);
    }
  }

  async function publish() {
    if (!editable || busy) return;
    const items = readiness(draft, ctx);
    if (!canPublish(items)) {
      setStep('publish');
      toast({
        message: 'Not quite ready to go live — the checklist on the Publish step shows what’s missing.',
        tone: 'error',
      });
      return;
    }
    // Retitling the card doesn't need a new test; changing the conversation does.
    const aiChanged = !live || aiSignature(draft) !== aiSignature(baseline);
    if (!ctx.tested && aiChanged) {
      const ok = await confirm({
        title: live ? 'Update the live scenario without a test drive?' : 'Publish without a test drive?',
        body: 'A short practice conversation on the Test drive step shows how the AI owner really behaves. Nothing is recorded and it takes a couple of minutes.',
        confirmLabel: live ? 'Update anyway' : 'Publish anyway',
        cancelLabel: 'Not yet',
      });
      if (!ok) return;
    }
    await persist('publish');
  }

  // ── Revert / delete / discard ──
  function leaveForGood() {
    suppressLeaveToast.current = true;
    clearLocalDraft(scenarioId);
    onClose();
  }

  async function revertToBuiltIn() {
    const fields = overriddenFieldLabels(sparsify(baseline), { baseVisible: true });
    const ok = await confirm({
      title: 'Revert this scenario to its built-in version?',
      body:
        source === 'user'
          ? 'Your saved changes are removed; the scenario goes back to exactly what the trainee built.'
          : 'Your saved changes are removed; the scenario goes back to exactly what the app ships.',
      consequences: [
        ...(fields.length > 0
          ? fields.map((f) => `“${f}” goes back to the built-in value.`)
          : ['No fields carry a change right now — this just clears the saved row.']),
        ...(dirty ? ['Your unsaved edits here are discarded too.'] : []),
        'Recoverable from Audit → Revert.',
      ],
      confirmLabel: 'Revert to built-in',
      tone: 'danger',
    });
    if (!ok) return;
    setBusy('delete');
    try {
      await deleteScenarioOverride(scenarioId);
      toast({ message: 'Reverted to the built-in scenario.', tone: 'success' });
      onSaved();
      leaveForGood();
    } catch (err) {
      const message = errorText(err, 'Revert failed');
      setError(message);
      toast({ message: `Couldn’t revert — ${message}`, tone: 'error' });
    } finally {
      setBusy(null);
    }
  }

  async function deleteScenario() {
    const ok = await confirm({
      title: `Delete “${title}”?`,
      body: 'It was written in the Studio, so there is no built-in version underneath to fall back to.',
      consequences: [
        'It disappears from the app straight away, for everyone.',
        ...(live && isOnlyVisible
          ? ['It is the only scenario trainees can see — the app will show none.']
          : []),
        'Past training sessions and their scores are untouched.',
        'Recoverable from Audit → Revert.',
      ],
      confirmLabel: 'Delete scenario',
      tone: 'danger',
    });
    if (!ok) return;
    setBusy('delete');
    try {
      await deleteScenarioOverride(scenarioId);
      toast({
        message: `“${title}” deleted — restore it from Audit → Revert if that was a mistake.`,
        tone: 'success',
      });
      onSaved();
      leaveForGood();
    } catch (err) {
      const message = errorText(err, 'Delete failed');
      setError(message);
      toast({ message: `Couldn’t delete — ${message}`, tone: 'error' });
    } finally {
      setBusy(null);
    }
  }

  async function discardNewDraft() {
    const ok = await confirm({
      title: 'Discard this draft?',
      body: 'It has never been saved, so it only exists in this browser.',
      consequences: ['Everything on every step is thrown away, with the assistant conversation.'],
      confirmLabel: 'Discard draft',
      cancelLabel: 'Keep it',
      tone: 'danger',
    });
    if (ok) leaveForGood();
  }

  function resumeOffer() {
    if (!offer) return;
    const rebased = rebaseLocalDraft(offer, { ...initialDraft, scenario_id: scenarioId });
    setDraft(rebased.draft);
    if (rebased.serverMoved) {
      toast({
        message:
          'This scenario was also changed since you started — only your edits were applied on top of the latest version. Check it before saving.',
        tone: 'info',
        duration: 10_000,
      });
    }
    setStep(offer.step ?? step);
    setTranscript(offer.transcript ?? EMPTY_TRANSCRIPT);
    setSeenItems(offer.transcript?.items.length ?? 0);
    setTestedSig(offer.tested ? aiSignature(offer.draft) : null);
    setOffer(null);
  }

  function discardOffer() {
    clearLocalDraft(scenarioId);
    setOffer(null);
  }

  // ── Rendering ──
  const railSteps: RailStep[] = STUDIO_STEPS.map((s) => {
    const st = stepStatus(s.key, draft, ctx);
    return { key: s.key, label: s.label, status: st.status, detail: st.detail };
  });
  const i = stepIndex(step);
  const def = STUDIO_STEPS[i];
  const prev = previousStep(step);
  const next = nextStep(step);

  const stepProps: StepProps = {
    draft,
    patch,
    source,
    canWrite: editable,
    base,
    ctx,
    goTo,
    askAssistant,
    knowledge,
  };

  const pad = width < 640 ? 14 : 28;
  const gridColumns =
    layout === 'narrow'
      ? 'minmax(0, 1fr)'
      : docked
        ? `${RAIL_WIDTH}px minmax(0, 1fr) ${DOCK_WIDTH}px`
        : `${RAIL_WIDTH}px minmax(0, 1fr)`;

  const speciesGlyph =
    draft.species === 'cat' || draft.species === 'dog'
      ? SPECIES_GLYPH[draft.species]
      : source === 'admin' && !savedOnce
        ? '🐾'
        : SPECIES_GLYPH[speciesOf(draft.species)];

  const saveState: { tone: 'success' | 'warn' | 'neutral'; text: string } = !savedOnce
    ? { tone: 'warn', text: layout === 'narrow' ? 'Not saved yet' : 'Not saved yet — kept in this browser' }
    : dirty
      ? { tone: 'warn', text: 'Unsaved changes' }
      : { tone: 'neutral', text: 'All changes saved' };

  const statusDot =
    source === 'user' ? (
      <StatusDot tone="neutral">Trainee’s own</StatusDot>
    ) : live ? (
      <StatusDot tone="success">Live</StatusDot>
    ) : (
      <StatusDot tone="neutral">{source === 'library' ? 'Hidden from trainees' : 'Draft (hidden)'}</StatusDot>
    );

  const menuItems: MenuItem[] = [];
  if (canWrite) {
    menuItems.push({
      label: 'Duplicate',
      hint: 'Open a copy to edit separately',
      onSelect: () => onDuplicate(draft, title),
    });
    if (source !== 'admin' && rowExists) {
      menuItems.push({
        label: 'Revert to built-in…',
        hint: 'Throw away the saved changes',
        danger: true,
        onSelect: () => void revertToBuiltIn(),
      });
    }
    if (source === 'admin' && rowExists) {
      menuItems.push({
        label: 'Delete scenario…',
        hint: 'Recoverable from Audit',
        danger: true,
        onSelect: () => void deleteScenario(),
      });
    }
    if (source === 'admin' && !savedOnce) {
      menuItems.push({
        label: 'Discard this draft…',
        hint: 'It was never saved',
        danger: true,
        onSelect: () => void discardNewDraft(),
      });
    }
  }

  const stepBody = (() => {
    switch (step) {
      case 'pet':
        return <PetStep {...stepProps} />;
      case 'pushback':
        return <PushbackStep {...stepProps} />;
      case 'customer':
        return <CustomerStep {...stepProps} />;
      case 'knowledge':
        return <KnowledgeStep {...stepProps} />;
      case 'brief':
        return <BriefStep {...stepProps} />;
      case 'test':
        return (
          <TestDriveStep
            {...stepProps}
            scenarioId={scenarioId}
            onTested={() => setTestedSig(aiSignature(latest.current.draft))}
          />
        );
      case 'publish':
        return (
          <PublishStep
            {...stepProps}
            live={live}
            savedOnce={savedOnce}
            dirty={dirty}
            busy={busy === 'save' || busy === 'publish' || busy === 'unpublish' ? busy : null}
            speciesPending={speciesPending}
            fallbackTitle={fallbackTitle}
            onPublish={() => void publish()}
            onSaveDraft={() => void persist('save')}
            onUnpublish={() => void persist('unpublish')}
            onDuplicate={() => onDuplicate(draft, title)}
          />
        );
    }
  })();

  return (
    <SectionTabsProvider value={{ tabs: [], active: '', onChange: () => {} }}>
      <div
        ref={rootRef}
        style={{
          maxWidth: 1480,
          margin: '0 auto',
          padding: `16px ${pad}px 96px`,
          boxSizing: 'border-box',
          width: '100%',
        }}
      >
        {/* ── Sticky header ── */}
        <div ref={headerRef} style={{ position: 'sticky', top: 0, zIndex: 20, paddingTop: 4, marginBottom: 16 }}>
          {/* Near-opaque: the step content scrolls UNDER this bar, and the
              default glass tint let scrolled text read through the title. */}
          <Glass
            padding={layout === 'narrow' ? 12 : '12px 16px'}
            radius={18}
            shine={false}
            style={{ background: 'rgba(255,255,255,0.94)' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <Button tone="ghost" onClick={onClose} aria-label="Back to the Studio" style={{ paddingLeft: 8 }}>
                ← Studio
              </Button>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: '1 1 260px' }}>
                <span
                  aria-hidden
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: 12,
                    background: 'rgba(255,255,255,0.9)',
                    border: `1px solid ${COLOR.border}`,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 20,
                    flexShrink: 0,
                  }}
                >
                  {speciesGlyph}
                </span>
                <div style={{ minWidth: 0 }}>
                  <h1
                    style={{
                      margin: 0,
                      fontSize: 18,
                      fontWeight: 750,
                      letterSpacing: '-0.02em',
                      color: COLOR.ink,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                    title={`${title} — reference ${scenarioId}`}
                  >
                    {title}
                  </h1>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      flexWrap: 'wrap',
                      marginTop: 2,
                      fontSize: 12,
                      color: COLOR.inkMute,
                    }}
                  >
                    <span>{SOURCE_LABELS[source]}</span>
                    {statusDot}
                    {canWrite && (
                      <span role="status" aria-live="polite">
                        <StatusDot tone={saveState.tone}>{saveState.text}</StatusDot>
                      </span>
                    )}
                  </div>
                </div>
              </div>
              {canWrite && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginLeft: 'auto' }}>
                  {menuItems.length > 0 && <MoreMenu items={menuItems} disabled={busy !== null || !editable} />}
                  {source === 'user' ? (
                    <Button tone="primary" busy={busy === 'save'} disabled={busy !== null || !editable} onClick={() => void persist('save')}>
                      Save changes
                    </Button>
                  ) : live ? (
                    <Button tone="primary" busy={busy === 'publish'} disabled={busy !== null || !editable} onClick={() => void publish()}>
                      Update live scenario
                    </Button>
                  ) : (
                    <>
                      <Button tone="secondary" busy={busy === 'save'} disabled={busy !== null || !editable} onClick={() => void persist('save')}>
                        Save draft
                      </Button>
                      <Button tone="primary" busy={busy === 'publish'} disabled={busy !== null || !editable} onClick={() => void publish()}>
                        Publish
                      </Button>
                    </>
                  )}
                </div>
              )}
            </div>
            {(blockers.length > 0 || error) && (
              <div ref={alertRef} tabIndex={-1} style={{ marginTop: 10, outline: 'none' }}>
                {blockers.length > 0 && (
                  <InlineAlert
                    tone="error"
                    title={
                      blockers.length === 1
                        ? 'One thing to sort out before this can be saved'
                        : `${blockers.length} things to sort out before this can be saved`
                    }
                  >
                    <ul style={{ margin: '4px 0 0', paddingLeft: 18, display: 'grid', gap: 4 }}>
                      {blockers.map((b) => (
                        <li key={b.message}>
                          {b.message}{' '}
                          {b.step !== step && (
                            <LinkButton onClick={() => setStep(b.step)}>
                              Go to {inSentence(STUDIO_STEPS[stepIndex(b.step)].label)} →
                            </LinkButton>
                          )}
                        </li>
                      ))}
                    </ul>
                  </InlineAlert>
                )}
                {error && (
                  <InlineAlert tone="error" title="The server didn’t accept that" style={{ marginTop: blockers.length ? 8 : 0 }}>
                    {error}
                  </InlineAlert>
                )}
              </div>
            )}
          </Glass>
        </div>

        {layout === 'narrow' && (
          <div style={{ marginBottom: 12 }}>
            <StepRail steps={railSteps} active={step} onSelect={goTo} orientation="horizontal" />
          </div>
        )}

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: gridColumns,
            gap: 20,
            alignItems: 'start',
          }}
        >
          {layout !== 'narrow' && (
            <div style={{ position: 'sticky', top: headerHeight + 12 }}>
              <StepRail steps={railSteps} active={step} onSelect={goTo} orientation="vertical" />
            </div>
          )}

          <main
            ref={hostRef}
            aria-label="Scenario step"
            style={{ minWidth: 0, scrollMarginTop: headerHeight + 16 }}
          >
            <div
              style={{
                display: 'grid',
                gap: 12,
                marginBottom:
                  !canWrite || offer || (copiedFrom && !savedOnce) || source === 'user' ? 12 : 0,
              }}
            >
              <ReadOnlyBanner permission="scenarios.write">
                You can look through this scenario, but not change it — editing needs the{' '}
                <code style={{ fontFamily: 'var(--pbt-mono)', fontWeight: 700 }}>scenarios.write</code>{' '}
                permission.
              </ReadOnlyBanner>
              {offer && (
                <InlineAlert tone="warn" title={`You have unsaved changes from ${relativeTime(offer.savedAt)}`}>
                  <div>
                    They were kept in this browser but never saved
                    {offerSummary.edited.length > 0 && (
                      <>
                        {' '}— {offerSummary.edited.slice(0, 4).join(', ')}
                        {offerSummary.edited.length > 4 ? ` and ${offerSummary.edited.length - 4} more` : ''}
                      </>
                    )}
                    . Pick up where you left off, or discard them and work from the saved version —
                    editing starts once you choose.
                  </div>
                  {offerSummary.serverMoved && (
                    <div style={{ marginTop: 6, fontWeight: 700 }}>
                      Someone has saved this scenario since. Resuming applies only your edits on top of
                      their version — it never changes whether the scenario is live.
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                    <Button tone="primary" size="sm" onClick={resumeOffer}>
                      Resume
                    </Button>
                    <Button tone="secondary" size="sm" onClick={discardOffer}>
                      Discard
                    </Button>
                  </div>
                </InlineAlert>
              )}
              {copiedFrom && !savedOnce && (
                <InlineAlert tone="info" title="This is an unsaved copy">
                  Copied from “{copiedFrom}”. Nothing reaches trainees until you save and publish it —
                  a copy always starts as a hidden draft.
                </InlineAlert>
              )}
              {source === 'user' && (
                <InlineAlert tone="warn" title="Edits here don’t reach the trainee who built this">
                  The app doesn’t apply Studio changes to a trainee’s own scenario. To offer your
                  version to everyone, duplicate it and publish the copy.{' '}
                  {canWrite && (
                    <LinkButton onClick={() => onDuplicate(draft, title)}>Duplicate it →</LinkButton>
                  )}
                </InlineAlert>
              )}
            </div>

            {/* Not <Glass>: its backdrop-filter makes the surface the
                containing block for position:fixed descendants, so a dialog
                opened inside a step (InfoTip, Modal) would be trapped in it.
                Same look, no filter. */}
            <div style={{ ...STEP_SURFACE, padding: layout === 'narrow' ? 18 : 26 }}>
              <div ref={headingRef} tabIndex={-1} style={{ outline: 'none' }}>
                <StepHeading
                  eyebrow={`Step ${i + 1} of ${STUDIO_STEPS.length} · ${def.label}`}
                  title={def.title}
                  hint={def.hint}
                />
              </div>
              <div key={step} className="pbt-studio-in" style={{ marginTop: 22 }}>
                {stepBody}
              </div>
              <StepFooter
                prevLabel={prev ? STUDIO_STEPS[stepIndex(prev)].label : null}
                nextLabel={next ? STUDIO_STEPS[stepIndex(next)].label : null}
                onPrev={() => prev && setStep(prev)}
                onNext={() => next && setStep(next)}
              />
            </div>
          </main>

          {docked && (
            <AssistantColumn panel={panel} top={headerHeight + 12} onClose={() => setDockHidden(true)} />
          )}
        </div>
      </div>

      {assistantAvailable && layout !== 'wide' && (
        <AssistantDrawer open={drawerOpen} panel={panel} onClose={() => setDrawerOpen(false)} />
      )}
      {assistantAvailable && !assistantVisible && (
        <AssistantLauncher
          hasNews={hasNews}
          onOpen={() => (layout === 'wide' ? setDockHidden(false) : setDrawerOpen(true))}
        />
      )}
    </SectionTabsProvider>
  );
}

// ── Pieces ───────────────────────────────────────────────────

function StepFooter({
  prevLabel,
  nextLabel,
  onPrev,
  onNext,
}: {
  prevLabel: string | null;
  nextLabel: string | null;
  onPrev: () => void;
  onNext: () => void;
}) {
  if (!prevLabel && !nextLabel) return null;
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        flexWrap: 'wrap',
        marginTop: 28,
        paddingTop: 18,
        borderTop: `1px solid ${COLOR.border}`,
      }}
    >
      {prevLabel && (
        <Button tone="ghost" onClick={onPrev}>
          ← Back
        </Button>
      )}
      {nextLabel && (
        <Button tone="primary" onClick={onNext} style={{ marginLeft: 'auto', padding: '10px 18px', fontSize: 14 }}>
          Continue to {inSentence(nextLabel)} →
        </Button>
      )}
    </div>
  );
}

function LinkButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      className="pbt-focusable"
      onClick={onClick}
      style={{
        border: 'none',
        background: 'none',
        padding: 0,
        font: 'inherit',
        fontWeight: 800,
        color: 'inherit',
        textDecoration: 'underline',
        textUnderlineOffset: 2,
        cursor: 'pointer',
      }}
    >
      {children}
    </button>
  );
}

interface MenuItem {
  label: string;
  hint?: string;
  danger?: boolean;
  onSelect: () => void;
}

/** "More ▾" — the actions that aren't the next step: duplicate, revert, delete. */
function MoreMenu({ items, disabled }: { items: MenuItem[]; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);

  useEffect(() => {
    if (!open) return;
    itemRefs.current[0]?.focus();
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  function onMenuKey(e: React.KeyboardEvent) {
    const els = itemRefs.current.filter(Boolean) as HTMLButtonElement[];
    const at = els.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      els[(at + 1) % els.length]?.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      els[(at - 1 + els.length) % els.length]?.focus();
    } else if (e.key === 'Tab') {
      setOpen(false);
    }
  }

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <button
        ref={buttonRef}
        type="button"
        className="pbt-btn"
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          padding: '8px 14px',
          borderRadius: 10,
          border: '1px solid rgba(60,20,15,0.12)',
          background: 'rgba(255,255,255,0.6)',
          color: COLOR.ink,
          fontWeight: 700,
          fontSize: 13,
          fontFamily: 'var(--pbt-font)',
          cursor: disabled ? 'not-allowed' : 'pointer',
          whiteSpace: 'nowrap',
        }}
      >
        More <span aria-hidden>▾</span>
      </button>
      {open && (
        <div
          role="menu"
          aria-label="More actions"
          onKeyDown={onMenuKey}
          className="pbt-studio-in"
          style={{
            position: 'absolute',
            right: 0,
            top: 'calc(100% + 6px)',
            zIndex: 30,
            minWidth: 240,
            padding: 6,
            borderRadius: 14,
            background: 'rgba(255,255,255,0.97)',
            border: `1px solid ${COLOR.border}`,
            boxShadow: '0 18px 44px -18px rgba(60,20,15,0.4)',
            display: 'grid',
            gap: 2,
          }}
        >
          {items.map((item, idx) => (
            <button
              key={item.label}
              ref={(el) => {
                itemRefs.current[idx] = el;
              }}
              role="menuitem"
              type="button"
              className="pbt-row-hover pbt-focusable"
              onClick={() => {
                setOpen(false);
                item.onSelect();
              }}
              style={{
                textAlign: 'left',
                border: 'none',
                background: 'transparent',
                padding: '9px 10px',
                borderRadius: 10,
                cursor: 'pointer',
                fontFamily: 'var(--pbt-font)',
              }}
            >
              <span
                style={{
                  display: 'block',
                  fontSize: 13,
                  fontWeight: 750,
                  color: item.danger ? COLOR.danger : COLOR.ink,
                }}
              >
                {item.label}
              </span>
              {item.hint && (
                <span style={{ display: 'block', fontSize: 11.5, color: COLOR.inkMute, marginTop: 1 }}>
                  {item.hint}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
