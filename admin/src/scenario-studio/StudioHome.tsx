/**
 * Scenario Studio — the home page (nothing open yet).
 *
 *   1. A composer: "What should your team practise?" — describe it in plain
 *      words (the assistant takes it from there) or go step by step.
 *   2. "Pick up where you left off": unsaved work kept in this browser.
 *   3. The gallery: every scenario — built in, written here, built by
 *      trainees — as cards tinted by the owner's driver.
 */
import { useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { ContextBar, ScreenShell } from '../primitives/Shell';
import { Glass } from '../primitives/Glass';
import { Button } from '../primitives/form';
import { ReadOnlyBanner } from '../primitives/access';
import { FirstRunCard } from '../primitives/FirstRunCard';
import { LoadingShimmer } from '../primitives';
import { useConfirm } from '../primitives/Confirm';
import { COLOR } from '../lib/tokens';
import { speciesOf, type ScenarioSpecies } from '../../../src/shared/scenarios/species';
import type { ObjectionCategory } from '../../../src/shared/scenarios/objectionCategories';
import {
  ASSIST_GRADIENT,
  AssistMark,
  Chip,
  Kicker,
  PetBadge,
  PetIcon,
  StatusDot,
  TextArea,
} from './ui';
import { CardPreview } from './CardPreview';
import {
  ALL_CATEGORIES,
  ALL_OBJECTIONS,
  ANIMAL_FILTERS,
  GALLERY_FILTERS,
  SOURCE_LABELS,
  difficultyText,
  entryCategoryName,
  entryStatusText,
  galleryFacets,
  relativeTime,
  scenarioSummary,
  type AnimalFilter,
  type GalleryFilter,
  type GalleryObjectionRef,
  type StudioEntry,
} from './studioModel';
import { objectionLabel } from './objections/objectionsModel';
import { emptyGalleryState, type EmptyGalleryState, type GalleryCreatePlan } from './galleryEmpty';

/** Species choice on the composer; null = let the assistant decide. */
export type ComposerSpecies = ScenarioSpecies | null;

export interface ResumableDraft {
  id: string;
  title: string;
  /** "Persian · Kitten (<1)" — tells two untitled drafts apart. */
  summary: string | null;
  savedAt: number;
  /** Never saved to the server — it only exists in this browser. */
  neverSaved: boolean;
}

/** Ideas that fill the composer — a mix of species and kinds of pushback. */
export const STARTER_PROMPTS: Array<{ text: string; species: ScenarioSpecies }> = [
  { text: 'An anxious cat owner who doubts the renal diet for her senior Persian', species: 'cat' },
  { text: 'A busy Lab owner who thinks the weight-loss food is too expensive', species: 'dog' },
  { text: 'A first-time puppy owner whose breeder swears by raw feeding', species: 'dog' },
  { text: 'A devoted senior Poodle owner on a fixed income', species: 'dog' },
  { text: 'An owner who read online that grain-free is healthier', species: 'dog' },
  {
    text: 'A Maine Coon owner who refuses a urinary diet because his cat ‘seems fine’',
    species: 'cat',
  },
];

const PAGE = 24;

/** What a new scenario starts with. */
export interface CreateArgs {
  species: ComposerSpecies;
  /** Goes to the assistant when present. */
  prompt: string | null;
  /** Start from this objection (the gallery's "Add a … scenario"). */
  pushbackId?: string | null;
  /** Open the Pushback step on this category (the gallery's "Create a scenario in …"). */
  categoryId?: string | null;
}

export interface StudioHomeProps {
  entries: StudioEntry[];
  /** The first load is still in flight. */
  loading: boolean;
  canWrite: boolean;
  query: string;
  onQuery: (q: string) => void;
  /** Start a new scenario. */
  onCreate: (args: CreateArgs) => void;
  onOpen: (entry: StudioEntry) => void;
  onDuplicate: (entry: StudioEntry) => void;
  /** "Add to library" on a trainee's scenario: open an unsaved, hidden admin copy. */
  onAddToLibrary: (entry: StudioEntry) => void;
  /** Saved library copies of each trainee scenario, by the trainee entry's id. */
  libraryCopies: ReadonlyMap<string, StudioEntry[]>;
  /** The team's objections (active + retired), for objection names and their categories. */
  objections: readonly GalleryObjectionRef[];
  /** Every category (built-ins included), for the Category filter and card labels. */
  categories?: readonly Pick<ObjectionCategory, 'id' | 'name'>[];
  resumable: ResumableDraft[];
  onResume: (id: string) => void;
  onDiscardLocal: (id: string) => void;
}

export function StudioHome(props: StudioHomeProps) {
  const { entries, loading, canWrite, query, onQuery } = props;
  /** Saved scenarios with edits kept in this browser, for an "Unsaved changes" mark. */
  const unsavedIds = useMemo(
    () => new Set(props.resumable.filter((r) => !r.neverSaved).map((r) => r.id)),
    [props.resumable],
  );
  return (
    <>
      <ContextBar
        title="Scenario Studio"
        subtitle="Build, test and publish the conversations your team practises."
        query={query}
        onQuery={onQuery}
      />
      <ScreenShell>
        <ReadOnlyBanner permission="scenarios.write">
          You can browse every scenario here, but not change them — building and publishing needs
          the <code style={{ fontFamily: 'var(--pbt-mono)', fontWeight: 700 }}>scenarios.write</code>{' '}
          permission.
        </ReadOnlyBanner>
        {canWrite && <Composer onCreate={props.onCreate} />}
        {canWrite && !loading && props.resumable.length > 0 && (
          <ResumeStrip items={props.resumable} onResume={props.onResume} onDiscard={props.onDiscardLocal} />
        )}
        <FirstRunCard id="studio" title="Three kinds of scenario live here">
          <strong>Built-in</strong> scenarios ship with the app — changing one saves only what you
          changed, on top. <strong>Studio</strong> scenarios are ones your team wrote here.{' '}
          <strong>Trainee-built</strong> ones were made by a trainee for their own practice — only
          that trainee sees them, until you use <strong>Add to library</strong> to make a copy for
          everyone. Every save and publish is recorded in <strong>Audit</strong>, and any of them can
          be undone from there — even a deleted scenario.
        </FirstRunCard>
        <Gallery
          entries={entries}
          loading={loading}
          canWrite={canWrite}
          query={query}
          onClearQuery={() => onQuery('')}
          onCreate={props.onCreate}
          onOpen={props.onOpen}
          onDuplicate={props.onDuplicate}
          onAddToLibrary={props.onAddToLibrary}
          libraryCopies={props.libraryCopies}
          objections={props.objections}
          categories={props.categories ?? []}
          unsavedIds={unsavedIds}
        />
      </ScreenShell>
    </>
  );
}

// ── Composer ─────────────────────────────────────────────────

function Composer({ onCreate }: { onCreate: StudioHomeProps['onCreate'] }) {
  const [text, setText] = useState('');
  const [species, setSpecies] = useState<ComposerSpecies>(null);
  const areaId = useId();
  const trimmed = text.trim();

  function buildWithAssistant() {
    if (!trimmed) return;
    const prefix = species === 'cat' ? 'Species: Cat. ' : species === 'dog' ? 'Species: Dog. ' : '';
    onCreate({ species, prompt: `${prefix}${trimmed}` });
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      buildWithAssistant();
    }
  }

  return (
    <Glass padding={0} radius={24} style={{ overflow: 'hidden' }}>
      <div
        aria-hidden
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'radial-gradient(120% 90% at 100% 0%, oklch(0.93 0.05 320 / 0.55), transparent 55%), radial-gradient(90% 80% at 0% 100%, oklch(0.94 0.05 22 / 0.5), transparent 60%)',
          pointerEvents: 'none',
        }}
      />
      <section
        aria-labelledby="studio-composer-title"
        style={{ position: 'relative', padding: 'clamp(18px, 3vw, 32px)', display: 'grid', gap: 16 }}
      >
        <div>
          <Kicker style={{ color: 'oklch(0.50 0.16 320)' }}>New scenario</Kicker>
          <h2
            id="studio-composer-title"
            style={{
              margin: '8px 0 0',
              fontSize: 'clamp(24px, 3.2vw, 32px)',
              lineHeight: 1.12,
              fontWeight: 600,
              letterSpacing: '-0.03em',
              color: COLOR.ink,
            }}
          >
            What should your team practise?
          </h2>
          <p style={{ margin: '8px 0 0', fontSize: 14.5, lineHeight: 1.55, color: COLOR.inkSoft, maxWidth: 640 }}>
            Describe the conversation in your own words — the assistant turns it into a scenario you
            can check, test and publish. Or build it one step at a time.
          </p>
        </div>

        <TextArea
          id={areaId}
          aria-label="Describe the conversation"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          rows={3}
          placeholder="Describe the conversation — who the owner is, their pet, and what they’re pushing back on…"
          style={{ fontSize: 15, minHeight: 96, background: 'rgba(255,255,255,0.9)' }}
        />

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span id="studio-species-label" style={{ fontSize: 12.5, fontWeight: 700, color: COLOR.inkSoft }}>
            The patient is a
          </span>
          <SpeciesToggle value={species} onChange={setSpecies} labelledBy="studio-species-label" />
        </div>

        <div style={{ display: 'grid', gap: 8 }}>
          <Kicker>Or start from an idea</Kicker>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {STARTER_PROMPTS.map((p) => (
              <Chip
                key={p.text}
                tone="assist"
                onClick={() => {
                  setText(p.text);
                  setSpecies(p.species);
                  document.getElementById(areaId)?.focus();
                }}
              >
                {p.text}
              </Chip>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginTop: 4 }}>
          <button
            type="button"
            className="pbt-btn"
            disabled={!trimmed}
            onClick={buildWithAssistant}
            title={trimmed ? undefined : 'Describe the conversation first'}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 10,
              padding: '11px 20px 11px 12px',
              borderRadius: 999,
              border: 'none',
              background: ASSIST_GRADIENT,
              color: '#fff',
              fontSize: 14.5,
              fontWeight: 800,
              fontFamily: 'var(--pbt-font)',
              cursor: trimmed ? 'pointer' : 'not-allowed',
              boxShadow: '0 12px 28px -14px oklch(0.55 0.18 320 / 0.8)',
            }}
          >
            <span
              aria-hidden
              style={{
                width: 26,
                height: 26,
                borderRadius: 999,
                background: 'rgba(255,255,255,0.22)',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              ✦
            </span>
            Build it with the assistant
          </button>
          <Button
            tone="secondary"
            onClick={() => onCreate({ species, prompt: null })}
            style={{ padding: '11px 18px', fontSize: 14, borderRadius: 999 }}
          >
            Start step by step
          </Button>
          <span style={{ fontSize: 12, color: COLOR.inkMute }}>
            Nothing reaches trainees until you publish it.
          </span>
        </div>
      </section>
    </Glass>
  );
}

const SPECIES_OPTIONS: Array<{ value: ComposerSpecies; label: string }> = [
  { value: 'dog', label: 'Dog' },
  { value: 'cat', label: 'Cat' },
  { value: null, label: 'Let the assistant decide' },
];

function SpeciesToggle({
  value,
  onChange,
  labelledBy,
}: {
  value: ComposerSpecies;
  onChange: (v: ComposerSpecies) => void;
  labelledBy: string;
}) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const current = Math.max(
    0,
    SPECIES_OPTIONS.findIndex((o) => o.value === value),
  );

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const delta = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (!delta) return;
    e.preventDefault();
    const nextIndex = (current + delta + SPECIES_OPTIONS.length) % SPECIES_OPTIONS.length;
    onChange(SPECIES_OPTIONS[nextIndex].value);
    refs.current[nextIndex]?.focus();
  }

  return (
    <div
      role="radiogroup"
      aria-labelledby={labelledBy}
      onKeyDown={onKeyDown}
      style={{
        display: 'inline-flex',
        flexWrap: 'wrap',
        gap: 4,
        padding: 4,
        // Not a full pill: on a phone the three options wrap onto two lines.
        borderRadius: 20,
        background: 'rgba(60,20,15,0.055)',
      }}
    >
      {SPECIES_OPTIONS.map((o, idx) => {
        const on = o.value === value;
        return (
          <button
            key={o.label}
            ref={(el) => {
              refs.current[idx] = el;
            }}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={on ? 0 : -1}
            className="pbt-studio-chip"
            onClick={() => onChange(o.value)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '7px 14px',
              borderRadius: 999,
              border: 'none',
              background: on ? '#fff' : 'transparent',
              boxShadow: on ? '0 4px 12px -6px rgba(60,20,15,0.35)' : 'none',
              color: on ? COLOR.ink : COLOR.inkSoft,
              fontSize: 13,
              fontWeight: on ? 800 : 650,
              fontFamily: 'var(--pbt-font)',
              cursor: 'pointer',
            }}
          >
            {o.value === null ? (
              <span aria-hidden style={{ color: 'oklch(0.55 0.18 320)' }}>
                ✦
              </span>
            ) : (
              <PetIcon species={o.value} />
            )}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

// ── Pick up where you left off ───────────────────────────────

function ResumeStrip({
  items,
  onResume,
  onDiscard,
}: {
  items: ResumableDraft[];
  onResume: (id: string) => void;
  onDiscard: (id: string) => void;
}) {
  const confirm = useConfirm();
  async function discard(item: ResumableDraft) {
    const ok = await confirm({
      title: `Discard your unsaved work on “${item.title}”?`,
      body: item.neverSaved
        ? 'It was never saved, so this deletes it.'
        : 'The saved version stays exactly as it is — only the unsaved changes go.',
      confirmLabel: 'Discard',
      cancelLabel: 'Keep it',
      tone: 'danger',
    });
    if (ok) onDiscard(item.id);
  }
  return (
    <Glass padding={20} radius={20}>
      <section aria-labelledby="studio-resume-title" style={{ display: 'grid', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
          <h2 id="studio-resume-title" style={{ margin: 0, fontSize: 16, fontWeight: 750, color: COLOR.ink }}>
            Pick up where you left off
          </h2>
          <span style={{ fontSize: 12.5, color: COLOR.inkMute }}>
            Kept in this browser — not saved yet.
          </span>
        </div>
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 8 }}>
          {items.map((item) => (
            <li
              key={item.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                flexWrap: 'wrap',
                padding: '10px 12px',
                borderRadius: 14,
                background: 'rgba(255,255,255,0.65)',
                border: `1px solid ${COLOR.borderSoft}`,
              }}
            >
              <div style={{ flex: '1 1 220px', minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 750, color: COLOR.ink, overflowWrap: 'anywhere' }}>
                  {item.title}
                </div>
                <div style={{ fontSize: 12, color: COLOR.inkMute, marginTop: 2 }}>
                  {item.summary ? `${item.summary} · ` : ''}
                  {item.neverSaved ? 'Only in this browser' : 'Unsaved changes'} · {relativeTime(item.savedAt)}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <Button
                  tone="primary"
                  size="sm"
                  onClick={() => onResume(item.id)}
                  aria-label={`Resume “${item.title}”`}
                >
                  Resume
                </Button>
                <Button
                  tone="ghost"
                  size="sm"
                  onClick={() => void discard(item)}
                  aria-label={`Discard unsaved work on “${item.title}”`}
                >
                  Discard
                </Button>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </Glass>
  );
}

// ── Gallery ──────────────────────────────────────────────────

function Gallery({
  entries,
  loading,
  canWrite,
  query,
  onClearQuery,
  onCreate,
  onOpen,
  onDuplicate,
  onAddToLibrary,
  libraryCopies,
  objections,
  categories,
  unsavedIds,
}: {
  entries: StudioEntry[];
  loading: boolean;
  canWrite: boolean;
  query: string;
  onClearQuery: () => void;
  onCreate: StudioHomeProps['onCreate'];
  onOpen: (entry: StudioEntry) => void;
  onDuplicate: (entry: StudioEntry) => void;
  onAddToLibrary: (entry: StudioEntry) => void;
  libraryCopies: ReadonlyMap<string, StudioEntry[]>;
  objections: readonly GalleryObjectionRef[];
  categories: readonly Pick<ObjectionCategory, 'id' | 'name'>[];
  unsavedIds: ReadonlySet<string>;
}) {
  const [filter, setFilter] = useState<GalleryFilter>('all');
  const [animal, setAnimal] = useState<AnimalFilter>('all');
  const [category, setCategory] = useState<string>(ALL_CATEGORIES);
  const [objection, setObjection] = useState<string>(ALL_OBJECTIONS);
  const [limit, setLimit] = useState(PAGE);
  const objectionId = useId();
  const categoryId = useId();

  const facets = useMemo(
    () => galleryFacets(entries, { status: filter, animal, category, objection }, query, objections, categories),
    [entries, filter, animal, category, objection, query, objections, categories],
  );
  const shown = facets.shown;
  const showAll = () => {
    setFilter('all');
    setAnimal('all');
    setCategory(ALL_CATEGORIES);
    setObjection(ALL_OBJECTIONS);
  };

  return (
    // `minmax(0, 1fr)`: a <select> is as wide as its longest option, and an
    // `auto` column would grow to it — pushing every card off a phone screen.
    <section
      aria-labelledby="studio-gallery-title"
      style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 14 }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <h2 id="studio-gallery-title" style={{ margin: 0, fontSize: 18, fontWeight: 750, color: COLOR.ink, letterSpacing: '-0.02em' }}>
          Your scenarios
        </h2>
        <div role="group" aria-label="Show" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginLeft: 'auto' }}>
          {GALLERY_FILTERS.map((f) => (
            <Chip
              key={f.key}
              selected={filter === f.key}
              onClick={() => {
                setFilter(f.key);
                setLimit(PAGE);
              }}
            >
              {f.label}
              <Count loading={loading} n={facets.status[f.key]} />
            </Chip>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div role="group" aria-label="Animal" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {ANIMAL_FILTERS.map((f) => (
            <Chip
              key={f.key}
              selected={animal === f.key}
              onClick={() => {
                setAnimal(f.key);
                setLimit(PAGE);
              }}
            >
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                {f.key !== 'all' && <PetIcon species={f.key} size={14} />}
                {f.label}
                <Count loading={loading} n={facets.animal[f.key]} />
              </span>
            </Chip>
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: '1 1 220px', minWidth: 0, maxWidth: 360 }}>
          <label htmlFor={categoryId} style={{ fontSize: 12.5, fontWeight: 700, color: COLOR.inkSoft, flexShrink: 0 }}>
            Category
          </label>
          <select
            id={categoryId}
            className="pbt-studio-field"
            value={category}
            onChange={(e) => {
              setCategory(e.target.value);
              // The objection options are scoped to the category.
              setObjection(ALL_OBJECTIONS);
              setLimit(PAGE);
            }}
            style={filterSelect}
          >
            <option value={ALL_CATEGORIES}>All categories{loading ? '' : ` (${facets.categoryTotal})`}</option>
            {facets.categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label} ({c.count})
              </option>
            ))}
          </select>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: '1 1 220px', minWidth: 0, maxWidth: 420 }}>
          <label htmlFor={objectionId} style={{ fontSize: 12.5, fontWeight: 700, color: COLOR.inkSoft, flexShrink: 0 }}>
            Objection
          </label>
          <select
            id={objectionId}
            className="pbt-studio-field"
            value={objection}
            onChange={(e) => {
              setObjection(e.target.value);
              setLimit(PAGE);
            }}
            style={filterSelect}
          >
            <option value={ALL_OBJECTIONS}>All objections{loading ? '' : ` (${facets.objectionTotal})`}</option>
            {facets.objections.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label} ({o.count})
              </option>
            ))}
          </select>
        </div>
      </div>

      {loading ? (
        <div style={cardGrid}>
          {[0, 1, 2].map((k) => (
            <LoadingShimmer key={k} height={220} />
          ))}
        </div>
      ) : shown.length === 0 ? (
        <EmptyGallery
          state={emptyGalleryState({
            selection: { status: filter, animal, category, objection },
            query,
            canWrite,
            entries,
            draftsMatching: facets.status.drafts,
            team: objections,
            categories,
          })}
          onCreate={(plan) =>
            onCreate({
              species: plan.species,
              prompt: null,
              pushbackId: plan.pushbackId,
              categoryId: plan.categoryId,
            })
          }
          onClearQuery={onClearQuery}
          onShowAll={showAll}
          onShowDrafts={() => {
            setFilter('drafts');
            setLimit(PAGE);
          }}
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
                  copies={libraryCopies.get(e.id) ?? []}
                  unsaved={unsavedIds.has(e.id)}
                  onOpen={onOpen}
                  onDuplicate={() => onDuplicate(e)}
                  onAddToLibrary={() => onAddToLibrary(e)}
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
    </section>
  );
}

function Count({ loading, n }: { loading: boolean; n: number }) {
  return (
    <span style={{ marginLeft: 6, opacity: 0.7, fontFamily: 'var(--pbt-mono)', fontSize: 11 }}>
      {loading ? '…' : n}
    </span>
  );
}

const filterSelect: React.CSSProperties = {
  flex: 1,
  minWidth: 0,
  padding: '7px 10px',
  borderRadius: 12,
  border: '1px solid rgba(60,20,15,0.14)',
  background: 'rgba(255,255,255,0.78)',
  fontSize: 13,
  fontFamily: 'var(--pbt-font)',
  color: COLOR.ink,
};

const cardGrid: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(min(280px, 100%), 1fr))',
  gap: 14,
};

function GalleryCard({
  entry,
  canWrite,
  objections,
  categoryName,
  copies,
  unsaved,
  onOpen,
  onDuplicate,
  onAddToLibrary,
}: {
  entry: StudioEntry;
  canWrite: boolean;
  objections: readonly GalleryObjectionRef[];
  /** The category its objection lives in (null: "Something else" / none). */
  categoryName: string | null;
  /** For a trainee's scenario: its saved library copies, newest first. */
  copies: StudioEntry[];
  /** There are edits to it kept in this browser. */
  unsaved: boolean;
  onOpen: (entry: StudioEntry) => void;
  onDuplicate: () => void;
  onAddToLibrary: () => void;
}) {
  const status = entryStatusText(entry, copies);
  const difficulty = difficultyText(entry.draft.difficulty_override);
  const species = speciesOf(entry.draft.species);
  const trainee = entry.source === 'user';
  const libraryVersion = copies[0] ?? null;
  const openLabel = canWrite ? 'Edit' : 'View';
  return (
    <article
      aria-label={entry.title}
      className="pbt-studio-tile"
      title={`Reference: ${entry.id}`}
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        padding: 12,
        borderRadius: 20,
        background: 'rgba(255,255,255,0.7)',
        border: '1px solid rgba(255,255,255,0.95)',
        boxShadow: '0 1px 0 rgba(255,255,255,0.95) inset, 0 10px 28px -18px rgba(60,20,15,0.25)',
        minWidth: 0,
      }}
    >
      <CardPreview draft={{ ...entry.draft, card_title_override: entry.title }} compact />
      <div style={{ padding: '0 4px', display: 'grid', gap: 6, flex: 1 }}>
        {categoryName && (
          <div
            style={{
              fontFamily: 'var(--pbt-mono)',
              fontSize: 10.5,
              fontWeight: 700,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              color: COLOR.inkMute,
              overflowWrap: 'anywhere',
            }}
          >
            {categoryName}
          </div>
        )}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 7,
            fontSize: 13,
            color: COLOR.ink,
            fontWeight: 650,
            minWidth: 0,
          }}
        >
          <PetBadge species={species} size={22} />
          <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>
            {species === 'cat' ? 'Cat' : 'Dog'} ·{' '}
            <span style={{ fontWeight: 700 }}>
              {entry.draft.pushback_id ? objectionLabel(entry.draft.pushback_id, objections) : 'No objection yet'}
            </span>
          </span>
        </div>
        <div style={{ fontSize: 12.5, color: COLOR.inkSoft, overflowWrap: 'anywhere' }}>
          {scenarioSummary(entry.draft)}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <StatusDot tone={status.tone}>{status.text}</StatusDot>
          {difficulty && <span style={{ fontSize: 12, color: COLOR.inkMute }}>{difficulty}</span>}
        </div>
        <div style={{ fontSize: 11.5, color: COLOR.inkMute }}>
          {SOURCE_LABELS[entry.source]}
          {entry.editedAt !== null && <> · Edited {relativeTime(entry.editedAt)}</>}
          {unsaved && (
            <span style={{ color: COLOR.warn, fontWeight: 700 }}> · Unsaved changes in this browser</span>
          )}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, padding: '0 4px 4px', flexWrap: 'wrap' }}>
        {trainee ? (
          <TraineeActions
            title={entry.title}
            canWrite={canWrite}
            libraryVersion={libraryVersion}
            onOpenEntry={() => onOpen(entry)}
            onOpenLibrary={() => libraryVersion && onOpen(libraryVersion)}
            onAddToLibrary={onAddToLibrary}
          />
        ) : (
          <>
            <Button
              tone="secondary"
              size="sm"
              onClick={() => onOpen(entry)}
              aria-label={`${openLabel} “${entry.title}”`}
              style={{ flex: 1, background: 'rgba(255,255,255,0.9)' }}
            >
              {openLabel}
            </Button>
            {canWrite && (
              <Button tone="ghost" size="sm" onClick={onDuplicate} aria-label={`Duplicate “${entry.title}”`}>
                Duplicate
              </Button>
            )}
          </>
        )}
      </div>
    </article>
  );
}

/**
 * A trainee's scenario belongs to that trainee: the Studio never edits it in
 * place (an edit there reached nobody). It is promoted instead — "Add to
 * library" opens a hidden copy for everyone — and once that copy exists the
 * card leads to it.
 */
function TraineeActions({
  title,
  canWrite,
  libraryVersion,
  onOpenEntry,
  onOpenLibrary,
  onAddToLibrary,
}: {
  title: string;
  canWrite: boolean;
  libraryVersion: StudioEntry | null;
  onOpenEntry: () => void;
  onOpenLibrary: () => void;
  onAddToLibrary: () => void;
}) {
  const wide = { flex: 1, background: 'rgba(255,255,255,0.9)' };
  if (!canWrite) {
    return libraryVersion ? (
      <Button tone="secondary" size="sm" onClick={onOpenLibrary} aria-label={`View the library version of “${title}”`} style={wide}>
        View library version
      </Button>
    ) : (
      <Button tone="secondary" size="sm" onClick={onOpenEntry} aria-label={`View “${title}”`} style={wide}>
        View
      </Button>
    );
  }
  if (libraryVersion) {
    return (
      <>
        <Button tone="secondary" size="sm" onClick={onOpenLibrary} aria-label={`Open the library version of “${title}”`} style={wide}>
          Open library version
        </Button>
        <Button tone="ghost" size="sm" onClick={onAddToLibrary} aria-label={`Add another copy of “${title}” to the library`}>
          Add another copy
        </Button>
      </>
    );
  }
  return (
    <Button
      tone="primary"
      size="sm"
      onClick={onAddToLibrary}
      aria-label={`Add “${title}” to the library`}
      title="Make a copy your whole team can use — it stays hidden until you publish it"
      style={{ flex: 1 }}
    >
      Add to library
    </Button>
  );
}

/**
 * Nothing to show. The words and the actions come from `emptyGalleryState`:
 * when it fits, the primary action starts the very scenario the filters were
 * looking for ("Create your first cat scenario"); "Show all scenarios" stays
 * as the quiet way back.
 */
function EmptyGallery({
  state,
  onCreate,
  onClearQuery,
  onShowAll,
  onShowDrafts,
}: {
  state: EmptyGalleryState;
  onCreate: (plan: GalleryCreatePlan) => void;
  onClearQuery: () => void;
  onShowAll: () => void;
  onShowDrafts: () => void;
}) {
  const { create, draftsWaiting } = state;
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
      <div style={{ fontSize: 15, fontWeight: 750, color: COLOR.ink, overflowWrap: 'anywhere' }}>
        {state.title}
      </div>
      <div style={{ fontSize: 13, color: COLOR.inkMute, maxWidth: 440, lineHeight: 1.5 }}>{state.body}</div>
      {(hasPrimary || state.clearSearch || state.showAll) && (
        <div
          style={{
            display: 'flex',
            gap: 8,
            flexWrap: 'wrap',
            justifyContent: 'center',
            marginTop: 6,
            maxWidth: '100%',
          }}
        >
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
        </div>
      )}
    </div>
  );
}
