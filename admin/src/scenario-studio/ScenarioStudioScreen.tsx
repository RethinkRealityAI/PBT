/**
 * Scenario Studio — the entry screen (Content → Scenario Studio → Studio).
 *
 * Loads the three things every Studio view needs — the saved override rows,
 * the trainee-built scenarios, the knowledge library — builds the scenario
 * list exactly as the old builder did (library manifest overlaid by override
 * rows, `admin:` rows, `user:` scenarios), and switches between the home
 * (./StudioHome) and the guided editor (./StudioEditor).
 *
 * Trainee-built scenarios are never edited in place — a Studio edit to one
 * reached nobody (the app keeps showing the trainee their own version) and
 * left a stray `user:` override behind. Opening one goes to "Add to
 * library": an unsaved, hidden `admin:` copy that remembers where it came
 * from (`copied_from`), so the trainee's card can say "In the library".
 *
 * Read safety, carried over from the old builder: if either scenario read
 * fails, nothing is shown but the error. The library manifest alone would
 * still list three scenarios, every one looking untouched — and saving from
 * that editor would write nulls over override rows nobody ever loaded.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ContextBar, ScreenShell } from '../primitives/Shell';
import { ErrorState } from '../primitives/QueryBoundary';
import { useCan } from '../primitives/access';
import { useToast } from '../primitives/Toast';
import { COLOR } from '../lib/tokens';
import {
  duplicateScenario,
  useKnowledgeDocuments,
  useScenarioOverrides,
  useUserScenarios,
} from '../data/queries';
import { buildInitialDraft, diffAgainstBase } from '../data/scenarioManifest';
import {
  buildDuplicateDraft,
  buildStudioEntries,
  buildTraineeLibraryDraft,
  emptyAdminDraft,
  entryBase,
  firstStepNeeding,
  libraryCopiesByTrainee,
  localEntryHasChanges,
  newAdminScenarioId,
  scenarioSummary,
  visibleScenarioCount,
  type StudioDraft,
  type StudioEntry,
  type StudioStepKey,
} from './studioModel';
import { useObjections } from './objections/useObjections';
import { ObjectionsProvider } from './objections/ObjectionsContext';
import { clearLocalDraft, listLocalDrafts, readLocalDraft, setLocalDraftsOwner } from './localDrafts';
import type { KnowledgeState } from './types';
import { StudioHome, type CreateArgs, type ResumableDraft } from './StudioHome';
import { StudioEditor } from './StudioEditor';
import { fetchScenarioCapabilities } from './api';
import { setSimulatorSessionsOwner } from './simulator/simulatorSession';

interface OpenState {
  id: string;
  /** The starting draft for a scenario the list doesn't have (new / copy / kept locally). */
  seed?: StudioDraft;
  /** The scenario IS on the server even though the list hasn't caught up yet. */
  onServer?: boolean;
  copiedFrom?: string | null;
  /** What the copy was made from: a trainee's own scenario, or another scenario. */
  copySource?: 'trainee' | 'scenario';
  step?: StudioStepKey;
  openAssistant?: boolean;
  prompt?: string | null;
  /** A new scenario started from a category filter: the Pushback step opens on it. */
  categoryId?: string | null;
  resume?: boolean;
  /** Re-opening the same scenario remounts a fresh editor. */
  nonce: number;
}

const NO_KNOWLEDGE_ACCESS =
  'Your role can’t open the knowledge library, so its documents can’t be listed here. Scenarios still use it when trainees practise.';

function scrollPageTo(top: number) {
  if (typeof document === 'undefined') return;
  document.documentElement.scrollTop = top;
  document.body.scrollTop = top;
}

export function ScenarioStudioScreen({
  query,
  onQuery,
  meUserId,
}: {
  query: string;
  onQuery: (q: string) => void;
  /** The signed-in admin — browser-kept drafts are stored per account. */
  meUserId?: string;
}) {
  // Before anything below reads local drafts or Test drive sessions
  // (render-time, idempotent — both only act when the owner changes).
  setLocalDraftsOwner(meUserId);
  setSimulatorSessionsOwner(meUserId);
  const [refreshKey, setRefreshKey] = useState(0);
  const overrides = useScenarioOverrides(refreshKey);
  const userScenarios = useUserScenarios(500);
  const knowledgeQuery = useKnowledgeDocuments();
  const objections = useObjections();
  const can = useCan();
  const canWrite = can('scenarios.write');
  const canReadKnowledge = can('knowledge.read');
  const toast = useToast();

  const [open, setOpen] = useState<OpenState | null>(null);
  const [localNonce, setLocalNonce] = useState(0);
  /** What the database can store (whether the species column exists), probed once. */
  const [capabilities, setCapabilities] = useState<{ species?: boolean }>({});
  useEffect(() => {
    let cancelled = false;
    void fetchScenarioCapabilities().then((c) => {
      if (!cancelled) setCapabilities(c);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  const nonce = useRef(0);
  const homeScroll = useRef(0);

  const readError = overrides.error ?? userScenarios.error;
  const [everLoaded, setEverLoaded] = useState(false);
  const bothLoaded = !overrides.loading && !userScenarios.loading;
  useEffect(() => {
    if (bothLoaded && !readError) setEverLoaded(true);
  }, [bothLoaded, readError]);
  const loading = !everLoaded && !bothLoaded;

  const entries = useMemo(
    () => buildStudioEntries(overrides.data, userScenarios.data, objections.objections),
    [overrides.data, userScenarios.data, objections.objections],
  );
  const libraryCopies = useMemo(() => libraryCopiesByTrainee(entries), [entries]);

  const knowledge = useMemo<KnowledgeState>(
    () =>
      canReadKnowledge
        ? {
            docs: knowledgeQuery.data,
            loading: knowledgeQuery.loading,
            error: knowledgeQuery.error,
            refetch: knowledgeQuery.refetch,
          }
        : { docs: [], loading: false, error: NO_KNOWLEDGE_ACCESS, refetch: () => {} },
    [canReadKnowledge, knowledgeQuery.data, knowledgeQuery.loading, knowledgeQuery.error, knowledgeQuery.refetch],
  );

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  // A scenario that vanished from the list (deleted elsewhere) with nothing
  // to start from: go back to the home rather than hold a dead selection.
  useEffect(() => {
    if (!open || open.seed || loading) return;
    if (!entries.some((e) => e.id === open.id)) setOpen(null);
  }, [open, entries, loading]);

  // Unsaved work kept in this browser, for "Pick up where you left off".
  const resumable = useMemo<ResumableDraft[]>(() => {
    if (!canWrite || loading) return [];
    const known = new Set(entries.map((e) => e.id));
    const out: ResumableDraft[] = [];
    for (const local of listLocalDrafts()) {
      // Edits kept against a trainee's scenario (from before the Studio
      // stopped editing those in place) still show — Resume turns them into
      // an "Add to library" copy rather than reopening the trainee's own.
      const neverSaved = !known.has(local.id);
      // An unknown non-admin id is a scenario that no longer exists.
      if (neverSaved && !local.id.startsWith('admin:')) continue;
      if (!neverSaved && !localEntryHasChanges(local)) continue;
      const summary = scenarioSummary(local.draft ?? {});
      out.push({
        id: local.id,
        title: local.title?.trim() || 'Untitled scenario',
        summary: summary === 'Not filled in yet' ? null : summary,
        savedAt: local.savedAt,
        neverSaved,
      });
    }
    return out;
    // `localNonce` re-reads storage after a discard or an editor closes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canWrite, loading, entries, localNonce]);

  function openEditor(next: Omit<OpenState, 'nonce'>) {
    homeScroll.current = typeof document !== 'undefined' ? document.documentElement.scrollTop : 0;
    nonce.current += 1;
    setOpen({ ...next, nonce: nonce.current });
    scrollPageTo(0);
  }

  function closeEditor() {
    setOpen(null);
    setLocalNonce((n) => n + 1);
    const top = homeScroll.current;
    window.setTimeout(() => scrollPageTo(top), 0);
  }

  function onCreate({ species, prompt, pushbackId = null, categoryId = null }: CreateArgs) {
    const id = newAdminScenarioId();
    const seed = emptyAdminDraft(id, species);
    // Started from the gallery's filters: the objection they were looking at.
    if (pushbackId) seed.pushback_id = pushbackId;
    openEditor({
      id,
      seed,
      step: 'pet',
      openAssistant: Boolean(prompt),
      prompt,
      categoryId: pushbackId ? null : categoryId,
    });
  }

  /** An unsaved admin copy of what's on screen — never live until published. */
  function openCopy(draft: StudioDraft, title: string) {
    const copy = buildDuplicateDraft(draft, newAdminScenarioId(), title);
    openEditor({ id: copy.scenario_id as string, seed: copy, copiedFrom: title, copySource: 'scenario', step: 'pet' });
  }

  /**
   * "Add to library": the trainee's scenario as an unsaved, hidden `admin:`
   * copy — opened on the first step that still needs an answer (older
   * trainee scenarios have no ECHO driver, for instance). `over` replaces the
   * draft's fields (edits kept in this browser against the trainee's own).
   */
  function addToLibrary(entry: StudioEntry, over?: StudioDraft) {
    if (entry.source !== 'user') return;
    const id = newAdminScenarioId();
    const base = buildTraineeLibraryDraft(entry, id);
    // Only what the admin actually filled in: a cleared box in old edits
    // must not blank the trainee's title or species.
    const kept = Object.fromEntries(
      Object.entries(over ?? {}).filter(([, v]) => v !== null && v !== undefined && !(typeof v === 'string' && v.trim() === '')),
    ) as StudioDraft;
    const seed: StudioDraft = { ...base, ...kept, scenario_id: id, visible: false, sort_order: null, copied_from: entry.id };
    openEditor({
      id,
      seed,
      copiedFrom: entry.userScenario?.title?.trim() || entry.title,
      copySource: 'trainee',
      step: firstStepNeeding(seed),
    });
  }

  /** Open a scenario — a trainee's own goes to "Add to library" instead. */
  function openEntry(entry: StudioEntry) {
    if (entry.source === 'user' && canWrite) {
      addToLibrary(entry);
      return;
    }
    openEditor({ id: entry.id });
  }

  async function duplicateEntry(entry: StudioEntry) {
    if (entry.source === 'user') {
      addToLibrary(entry);
      return;
    }
    // `admin:` rows ARE the scenario, so the server copy is complete. Anything
    // else is copied from its hydrated draft: the server would copy an
    // override row, which for a built-in may be empty or absent.
    if (entry.source !== 'admin') {
      openCopy(entry.draft, entry.manifest?.title ?? entry.title);
      return;
    }
    try {
      const row = await duplicateScenario(entry.id);
      refresh();
      toast({
        message: `“${entry.title}” duplicated — the copy starts as a hidden draft.`,
        tone: 'success',
        action: {
          label: 'Open the copy',
          onClick: () =>
            openEditor({
              id: row.scenario_id,
              seed: buildInitialDraft({ id: row.scenario_id, source: 'admin', override: row }, null, null),
              onServer: true,
            }),
        },
      });
    } catch (err) {
      toast({
        message: `Couldn’t duplicate — ${err instanceof Error ? err.message : 'unknown error'}`,
        tone: 'error',
      });
    }
  }

  function resume(id: string) {
    const entry = entries.find((e) => e.id === id) ?? null;
    if (entry?.source === 'user') {
      // Old edits to a trainee's own scenario: carry them into a library copy
      // (the copy keeps itself in this browser from here), then forget them.
      const local = readLocalDraft(id);
      addToLibrary(entry, local?.draft);
      clearLocalDraft(id);
      return;
    }
    const known = entry !== null;
    if (known) {
      openEditor({ id, resume: true });
      return;
    }
    const local = readLocalDraft(id);
    if (!local) {
      setLocalNonce((n) => n + 1);
      return;
    }
    // Not on the server (never saved, or deleted by someone else since):
    // whatever `visible` the draft remembers from when it WAS live is no
    // longer true, and publish state always comes from the server. Open it
    // as the hidden draft it now is — Publish is still one click away.
    // An unsaved copy keeps saying what it was copied from.
    const from = local.draft.copied_from;
    const original = typeof from === 'string' ? entries.find((e) => e.id === from) : undefined;
    openEditor({
      id,
      seed: { ...local.draft, visible: false },
      resume: true,
      step: local.step,
      ...(original
        ? {
            copiedFrom: original.userScenario?.title?.trim() || original.title,
            copySource: original.source === 'user' ? ('trainee' as const) : ('scenario' as const),
          }
        : {}),
    });
  }

  // A failed read must never reach the home or the editor (see header).
  if (readError) {
    return (
      <>
        <ContextBar title="Scenario Studio" subtitle="Build, test and publish the conversations your team practises." />
        <ScreenShell>
          <ErrorState
            title="Couldn’t load the scenarios"
            detail={readError}
            onRetry={() => {
              refresh();
              userScenarios.refetch();
            }}
          />
          <div style={{ marginTop: 12, fontSize: 12.5, color: COLOR.inkMute, textAlign: 'center', lineHeight: 1.5 }}>
            The Studio stays closed rather than half-loaded: without the saved changes every scenario
            would look untouched, and saving one would wipe the edits that are actually live. Any
            unsaved work is still kept in this browser.
          </div>
        </ScreenShell>
      </>
    );
  }

  if (open) {
    const entry = entries.find((e) => e.id === open.id) ?? null;
    const initialDraft = entry?.draft ?? open.seed;
    // A trainee's own scenario is only ever LOOKED at (read-only roles) —
    // writers are sent to "Add to library" before they get here.
    if (initialDraft && !(entry?.source === 'user' && canWrite)) {
      const source = entry?.source ?? 'admin';
      const sparsify = (d: StudioDraft): StudioDraft =>
        entry && entry.source !== 'admin'
          ? diffAgainstBase(
              d,
              { id: entry.id, source: entry.source, override: entry.override },
              entry.manifest,
              entry.userScenario,
            )
          : { ...d };
      return (
        <ObjectionsProvider value={objections}>
        <StudioEditor
          key={`${open.id}#${open.nonce}`}
          scenarioId={open.id}
          source={source}
          initialDraft={initialDraft}
          base={entry ? entryBase(entry) : null}
          isNew={!entry && !open.onServer}
          hasOverride={Boolean(entry?.override) || Boolean(open.onServer)}
          copiedFrom={open.copiedFrom ?? null}
          copySource={open.copySource}
          fallbackTitle={
            entry?.source === 'library'
              ? entry.manifest?.title ?? null
              : entry?.source === 'user'
                ? entry.userScenario?.title ?? null
                : null
          }
          sparsify={sparsify}
          isOnlyVisible={visibleScenarioCount(entries, open.id) === 0}
          canWrite={canWrite}
          knowledge={knowledge}
          baseUpdatedAt={entry?.override?.updated_at ?? null}
          hydrateRow={(row) =>
            buildInitialDraft(
              { id: open.id, source, override: row },
              entry?.manifest ?? null,
              entry?.userScenario ?? null,
            )
          }
          speciesSupported={capabilities.species}
          initialStep={open.step}
          initialCategoryId={open.categoryId ?? null}
          openAssistant={open.openAssistant}
          initialPrompt={open.prompt ?? null}
          resumeLocal={open.resume}
          onClose={closeEditor}
          onSaved={refresh}
          onDuplicate={openCopy}
          onAddToLibrary={entry?.source === 'user' ? () => addToLibrary(entry) : undefined}
        />
        </ObjectionsProvider>
      );
    }
  }

  return (
    <ObjectionsProvider value={objections}>
      <StudioHome
        entries={entries}
        loading={loading}
        canWrite={canWrite}
        query={query}
        onQuery={onQuery}
        onCreate={onCreate}
        onOpen={openEntry}
        onDuplicate={(entry) => void duplicateEntry(entry)}
        onAddToLibrary={(entry) => addToLibrary(entry)}
        libraryCopies={libraryCopies}
        objections={objections.objections}
        categories={objections.categories}
        resumable={resumable}
        onResume={resume}
        onDiscardLocal={(id) => {
          clearLocalDraft(id);
          setLocalNonce((n) => n + 1);
        }}
      />
    </ObjectionsProvider>
  );
}
