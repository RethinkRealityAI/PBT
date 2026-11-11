/**
 * The Studio gallery: filters, cards, and every card action's dialog.
 *
 * `galleryFacets` (../studioModel) is the ONE computation of what is shown
 * and every count; this component only holds the selection and renders.
 * Card actions go through the screen (`GalleryActions`) so the saved rows,
 * the 409 re-reads and the toasts live in one place; this component owns
 * the confirmations and the tag popover, rendered OUTSIDE the cards.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '../../primitives/form';
import { LoadingShimmer } from '../../primitives';
import { useToast } from '../../primitives/Toast';
import { ApiError } from '../../lib/api';
import { COLOR } from '../../lib/tokens';
import { readStorage, writeStorage, type StorageKeyDef } from '../../../../src/lib/storage';
import { isScenarioSpecies, speciesOf, type ScenarioSpecies } from '../../../../src/shared/scenarios/species';
import type { ObjectionCategory } from '../../../../src/shared/scenarios/objectionCategories';
import { TAG_LIMITS, type TagColor } from '../../../../src/shared/scenarios/tags';
import { AssistMark, PetBadge } from '../ui';
import {
  ALL_CATEGORIES,
  ALL_OBJECTIONS,
  cardPublishCheck,
  entryCategoryName,
  entryTags,
  galleryFacets,
  NO_TAGS,
  type GalleryFilter,
  type GalleryObjectionRef,
  type StudioContext,
  type StudioEntry,
} from '../studioModel';
import { emptyGalleryState, type EmptyGalleryState, type GalleryCreatePlan } from '../galleryEmpty';
import type { CreateArgs } from '../StudioHome';
import type { ScenarioTagsApi } from './useScenarioTags';
import { GalleryCard } from './GalleryCard';
import { CardActionDialog, type CardActionKind } from './CardActionDialog';
import { CatSwitchNotice } from '../CatSwitchNotice';
import type { CatSwitchState } from '../api';
import { TagPopover } from './TagPopover';
import { ManageTagsModal } from './ManageTagsModal';
import {
  ActiveFilterSummary,
  AnimalSwitch,
  ArchivedToggle,
  CategoryChips,
  ObjectionSelect,
  SearchBox,
  StatusControl,
  TagFilter,
} from './GalleryFilters';

const PAGE = 24;

/** What the gallery asks the screen to do. Writes throw an `ApiError` on refusal. */
export interface GalleryActions {
  /** The readiness context for publishing this entry from its card. */
  publishContext: (entry: StudioEntry) => StudioContext;
  setVisibility: (entry: StudioEntry, visible: boolean) => Promise<void>;
  setArchived: (entry: StudioEntry, archived: boolean) => Promise<void>;
  /** No OTHER scenario is visible to trainees. */
  isOnlyVisible: (entry: StudioEntry) => boolean;
  /** `capabilities.archive` — false while the column is missing. Undefined = unknown (allowed). */
  archiveAvailable?: boolean;
  /** `capabilities.cats` — who trainees see cat scenarios for. Undefined = unknown (no notice). */
  catSwitch?: CatSwitchState;
  tags: ScenarioTagsApi;
}

export interface GalleryProps {
  entries: StudioEntry[];
  loading: boolean;
  canWrite: boolean;
  query: string;
  onQuery: (q: string) => void;
  onCreate: (args: CreateArgs) => void;
  onOpen: (entry: StudioEntry) => void;
  onDuplicate: (entry: StudioEntry) => void;
  onAddToLibrary: (entry: StudioEntry) => void;
  libraryCopies: ReadonlyMap<string, StudioEntry[]>;
  objections: readonly GalleryObjectionRef[];
  categories: readonly Pick<ObjectionCategory, 'id' | 'name'>[];
  unsavedIds: ReadonlySet<string>;
  meUserId?: string;
  actions: GalleryActions;
}

// ── The remembered animal (per admin account, in this browser) ──

const SPECIES_KEY: StorageKeyDef<Record<string, ScenarioSpecies>> = {
  key: 'admin:studio_species',
  fallback: {},
  validate: (v): v is Record<string, ScenarioSpecies> =>
    Boolean(v) && typeof v === 'object' && !Array.isArray(v) && Object.values(v as object).every(isScenarioSpecies),
};

function rememberedSpecies(userId: string | undefined): ScenarioSpecies {
  return readStorage(SPECIES_KEY)[userId ?? 'anonymous'] ?? 'dog';
}

function rememberSpecies(userId: string | undefined, species: ScenarioSpecies): void {
  const all = readStorage(SPECIES_KEY);
  writeStorage(SPECIES_KEY, { ...all, [userId ?? 'anonymous']: species });
}

const cardGrid: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(min(280px, 100%), 1fr))',
  gap: 14,
};

interface PendingAction {
  kind: CardActionKind;
  id: string;
  refreshed: boolean;
  error: string | null;
}

export function Gallery(props: GalleryProps) {
  const { entries, loading, canWrite, query, onQuery, objections, categories, actions } = props;
  const toast = useToast();
  const [animal, setAnimalState] = useState<ScenarioSpecies>(() => rememberedSpecies(props.meUserId));
  const [status, setStatus] = useState<GalleryFilter>('all');
  const [category, setCategory] = useState<string>(ALL_CATEGORIES);
  const [objection, setObjection] = useState<string>(ALL_OBJECTIONS);
  const [tagFilter, setTagFilter] = useState<string[]>([]);
  const [limit, setLimit] = useState(PAGE);
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [tagTarget, setTagTarget] = useState<string | null>(null);
  const tagAnchor = useRef<HTMLButtonElement | null>(null);
  const [manageOpen, setManageOpen] = useState(false);

  const tagsApi = actions.tags;
  const tagsOn = Boolean(tagsApi?.available);
  const tagIndex = tagsOn && tagsApi ? tagsApi.index : NO_TAGS;
  // A tag deleted elsewhere drops out of the filter.
  const liveTagFilter = useMemo(
    () => tagFilter.filter((id) => tagIndex.tags.some((t) => t.id === id)),
    [tagFilter, tagIndex],
  );

  useEffect(() => {
    setAnimalState(rememberedSpecies(props.meUserId));
  }, [props.meUserId]);

  function setAnimal(s: ScenarioSpecies) {
    setAnimalState(s);
    rememberSpecies(props.meUserId, s);
    setLimit(PAGE);
  }

  const selection = { status, animal, category, objection, tags: liveTagFilter };
  const facets = useMemo(
    () => galleryFacets(entries, selection, query, objections, categories, tagIndex),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [entries, status, animal, category, objection, liveTagFilter, query, objections, categories, tagIndex],
  );
  const shown = facets.shown;

  function clearFilters() {
    setStatus((s) => (s === 'archived' ? 'archived' : 'all'));
    setCategory(ALL_CATEGORIES);
    setObjection(ALL_OBJECTIONS);
    setTagFilter([]);
    onQuery('');
    setLimit(PAGE);
  }

  const usage = useMemo(() => {
    const counts = new Map<string, number>();
    const known = new Set(entries.filter((e) => e.source !== 'user').map((e) => e.id));
    for (const [sid, ids] of tagIndex.byScenario) {
      if (!known.has(sid)) continue;
      for (const id of ids) counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    return counts;
  }, [entries, tagIndex]);

  // ── Card actions ──
  const pendingEntry = pending ? entries.find((e) => e.id === pending.id) ?? null : null;
  const pendingCheck = useMemo(
    () =>
      pending?.kind === 'publish' && pendingEntry
        ? cardPublishCheck(pendingEntry.draft, actions.publishContext(pendingEntry))
        : null,
    [pending, pendingEntry, actions],
  );

  async function confirmPending() {
    if (!pending || !pendingEntry) return;
    const entry = pendingEntry;
    const kind = pending.kind;
    setBusyId(entry.id);
    try {
      if (kind === 'archive') await actions.setArchived(entry, true);
      else await actions.setVisibility(entry, kind === 'publish');
      setPending(null);
      toast({
        message:
          kind === 'publish'
            ? `“${entry.title}” is live — trainees can practise it now.`
            : kind === 'unpublish'
              ? `Unpublished — trainees can’t see “${entry.title}” any more.`
              : `“${entry.title}” archived — it’s hidden from trainees.`,
        tone: 'success',
        ...(kind === 'archive'
          ? { action: { label: 'Undo', onClick: () => void restore(entry, true) } }
          : {}),
      });
    } catch (err) {
      if (err instanceof ApiError && err.code === 'stale') {
        // The screen has taken the row that won; ask again on it.
        setPending({ ...pending, refreshed: true, error: null });
      } else {
        setPending({ ...pending, error: err instanceof Error ? err.message : 'That didn’t go through.' });
      }
    } finally {
      setBusyId(null);
    }
  }

  async function restore(entry: StudioEntry, undo = false) {
    setBusyId(entry.id);
    try {
      await actions.setArchived(entry, false);
      toast({
        message: undo
          ? `“${entry.title}” is back — hidden from trainees until you publish it.`
          : `“${entry.title}” restored — it’s hidden from trainees until you publish it.`,
        tone: 'success',
        ...(undo ? {} : { action: { label: 'Show drafts', onClick: () => setStatus('drafts') } }),
      });
    } catch (err) {
      toast({
        message:
          err instanceof ApiError && err.code === 'stale'
            ? `Someone else changed “${entry.title}” just now — it has been reloaded. Try Restore again.`
            : `Couldn’t restore — ${err instanceof Error ? err.message : 'unknown error'}`,
        tone: 'error',
      });
    } finally {
      setBusyId(null);
    }
  }

  // ── Tags ──
  const tagEntry = tagTarget ? entries.find((e) => e.id === tagTarget) ?? null : null;
  const tagSelected = tagEntry ? tagIndex.byScenario.get(tagEntry.id) ?? [] : [];

  function tagError(err: unknown, what: string) {
    toast({ message: `Couldn’t ${what} — ${err instanceof Error ? err.message : 'unknown error'}`, tone: 'error' });
  }

  function toggleTag(tagId: string, on: boolean) {
    if (!tagEntry || !tagsApi) return;
    const next = on ? [...tagSelected.filter((t) => t !== tagId), tagId] : tagSelected.filter((t) => t !== tagId);
    if (next.length > TAG_LIMITS.perScenario) return;
    tagsApi.setScenarioTags(tagEntry.id, next).catch((err) => tagError(err, 'save the tags'));
  }

  async function createAndAssign(name: string) {
    if (!tagEntry || !tagsApi) return;
    const entryId = tagEntry.id;
    try {
      const tag = await tagsApi.createTag(name);
      const current = tagsApi.index.byScenario.get(entryId) ?? tagSelected;
      await tagsApi.setScenarioTags(entryId, [...current.filter((t) => t !== tag.id), tag.id]);
    } catch (err) {
      tagError(err, 'create the tag');
    }
  }

  const liveCats = entries.filter(
    (e) => e.status === 'live' && !e.archived && e.source !== 'user' && speciesOf(e.draft.species) === 'cat',
  ).length;

  const emptyState: EmptyGalleryState | null =
    !loading && shown.length === 0
      ? emptyGalleryState({
          selection,
          query,
          canWrite,
          entries,
          draftsMatching: facets.status.drafts,
          team: objections,
          categories,
          otherAnimalCount: facets.animal[animal === 'dog' ? 'cat' : 'dog'],
          tagNames: facets.tags.filter((t) => liveTagFilter.includes(t.id)).map((t) => t.label),
        })
      : null;

  return (
    // `minmax(0, 1fr)`: a <select> is as wide as its longest option, and an
    // `auto` column would grow to it — pushing every card off a phone screen.
    <section aria-labelledby="studio-gallery-title" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', justifyContent: 'space-between' }}>
        <h2 id="studio-gallery-title" style={{ margin: 0, fontSize: 18, fontWeight: 750, color: COLOR.ink, letterSpacing: '-0.02em' }}>
          Your scenarios
        </h2>
      </div>

      <AnimalSwitch value={animal} counts={{ dog: facets.animal.dog, cat: facets.animal.cat }} loading={loading} onChange={setAnimal} />

      {/* Cats hidden from trainees by the Flags switch: say so wherever cat
          scenarios are in view or live (never blocks anything). */}
      {!loading && actions.catSwitch !== undefined && actions.catSwitch !== 'on' && (
        animal === 'cat' ? (
          <CatSwitchNotice state={actions.catSwitch} context={{ kind: 'gallery' }} />
        ) : liveCats > 0 ? (
          <CatSwitchNotice state={actions.catSwitch} context={{ kind: 'liveCats', count: liveCats }} />
        ) : null
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <SearchBox value={query} onChange={onQuery} />
        {/* One group, so on a narrow screen the status views and "Archived"
            wrap together onto the next line instead of stranding Archived. */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', flex: '1 1 auto', minWidth: 0 }}>
          <StatusControl
            value={status}
            counts={facets.status}
            loading={loading}
            onChange={(f) => {
              setStatus(f);
              setLimit(PAGE);
            }}
          />
          <div style={{ marginLeft: 'auto', display: 'flex' }}>
            <ArchivedToggle
              active={status === 'archived'}
              count={facets.status.archived}
              loading={loading}
              onToggle={() => {
                setStatus((s) => (s === 'archived' ? 'all' : 'archived'));
                setLimit(PAGE);
              }}
            />
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', minWidth: 0 }}>
        <div style={{ flex: '999 1 380px', minWidth: 0 }}>
          <CategoryChips
            facets={facets}
            value={category}
            loading={loading}
            onChange={(id) => {
              setCategory(id);
              // The objection options are scoped to the category.
              setObjection(ALL_OBJECTIONS);
              setLimit(PAGE);
            }}
          />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: '1 1 340px', minWidth: 0, justifyContent: 'flex-end' }}>
          <ObjectionSelect
            facets={facets}
            value={objection}
            loading={loading}
            onChange={(id) => {
              setObjection(id);
              setLimit(PAGE);
            }}
          />
          {tagsOn && status !== 'trainee' && (
            <TagFilter
              facets={facets}
              value={liveTagFilter}
              canManage={canWrite}
              onChange={(ids) => {
                setTagFilter(ids);
                setLimit(PAGE);
              }}
              onManage={() => setManageOpen(true)}
            />
          )}
        </div>
      </div>

      {!loading && (status === 'archived' || facets.narrowed) && (
        <ActiveFilterSummary
          shown={shown.length}
          total={facets.scopeTotal}
          archived={status === 'archived'}
          // Only a real filter (search, category, objection, tags) is "cleared";
          // in the Archived view clearing keeps you there.
          onClear={
            query.trim() !== '' || category !== ALL_CATEGORIES || objection !== ALL_OBJECTIONS || liveTagFilter.length > 0
              ? clearFilters
              : status !== 'all' && status !== 'archived'
                ? clearFilters
                : null
          }
        />
      )}

      {loading ? (
        <div style={cardGrid}>
          {[0, 1, 2].map((k) => (
            <LoadingShimmer key={k} height={220} />
          ))}
        </div>
      ) : emptyState ? (
        <EmptyGallery
          state={emptyState}
          onCreate={(plan) =>
            props.onCreate({ species: plan.species, prompt: null, pushbackId: plan.pushbackId, categoryId: plan.categoryId })
          }
          onClearQuery={() => onQuery('')}
          onShowAll={() => {
            setStatus('all');
            setCategory(ALL_CATEGORIES);
            setObjection(ALL_OBJECTIONS);
            setTagFilter([]);
          }}
          onShowDrafts={() => {
            setStatus('drafts');
            setLimit(PAGE);
          }}
          onSwitchAnimal={(s) => setAnimal(s)}
        />
      ) : (
        <>
          <ul aria-label="Scenarios" style={{ ...cardGrid, listStyle: 'none', margin: 0, padding: 0 }}>
            {shown.slice(0, limit).map((e) => (
              <li key={e.id} style={{ display: 'flex' }}>
                <GalleryCard
                  entry={e}
                  canWrite={canWrite}
                  objections={objections}
                  categoryName={entryCategoryName(e, objections, categories)}
                  copies={props.libraryCopies.get(e.id) ?? []}
                  unsaved={props.unsavedIds.has(e.id)}
                  tags={entryTags(e, tagIndex)}
                  tagsAvailable={tagsOn && canWrite}
                  archiveAvailable={actions.archiveAvailable !== false}
                  busy={busyId === e.id}
                  onOpen={props.onOpen}
                  onDuplicate={() => props.onDuplicate(e)}
                  onAddToLibrary={() => props.onAddToLibrary(e)}
                  onRequest={(kind) => setPending({ kind, id: e.id, refreshed: false, error: null })}
                  onRestore={() => void restore(e)}
                  onOpenTags={(anchor) => {
                    tagAnchor.current = anchor;
                    setTagTarget(e.id);
                  }}
                  tagsOpen={tagTarget === e.id}
                  onFilterTag={(id) => {
                    if (status === 'trainee') setStatus('all');
                    setTagFilter([id]);
                    setLimit(PAGE);
                  }}
                />
              </li>
            ))}
          </ul>
          {shown.length > limit && (
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <Button tone="secondary" onClick={() => setLimit((n) => n + PAGE)}>
                Show more ({shown.length - limit} left)
              </Button>
            </div>
          )}
        </>
      )}

      {pending && pendingEntry && (
        <CardActionDialog
          kind={pending.kind}
          title={pendingEntry.title}
          check={pendingCheck}
          lastVisible={pendingEntry.status === 'live' && actions.isOnlyVisible(pendingEntry)}
          live={pendingEntry.status === 'live'}
          unsaved={props.unsavedIds.has(pendingEntry.id)}
          refreshed={pending.refreshed}
          catSwitch={speciesOf(pendingEntry.draft.species) === 'cat' ? actions.catSwitch : undefined}
          busy={busyId === pendingEntry.id}
          error={pending.error}
          canOpenBuilder
          onConfirm={() => void confirmPending()}
          onOpenInBuilder={() => {
            setPending(null);
            props.onOpen(pendingEntry);
          }}
          onClose={() => setPending(null)}
        />
      )}

      {tagsApi && tagsOn && (
        <TagPopover
          open={tagEntry !== null}
          anchorRef={tagAnchor}
          onClose={() => setTagTarget(null)}
          scenarioTitle={tagEntry?.title ?? ''}
          tags={tagsApi.tags}
          selected={tagSelected}
          onToggle={toggleTag}
          onCreate={createAndAssign}
          onRecolor={(id, color: TagColor) => tagsApi.updateTag(id, { color }).catch((err) => tagError(err, 'change the colour'))}
          onManage={() => setManageOpen(true)}
        />
      )}

      {tagsApi && tagsOn && (
        <ManageTagsModal
          open={manageOpen}
          onClose={() => setManageOpen(false)}
          tags={tagsApi.tags}
          usage={usage}
          onCreate={(name, color) =>
            tagsApi.createTag(name, color).catch((err) => {
              tagError(err, 'create the tag');
              throw err;
            })
          }
          onUpdate={(id, patch) =>
            tagsApi.updateTag(id, patch).catch((err) => {
              tagError(err, 'save the tag');
              throw err;
            })
          }
          onDelete={(id) =>
            tagsApi.deleteTag(id).then(
              () => setTagFilter((cur) => cur.filter((t) => t !== id)),
              (err) => {
                tagError(err, 'delete the tag');
                throw err;
              },
            )
          }
        />
      )}
    </section>
  );
}

/**
 * Nothing to show. The words and the actions come from `emptyGalleryState`:
 * when it fits, the primary action starts the very scenario the filters were
 * looking for ("Create your first cat scenario"); "Show all scenarios" and
 * "Show the 3 dog scenarios" stay as the quiet ways back.
 */
function EmptyGallery({
  state,
  onCreate,
  onClearQuery,
  onShowAll,
  onShowDrafts,
  onSwitchAnimal,
}: {
  state: EmptyGalleryState;
  onCreate: (plan: GalleryCreatePlan) => void;
  onClearQuery: () => void;
  onShowAll: () => void;
  onShowDrafts: () => void;
  onSwitchAnimal: (s: ScenarioSpecies) => void;
}) {
  const { create, draftsWaiting, otherAnimal } = state;
  const hasPrimary = create !== null || draftsWaiting > 0;
  // Never a dead end: with no primary action, the way back is the button.
  const backTone = hasPrimary ? 'ghost' : 'secondary';
  return (
    <div
      role="status"
      style={{
        padding: '32px 20px',
        borderRadius: 20,
        border: `1px dashed rgba(60,20,15,0.16)`,
        background: 'rgba(255,255,255,0.45)',
        textAlign: 'center',
        display: 'grid',
        gap: 8,
        justifyItems: 'center',
      }}
    >
      {create?.species ? <PetBadge species={create.species} size={34} /> : <AssistMark size={30} />}
      <div style={{ fontSize: 15, fontWeight: 750, color: COLOR.ink, overflowWrap: 'anywhere' }}>{state.title}</div>
      <div style={{ fontSize: 13, color: COLOR.inkMute, maxWidth: 440, lineHeight: 1.5 }}>{state.body}</div>
      {(hasPrimary || state.clearSearch || state.showAll || otherAnimal) && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center', marginTop: 6, maxWidth: '100%' }}>
          {create && (
            <Button
              tone="primary"
              onClick={() => onCreate(create)}
              // Objection names can be long: let the label wrap on a phone
              // rather than push the card wider than the screen.
              style={{ whiteSpace: 'normal', maxWidth: '100%', textAlign: 'center' }}
            >
              <span aria-hidden>+</span> {create.label}
            </Button>
          )}
          {!create && draftsWaiting > 0 && (
            <Button tone="primary" onClick={onShowDrafts}>
              {draftsWaiting === 1 ? 'Show the draft' : `Show the ${draftsWaiting} drafts`}
            </Button>
          )}
          {state.clearSearch && (
            <Button tone="secondary" onClick={onClearQuery}>
              Clear search
            </Button>
          )}
          {state.showAll && (
            <Button tone={state.clearSearch ? 'ghost' : backTone} onClick={onShowAll}>
              Show all scenarios
            </Button>
          )}
          {otherAnimal && (
            <Button tone="ghost" onClick={() => onSwitchAnimal(otherAnimal.species)}>
              {otherAnimal.count === 1
                ? `Show the ${otherAnimal.species} scenario`
                : `Show the ${otherAnimal.count} ${otherAnimal.species} scenarios`}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
