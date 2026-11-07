/**
 * One scenario in the Studio gallery.
 *
 * Action row: "Edit" (or "View" for a read-only role) and Publish /
 * Unpublish as labelled buttons — the label says what it does, following
 * the state — then compact icon actions with tooltips: Tags, Duplicate,
 * Archive. The row wraps rather than truncate on a narrow card. Only what the
 * role allows is rendered (`scenarios.write` for all four). An archived card
 * offers Open and Restore — never Publish. A trainee's own scenario keeps its
 * "Add to library" actions (tags and archive don't apply to it).
 *
 * The card never renders a dialog or popover itself: it lifts with a
 * transform on hover, which would trap a fixed-position child. It asks the
 * gallery instead (`onRequest`, `onOpenTags`).
 */
import { useRef } from 'react';
import { Archive, ArchiveRestore, Copy, EyeOff, Pencil, Send, Tag, Tags } from 'lucide-react';
import { Button } from '../../primitives/form';
import { COLOR } from '../../lib/tokens';
import { speciesOf } from '../../../../src/shared/scenarios/species';
import { PetBadge, StatusDot } from '../ui';
import { CardPreview } from '../CardPreview';
import {
  SOURCE_LABELS,
  difficultyText,
  entryStatusText,
  relativeTime,
  scenarioSummary,
  type GalleryObjectionRef,
  type StudioEntry,
} from '../studioModel';
import { objectionLabel } from '../objections/objectionsModel';
import { IconAction, TagPill } from './galleryUi';
import type { CardActionKind } from './CardActionDialog';

export interface GalleryCardTag {
  id: string;
  name: string;
  color: string;
}

export interface GalleryCardProps {
  entry: StudioEntry;
  canWrite: boolean;
  objections: readonly GalleryObjectionRef[];
  /** The category its objection lives in (null: "Something else" / none). */
  categoryName: string | null;
  /** For a trainee's scenario: its saved library copies, newest first. */
  copies: StudioEntry[];
  /** There are edits to it kept in this browser. */
  unsaved: boolean;
  /** The tags it carries (A→Z). */
  tags: readonly GalleryCardTag[];
  /** Tags can be stored (the migration has run and the library loaded). */
  tagsAvailable: boolean;
  /** Archive can be stored (`capabilities.archive`); false = button disabled with a reason. */
  archiveAvailable: boolean;
  /** A card action for this scenario is in flight. */
  busy: boolean;
  onOpen: (entry: StudioEntry) => void;
  onDuplicate: () => void;
  onAddToLibrary: () => void;
  onRequest: (kind: CardActionKind) => void;
  onRestore: () => void;
  onOpenTags: (anchor: HTMLButtonElement) => void;
  /** This card's tag popover is open. */
  tagsOpen?: boolean;
  /** Filter the gallery by a tag (clicking a pill). */
  onFilterTag: (tagId: string) => void;
}

const MAX_PILLS = 2;

export function GalleryCard(props: GalleryCardProps) {
  const { entry, canWrite, copies } = props;
  const status = entryStatusText(entry, copies);
  const difficulty = difficultyText(entry.draft.difficulty_override);
  const species = speciesOf(entry.draft.species);
  const trainee = entry.source === 'user';
  const libraryVersion = copies[0] ?? null;
  const openLabel = canWrite ? 'Edit' : 'View';
  const tagsRef = useRef<HTMLButtonElement | null>(null);
  const shownTags = props.tags.slice(0, MAX_PILLS);
  const moreTags = props.tags.slice(MAX_PILLS);
  const live = entry.status === 'live';

  return (
    <article
      aria-label={entry.title}
      aria-busy={props.busy || undefined}
      className="pbt-studio-tile"
      title={`Reference: ${entry.id}`}
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        padding: 12,
        borderRadius: 20,
        background: entry.archived ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.7)',
        border: entry.archived ? '1px dashed rgba(60,20,15,0.18)' : '1px solid rgba(255,255,255,0.95)',
        boxShadow: entry.archived
          ? 'none'
          : '0 1px 0 rgba(255,255,255,0.95) inset, 0 10px 28px -18px rgba(60,20,15,0.25)',
        minWidth: 0,
        opacity: props.busy ? 0.7 : 1,
      }}
    >
      <div style={{ position: 'relative', opacity: entry.archived ? 0.72 : 1 }}>
        <CardPreview draft={{ ...entry.draft, card_title_override: entry.title }} compact />
        {live && !entry.archived && (
          // Live vs not, scannable at a glance (the status line says it in full).
          <span
            aria-hidden
            style={{
              position: 'absolute',
              left: 10,
              bottom: 10,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              padding: '2px 8px 2px 7px',
              borderRadius: 999,
              background: 'oklch(0.94 0.06 145)',
              color: 'oklch(0.38 0.12 145)',
              border: '1px solid oklch(0.85 0.09 145)',
              fontSize: 11,
              fontWeight: 800,
              letterSpacing: '0.02em',
            }}
          >
            <span style={{ width: 6, height: 6, borderRadius: 999, background: COLOR.success }} />
            Live
          </span>
        )}
      </div>
      <div style={{ padding: '0 4px', display: 'grid', gap: 6, flex: 1, alignContent: 'start' }}>
        {(props.categoryName || props.tags.length > 0) && (
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, minWidth: 0 }}>
            <div
              style={{
                flex: 1,
                minWidth: 0,
                fontFamily: 'var(--pbt-mono)',
                fontSize: 10.5,
                fontWeight: 700,
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                color: COLOR.inkMute,
                overflowWrap: 'anywhere',
                paddingTop: 3,
              }}
            >
              {props.categoryName}
            </div>
            {props.tags.length > 0 && (
              <ul
                aria-label="Tags"
                style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', gap: 4, flexShrink: 1, minWidth: 0, justifyContent: 'flex-end', flexWrap: 'wrap' }}
              >
                {shownTags.map((t) => (
                  <li key={t.id} style={{ display: 'flex', minWidth: 0 }}>
                    <TagPill
                      name={t.name}
                      color={t.color}
                      onClick={() => props.onFilterTag(t.id)}
                      title={`Show scenarios tagged “${t.name}”`}
                    />
                  </li>
                ))}
                {moreTags.length > 0 && (
                  <li style={{ display: 'flex' }}>
                    <span
                      title={moreTags.map((t) => t.name).join(', ')}
                      aria-label={`${moreTags.length} more: ${moreTags.map((t) => t.name).join(', ')}`}
                      style={{
                        padding: '2px 7px',
                        borderRadius: 999,
                        background: 'rgba(60,20,15,0.06)',
                        color: COLOR.inkSoft,
                        fontSize: 11,
                        fontWeight: 750,
                        lineHeight: 1.45,
                      }}
                    >
                      +{moreTags.length}
                    </span>
                  </li>
                )}
              </ul>
            )}
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13, color: COLOR.ink, fontWeight: 650, minWidth: 0 }}>
          <PetBadge species={species} size={22} />
          <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>
            {species === 'cat' ? 'Cat' : 'Dog'} ·{' '}
            <span style={{ fontWeight: 700 }}>
              {entry.draft.pushback_id ? objectionLabel(entry.draft.pushback_id, props.objections) : 'No objection yet'}
            </span>
          </span>
        </div>
        <div style={{ fontSize: 12.5, color: COLOR.inkSoft, overflowWrap: 'anywhere' }}>{scenarioSummary(entry.draft)}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <StatusDot tone={status.tone}>{status.text}</StatusDot>
          {difficulty && <span style={{ fontSize: 12, color: COLOR.inkMute }}>{difficulty}</span>}
        </div>
        <div style={{ fontSize: 11.5, color: COLOR.inkMute }}>
          {SOURCE_LABELS[entry.source]}
          {entry.editedAt !== null && <> · Edited {relativeTime(entry.editedAt)}</>}
          {props.unsaved && <span style={{ color: COLOR.warn, fontWeight: 700 }}> · Unsaved changes in this browser</span>}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 6, padding: '0 4px 4px', alignItems: 'center', flexWrap: 'wrap' }}>
        {trainee ? (
          <TraineeActions
            title={entry.title}
            canWrite={canWrite}
            libraryVersion={libraryVersion}
            onOpenEntry={() => props.onOpen(entry)}
            onOpenLibrary={() => libraryVersion && props.onOpen(libraryVersion)}
            onAddToLibrary={props.onAddToLibrary}
          />
        ) : (
          <>
            <Button
              tone="secondary"
              size="sm"
              onClick={() => props.onOpen(entry)}
              aria-label={`${openLabel} “${entry.title}”`}
              style={{ flex: '1 1 64px', minWidth: 64, height: 34, background: 'rgba(255,255,255,0.9)' }}
            >
              {canWrite && <Pencil size={13} aria-hidden />}
              {openLabel}
            </Button>
            {canWrite && entry.archived && (
              <Button
                tone="secondary"
                size="sm"
                busy={props.busy}
                onClick={props.onRestore}
                aria-label={`Restore “${entry.title}”`}
                title="Bring it back as a hidden draft — publish it when you’re ready"
                style={{ height: 34, background: 'rgba(255,255,255,0.9)' }}
              >
                <ArchiveRestore size={15} aria-hidden /> Restore
              </Button>
            )}
            {canWrite && !entry.archived && (
              <>
                <Button
                  tone={live ? 'ghost' : 'secondary'}
                  size="sm"
                  disabled={props.busy}
                  onClick={() => props.onRequest(live ? 'unpublish' : 'publish')}
                  aria-label={live ? `Unpublish “${entry.title}”` : `Publish “${entry.title}”`}
                  title={live ? 'Hide it from trainees' : 'Make it live for trainees'}
                  style={
                    live
                      ? { height: 34, color: COLOR.inkSoft, border: '1px solid rgba(60,20,15,0.10)', background: 'transparent' }
                      : {
                          height: 34,
                          color: COLOR.brand,
                          background: COLOR.brandSoft,
                          border: `1px solid color-mix(in oklab, ${COLOR.brand} 32%, transparent)`,
                        }
                  }
                >
                  {live ? <EyeOff size={14} aria-hidden /> : <Send size={14} aria-hidden />}
                  {live ? 'Unpublish' : 'Publish'}
                </Button>
                <span style={{ display: 'inline-flex', gap: 6, marginLeft: 'auto' }}>
                {props.tagsAvailable && (
                  <IconAction
                    icon={props.tags.length ? Tags : Tag}
                    label={`Tags for “${entry.title}”`}
                    tip="Tags"
                    buttonRef={tagsRef}
                    aria-haspopup="dialog"
                    aria-expanded={props.tagsOpen}
                    onClick={() => tagsRef.current && props.onOpenTags(tagsRef.current)}
                  />
                )}
                <IconAction icon={Copy} label={`Duplicate “${entry.title}”`} tip="Duplicate" onClick={props.onDuplicate} />
                <IconAction
                  icon={Archive}
                  label={`Archive “${entry.title}”`}
                  tip={props.archiveAvailable ? 'Archive' : 'Archive needs a database update'}
                  tipAlign="end"
                  unavailable={!props.archiveAvailable}
                  disabled={props.busy}
                  onClick={() => props.onRequest('archive')}
                />
                </span>
              </>
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
  const wide = { flex: 1, height: 34, background: 'rgba(255,255,255,0.9)' };
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
        <IconAction
          icon={Copy}
          label={`Add another copy of “${title}” to the library`}
          tip="Add another copy"
          tipAlign="end"
          onClick={onAddToLibrary}
        />
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
      style={{ flex: 1, height: 34 }}
    >
      Add to library
    </Button>
  );
}
