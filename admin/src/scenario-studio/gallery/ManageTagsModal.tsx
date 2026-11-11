/**
 * "Manage tags": the team's whole tag library — create, rename, recolour and
 * delete (after a confirm that says how many scenarios carry it). Reachable
 * from a card's tag popover and from the gallery's Tags filter.
 *
 * Every change saves on its own (rename on Enter / leaving the field) and is
 * optimistic; a failure rolls back and is said in a toast by the caller.
 */
import { useEffect, useRef, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Modal, ModalCloseButton } from '../../primitives';
import { Button } from '../../primitives/form';
import { useConfirm } from '../../primitives/Confirm';
import { COLOR } from '../../lib/tokens';
import {
  TAG_COLORS,
  TAG_LIMITS,
  nextTagColor,
  normalizeTagName,
  tagNameKey,
  tagNameProblem,
  type AdminScenarioTag,
  type TagColor,
} from '../../../../src/shared/scenarios/tags';
import { Kicker } from '../ui';
import { IconAction, PalettePicker, TagDot, TagPill } from './galleryUi';

export interface ManageTagsModalProps {
  open: boolean;
  onClose: () => void;
  tags: readonly AdminScenarioTag[];
  /** Scenario count per tag, as the gallery sees it (live scenarios only). */
  usage: ReadonlyMap<string, number>;
  onCreate: (name: string, color: TagColor) => Promise<unknown>;
  onUpdate: (id: string, patch: { name?: string; color?: TagColor }) => Promise<unknown>;
  onDelete: (id: string) => Promise<unknown>;
}

const fieldStyle: React.CSSProperties = {
  flex: 1,
  minWidth: 0,
  padding: '8px 10px',
  borderRadius: 10,
  border: '1px solid rgba(60,20,15,0.16)',
  background: '#fff',
  fontSize: 13.5,
  fontFamily: 'var(--pbt-font)',
  color: COLOR.ink,
};

function TagRow({
  tag,
  count,
  taken,
  onUpdate,
  onDelete,
}: {
  tag: AdminScenarioTag;
  count: number;
  taken: (name: string, exceptId: string) => boolean;
  onUpdate: ManageTagsModalProps['onUpdate'];
  onDelete: (tag: AdminScenarioTag) => void;
}) {
  const [name, setName] = useState(tag.name);
  const [palette, setPalette] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  useEffect(() => setName(tag.name), [tag.name]);

  async function commit() {
    const next = normalizeTagName(name);
    if (next === tag.name) {
      setProblem(null);
      return;
    }
    const p = tagNameProblem(next) ?? (taken(next, tag.id) ? 'Another tag already has that name.' : null);
    if (p) {
      setProblem(p);
      return;
    }
    setProblem(null);
    try {
      await onUpdate(tag.id, { name: next });
    } catch {
      setName(tag.name);
    }
  }

  return (
    <li style={{ display: 'grid', gap: 6, padding: '8px 0', borderBottom: '1px solid rgba(60,20,15,0.06)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <button
          type="button"
          onClick={() => setPalette((v) => !v)}
          aria-expanded={palette}
          aria-label={`Colour of “${tag.name}”: ${TAG_COLORS[tag.color].label}. Change colour`}
          title="Change colour"
          className="pbt-gal-pill"
          style={{
            width: 34,
            height: 34,
            borderRadius: 10,
            border: '1px solid rgba(60,20,15,0.12)',
            background: '#fff',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            flexShrink: 0,
          }}
        >
          <TagDot color={tag.color} size={14} />
        </button>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => void commit()}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              void commit();
            }
          }}
          aria-label={`Name of the tag “${tag.name}”`}
          aria-invalid={problem ? true : undefined}
          maxLength={TAG_LIMITS.nameMax + 8}
          className="pbt-studio-field"
          style={fieldStyle}
        />
        <span style={{ fontSize: 12, color: COLOR.inkMute, whiteSpace: 'nowrap', minWidth: 78, textAlign: 'right' }}>
          {count === 0 ? 'Not used' : `${count} scenario${count === 1 ? '' : 's'}`}
        </span>
        <IconAction icon={Trash2} label={`Delete the tag “${tag.name}”`} tip="Delete tag" tipAlign="end" onClick={() => onDelete(tag)} />
      </div>
      {problem && (
        <div role="alert" style={{ fontSize: 12, color: COLOR.danger, paddingLeft: 42 }}>
          {problem}
        </div>
      )}
      {palette && (
        <div style={{ paddingLeft: 42 }}>
          <PalettePicker
            value={tag.color}
            label={`Colour for “${tag.name}”`}
            onChange={(c) => void onUpdate(tag.id, { color: c }).catch(() => {})}
          />
        </div>
      )}
    </li>
  );
}

export function ManageTagsModal(props: ManageTagsModalProps) {
  const { tags, usage } = props;
  const confirm = useConfirm();
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState<TagColor>(() => nextTagColor(tags.map((t) => t.color)));
  const [newProblem, setNewProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const newRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (props.open) setNewColor(nextTagColor(tags.map((t) => t.color)));
    // Only when it opens / the library size changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.open, tags.length]);

  const taken = (name: string, exceptId: string) =>
    tags.some((t) => t.id !== exceptId && tagNameKey(t.name) === tagNameKey(name));
  const atCap = tags.length >= TAG_LIMITS.maxTags;

  async function create() {
    const name = normalizeTagName(newName);
    const p = tagNameProblem(name) ?? (taken(name, '') ? 'Another tag already has that name.' : null);
    if (p) {
      setNewProblem(p);
      return;
    }
    setNewProblem(null);
    setBusy(true);
    try {
      await props.onCreate(name, newColor);
      setNewName('');
      newRef.current?.focus();
    } catch {
      /* the caller toasts */
    } finally {
      setBusy(false);
    }
  }

  async function remove(tag: AdminScenarioTag) {
    const n = usage.get(tag.id) ?? 0;
    const ok = await confirm({
      title: `Delete the tag “${tag.name}”?`,
      body: 'Tags are shared by the whole team.',
      consequences: [
        n === 0
          ? 'No scenario carries it right now.'
          : `It comes off ${n} scenario${n === 1 ? '' : 's'} — the scenarios themselves don’t change.`,
        'Trainees never see tags, so nothing changes in the app.',
      ],
      confirmLabel: 'Delete tag',
      tone: 'danger',
    });
    if (!ok) return;
    await props.onDelete(tag.id).catch(() => {});
  }

  if (!props.open) return null;
  const modal = (
    <Modal open onClose={props.onClose} width={560} ariaLabel="Manage tags">
      <div style={{ padding: 24, display: 'grid', gap: 16, overflowY: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <div style={{ flex: 1 }}>
            <Kicker>Scenario Studio</Kicker>
            <h2 style={{ margin: '6px 0 0', fontSize: 20, fontWeight: 800, color: COLOR.ink }}>Manage tags</h2>
            <p style={{ margin: '6px 0 0', fontSize: 13.5, color: COLOR.inkSoft, lineHeight: 1.5 }}>
              Tags are shared by the whole team and only shown here in the Studio — trainees never see them.
            </p>
          </div>
          <ModalCloseButton onClose={props.onClose} />
        </div>

        <div style={{ display: 'grid', gap: 8, padding: 12, borderRadius: 14, background: 'rgba(60,20,15,0.035)' }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ flexShrink: 0, display: 'inline-flex' }}>
              <TagPill name={normalizeTagName(newName) || 'New tag'} color={newColor} size="md" />
            </span>
            <input
              ref={newRef}
              value={newName}
              onChange={(e) => {
                setNewName(e.target.value);
                setNewProblem(null);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  void create();
                }
              }}
              placeholder="New tag name"
              aria-label="New tag name"
              aria-invalid={newProblem ? true : undefined}
              disabled={atCap}
              maxLength={TAG_LIMITS.nameMax + 8}
              className="pbt-studio-field"
              style={fieldStyle}
            />
            <Button tone="primary" onClick={() => void create()} busy={busy} disabled={atCap || !normalizeTagName(newName)}>
              <Plus size={15} aria-hidden /> Add tag
            </Button>
          </div>
          <PalettePicker value={newColor} onChange={setNewColor} label="Colour for the new tag" />
          {newProblem && (
            <div role="alert" style={{ fontSize: 12, color: COLOR.danger }}>
              {newProblem}
            </div>
          )}
          {atCap && (
            <div role="status" style={{ fontSize: 12, color: COLOR.inkMute }}>
              The team has {TAG_LIMITS.maxTags} tags — delete one you no longer use to add another.
            </div>
          )}
        </div>

        {tags.length === 0 ? (
          <div style={{ fontSize: 13, color: COLOR.inkMute, textAlign: 'center', padding: '8px 0 4px' }}>
            No tags yet. Add one above — “Q1 rollout”, “Needs vet review”, “Workshop”…
          </div>
        ) : (
          <ul aria-label="Tags" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {tags.map((t) => (
              <TagRow
                key={t.id}
                tag={t}
                count={usage.get(t.id) ?? 0}
                taken={taken}
                onUpdate={props.onUpdate}
                onDelete={(tag) => void remove(tag)}
              />
            ))}
          </ul>
        )}
      </div>
    </Modal>
  );
  // Rendered in place by the gallery (never inside a card — see the header),
  // so the shared confirm dialog, which mounts after the app, stays on top.
  return modal;
}
