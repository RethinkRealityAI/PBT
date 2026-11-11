/**
 * Scenario Studio — the home page (nothing open yet).
 *
 *   1. A composer: "What should your team practise?" — describe it in plain
 *      words (the assistant takes it from there) or go step by step.
 *   2. "Pick up where you left off": unsaved work kept in this browser.
 *   3. The gallery (./gallery): every scenario — built in, written here,
 *      built by trainees — as cards, with the animal / search / status /
 *      category / objection / tag filters and the card actions.
 */
import { useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { ContextBar, ScreenShell } from '../primitives/Shell';
import { Glass } from '../primitives/Glass';
import { Button } from '../primitives/form';
import { ReadOnlyBanner } from '../primitives/access';
import { FirstRunCard } from '../primitives/FirstRunCard';
import { useConfirm } from '../primitives/Confirm';
import { COLOR } from '../lib/tokens';
import type { ScenarioSpecies } from '../../../src/shared/scenarios/species';
import type { ObjectionCategory } from '../../../src/shared/scenarios/objectionCategories';
import { ASSIST_GRADIENT, Chip, Kicker, PetIcon, TextArea } from './ui';
import { relativeTime, type GalleryObjectionRef, type StudioEntry } from './studioModel';
import { Gallery, type GalleryActions } from './gallery/Gallery';

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
  /** The signed-in admin — the gallery's animal is remembered per account. */
  meUserId?: string;
  /** Card actions: publish / unpublish, archive / restore, tags. */
  actions: GalleryActions;
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
      {/* The search lives in the gallery's own filter bar (one search box). */}
      <ContextBar title="Scenario Studio" subtitle="Build, test and publish the conversations your team practises." />
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
          onQuery={onQuery}
          onCreate={props.onCreate}
          onOpen={props.onOpen}
          onDuplicate={props.onDuplicate}
          onAddToLibrary={props.onAddToLibrary}
          libraryCopies={props.libraryCopies}
          objections={props.objections}
          categories={props.categories ?? []}
          unsavedIds={unsavedIds}
          meUserId={props.meUserId}
          actions={props.actions}
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
