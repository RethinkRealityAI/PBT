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
import type { ScenarioSpecies } from '../../../src/shared/scenarios/species';
import {
  ASSIST_GRADIENT,
  AssistMark,
  Chip,
  Kicker,
  StatusDot,
  TextArea,
} from './ui';
import { CardPreview } from './CardPreview';
import {
  GALLERY_FILTERS,
  SOURCE_LABELS,
  difficultyText,
  matchesGalleryFilter,
  matchesGalleryQuery,
  relativeTime,
  scenarioSummary,
  sortForGallery,
  type GalleryFilter,
  type StudioEntry,
} from './studioModel';

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

export interface StudioHomeProps {
  entries: StudioEntry[];
  /** The first load is still in flight. */
  loading: boolean;
  canWrite: boolean;
  query: string;
  onQuery: (q: string) => void;
  /** Start a new scenario; `prompt` goes to the assistant when present. */
  onCreate: (args: { species: ComposerSpecies; prompt: string | null }) => void;
  onOpen: (entry: StudioEntry) => void;
  onDuplicate: (entry: StudioEntry) => void;
  resumable: ResumableDraft[];
  onResume: (id: string) => void;
  onDiscardLocal: (id: string) => void;
}

export function StudioHome(props: StudioHomeProps) {
  const { entries, loading, canWrite, query, onQuery } = props;
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
          <strong>Trainee-built</strong> ones were made by a trainee for their own practice. Every
          save and publish is recorded in <strong>Audit</strong>, and any of them can be undone
          from there — even a deleted scenario.
        </FirstRunCard>
        <Gallery
          entries={entries}
          loading={loading}
          canWrite={canWrite}
          query={query}
          onClearQuery={() => onQuery('')}
          onOpen={props.onOpen}
          onDuplicate={props.onDuplicate}
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

const SPECIES_OPTIONS: Array<{ value: ComposerSpecies; glyph: string; label: string }> = [
  { value: 'dog', glyph: '🐕', label: 'Dog' },
  { value: 'cat', glyph: '🐈', label: 'Cat' },
  { value: null, glyph: '✦', label: 'Let the assistant decide' },
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
            <span aria-hidden style={o.value === null ? { color: 'oklch(0.55 0.18 320)' } : undefined}>
              {o.glyph}
            </span>
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
                  {item.neverSaved ? 'Never saved' : 'Unsaved changes'} · {relativeTime(item.savedAt)}
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
  onOpen,
  onDuplicate,
}: {
  entries: StudioEntry[];
  loading: boolean;
  canWrite: boolean;
  query: string;
  onClearQuery: () => void;
  onOpen: (entry: StudioEntry) => void;
  onDuplicate: (entry: StudioEntry) => void;
}) {
  const [filter, setFilter] = useState<GalleryFilter>('all');
  const [limit, setLimit] = useState(PAGE);

  const searched = useMemo(
    () => sortForGallery(entries.filter((e) => matchesGalleryQuery(e, query))),
    [entries, query],
  );
  const counts = useMemo(() => {
    const out = {} as Record<GalleryFilter, number>;
    for (const f of GALLERY_FILTERS) out[f.key] = searched.filter((e) => matchesGalleryFilter(e, f.key)).length;
    return out;
  }, [searched]);
  const shown = searched.filter((e) => matchesGalleryFilter(e, filter));

  return (
    <section aria-labelledby="studio-gallery-title" style={{ display: 'grid', gap: 14 }}>
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
              <span style={{ marginLeft: 6, opacity: 0.7, fontFamily: 'var(--pbt-mono)', fontSize: 11 }}>
                {loading ? '…' : counts[f.key]}
              </span>
            </Chip>
          ))}
        </div>
      </div>

      {loading ? (
        <div style={cardGrid}>
          {[0, 1, 2].map((k) => (
            <LoadingShimmer key={k} height={220} />
          ))}
        </div>
      ) : shown.length === 0 ? (
        <EmptyGallery filter={filter} query={query} canWrite={canWrite} onClearQuery={onClearQuery} onShowAll={() => setFilter('all')} />
      ) : (
        <>
          <ul aria-label="Scenarios" style={{ ...cardGrid, listStyle: 'none', margin: 0, padding: 0 }}>
            {shown.slice(0, limit).map((e) => (
              <li key={e.id} style={{ display: 'flex' }}>
                <GalleryCard entry={e} canWrite={canWrite} onOpen={() => onOpen(e)} onDuplicate={() => onDuplicate(e)} />
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

const cardGrid: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(min(280px, 100%), 1fr))',
  gap: 14,
};

const STATUS_DOT: Record<StudioEntry['status'], { tone: 'success' | 'neutral' | 'warn'; text: string }> = {
  live: { tone: 'success', text: 'Live' },
  draft: { tone: 'neutral', text: 'Draft' },
  hidden: { tone: 'warn', text: 'Hidden' },
  trainee: { tone: 'neutral', text: 'Trainee’s own' },
};

function GalleryCard({
  entry,
  canWrite,
  onOpen,
  onDuplicate,
}: {
  entry: StudioEntry;
  canWrite: boolean;
  onOpen: () => void;
  onDuplicate: () => void;
}) {
  const status = STATUS_DOT[entry.status];
  const difficulty = difficultyText(entry.draft.difficulty_override);
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
        <div style={{ fontSize: 13, color: COLOR.inkSoft, overflowWrap: 'anywhere' }}>
          {scenarioSummary(entry.draft)}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <StatusDot tone={status.tone}>{status.text}</StatusDot>
          {difficulty && <span style={{ fontSize: 12, color: COLOR.inkMute }}>{difficulty}</span>}
        </div>
        <div style={{ fontSize: 11.5, color: COLOR.inkMute }}>
          {SOURCE_LABELS[entry.source]}
          {entry.editedAt !== null && <> · Edited {relativeTime(entry.editedAt)}</>}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, padding: '0 4px 4px' }}>
        <Button
          tone="secondary"
          size="sm"
          onClick={onOpen}
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
      </div>
    </article>
  );
}

function EmptyGallery({
  filter,
  query,
  canWrite,
  onClearQuery,
  onShowAll,
}: {
  filter: GalleryFilter;
  query: string;
  canWrite: boolean;
  onClearQuery: () => void;
  onShowAll: () => void;
}) {
  let title: string;
  let body: string;
  if (query.trim()) {
    title = `Nothing matches “${query.trim()}”`;
    body = 'Try a breed, a pushback or a driver — or clear the search.';
  } else if (filter === 'drafts') {
    title = 'No drafts right now';
    body = canWrite
      ? 'Every scenario is live. Describe a new one above to start a draft.'
      : 'Every scenario is live.';
  } else if (filter === 'trainee') {
    title = 'No trainee-built scenarios yet';
    body = 'When a trainee builds their own scenario in the app, it shows up here.';
  } else if (filter === 'live') {
    title = 'Nothing is live';
    body = 'Trainees can’t start a session until at least one scenario is published.';
  } else {
    title = 'No scenarios yet';
    body = canWrite ? 'Describe your first one above.' : 'Nothing has been built yet.';
  }
  return (
    <div
      style={{
        padding: '36px 20px',
        borderRadius: 20,
        border: `1px dashed rgba(60,20,15,0.16)`,
        background: 'rgba(255,255,255,0.45)',
        textAlign: 'center',
        display: 'grid',
        gap: 8,
        justifyItems: 'center',
      }}
    >
      <AssistMark size={30} />
      <div style={{ fontSize: 15, fontWeight: 750, color: COLOR.ink }}>{title}</div>
      <div style={{ fontSize: 13, color: COLOR.inkMute, maxWidth: 420 }}>{body}</div>
      {query.trim() ? (
        <Button tone="secondary" size="sm" onClick={onClearQuery}>
          Clear search
        </Button>
      ) : filter !== 'all' ? (
        <Button tone="secondary" size="sm" onClick={onShowAll}>
          Show all scenarios
        </Button>
      ) : null}
    </div>
  );
}
