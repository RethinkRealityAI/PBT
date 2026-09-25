/**
 * Scenario Studio — the entry screen (Content → Scenario Studio → Studio).
 *
 * Loads the three things every Studio view needs — the saved override rows,
 * the trainee-built scenarios, the knowledge library — builds the scenario
 * list exactly as the old builder did (library manifest overlaid by override
 * rows, `admin:` rows, `user:` scenarios), and switches between the home
 * (./StudioHome) and the guided editor (./StudioEditor).
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
  emptyAdminDraft,
  entryBase,
  localEntryHasChanges,
  newAdminScenarioId,
  scenarioSummary,
  visibleScenarioCount,
  type StudioDraft,
  type StudioEntry,
  type StudioStepKey,
} from './studioModel';
import { clearLocalDraft, listLocalDrafts, readLocalDraft, setLocalDraftsOwner } from './localDrafts';
import type { KnowledgeState } from './types';
import { StudioHome, type ComposerSpecies, type ResumableDraft } from './StudioHome';
import { StudioEditor } from './StudioEditor';
import { fetchScenarioCapabilities } from './api';

interface OpenState {
  id: string;
  /** The starting draft for a scenario the list doesn't have (new / copy / kept locally). */
  seed?: StudioDraft;
  /** The scenario IS on the server even though the list hasn't caught up yet. */
  onServer?: boolean;
  copiedFrom?: string | null;
  step?: StudioStepKey;
  openAssistant?: boolean;
  prompt?: string | null;
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
  // Before anything below reads local drafts (render-time, idempotent).
  setLocalDraftsOwner(meUserId);
  const [refreshKey, setRefreshKey] = useState(0);
  const overrides = useScenarioOverrides(refreshKey);
  const userScenarios = useUserScenarios(500);
  const knowledgeQuery = useKnowledgeDocuments();
  const can = useCan();
  const canWrite = can('scenarios.write');
  const canReadKnowledge = can('knowledge.read');
  const toast = useToast();

  const [open, setOpen] = useState<OpenState | null>(null);
  const [localNonce, setLocalNonce] = useState(0);
  /** What the database can store (the deferred species column), probed once. */
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
    () => buildStudioEntries(overrides.data, userScenarios.data),
    [overrides.data, userScenarios.data],
  );

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

  function onCreate({ species, prompt }: { species: ComposerSpecies; prompt: string | null }) {
    const id = newAdminScenarioId();
    openEditor({
      id,
      seed: emptyAdminDraft(id, species),
      step: 'pet',
      openAssistant: Boolean(prompt),
      prompt,
    });
  }

  /** An unsaved admin copy of what's on screen — never live until published. */
  function openCopy(draft: StudioDraft, title: string) {
    const copy = buildDuplicateDraft(draft, newAdminScenarioId(), title);
    openEditor({ id: copy.scenario_id as string, seed: copy, copiedFrom: title, step: 'pet' });
  }

  async function duplicateEntry(entry: StudioEntry) {
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
    const known = entries.some((e) => e.id === id);
    if (known) {
      openEditor({ id, resume: true });
      return;
    }
    const local = readLocalDraft(id);
    if (!local) {
      setLocalNonce((n) => n + 1);
      return;
    }
    openEditor({ id, seed: local.draft, resume: true, step: local.step });
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
    if (initialDraft) {
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
        <StudioEditor
          key={`${open.id}#${open.nonce}`}
          scenarioId={open.id}
          source={source}
          initialDraft={initialDraft}
          base={entry ? entryBase(entry) : null}
          isNew={!entry && !open.onServer}
          hasOverride={Boolean(entry?.override) || Boolean(open.onServer)}
          copiedFrom={open.copiedFrom ?? null}
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
          speciesSupported={capabilities.species}
          initialStep={open.step}
          openAssistant={open.openAssistant}
          initialPrompt={open.prompt ?? null}
          resumeLocal={open.resume}
          onClose={closeEditor}
          onSaved={refresh}
          onDuplicate={openCopy}
        />
      );
    }
  }

  return (
    <StudioHome
      entries={entries}
      loading={loading}
      canWrite={canWrite}
      query={query}
      onQuery={onQuery}
      onCreate={onCreate}
      onOpen={(entry) => openEditor({ id: entry.id })}
      onDuplicate={(entry) => void duplicateEntry(entry)}
      resumable={resumable}
      onResume={resume}
      onDiscardLocal={(id) => {
        clearLocalDraft(id);
        setLocalNonce((n) => n + 1);
      }}
    />
  );
}
