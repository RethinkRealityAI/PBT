/**
 * Tagging one scenario: a search box that doubles as "create", the team's
 * tags as a checklist with their colours, and "Manage tags…".
 *
 *   • Typing filters the list; when no tag has exactly that name a
 *     "Create tag “Q1”" row appears — Enter creates it AND tags the scenario.
 *     Enter on an exact match toggles that tag instead.
 *   • A tag's colour dot opens the palette inline (recolours it for everyone).
 *   • Changes save as you click (optimistic; a failure rolls back and toasts).
 *   • Up to TAG_LIMITS.perScenario tags per scenario: the rest are disabled
 *     with a note once the scenario has that many.
 */
import { useId, useMemo, useRef, useState, type KeyboardEvent, type RefObject } from 'react';
import { Plus, Settings2 } from 'lucide-react';
import { COLOR } from '../../lib/tokens';
import {
  TAG_COLORS,
  TAG_LIMITS,
  normalizeTagName,
  tagNameKey,
  tagNameProblem,
  type AdminScenarioTag,
  type TagColor,
} from '../../../../src/shared/scenarios/tags';
import { PalettePicker, Popover, TagDot } from './galleryUi';

export interface TagPopoverProps {
  open: boolean;
  anchorRef: RefObject<HTMLElement | null>;
  onClose: () => void;
  scenarioTitle: string;
  tags: readonly AdminScenarioTag[];
  /** The ids this scenario carries now. */
  selected: readonly string[];
  onToggle: (tagId: string, on: boolean) => void;
  /** Create a tag and put it on this scenario. */
  onCreate: (name: string) => Promise<void>;
  onRecolor: (tagId: string, color: TagColor) => void;
  onManage: () => void;
}

export function TagPopover(props: TagPopoverProps) {
  const { tags, selected } = props;
  const [query, setQuery] = useState('');
  const [paletteFor, setPaletteFor] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listId = useId();
  const q = normalizeTagName(query);
  const key = tagNameKey(q);

  const shown = useMemo(
    () => (q ? tags.filter((t) => tagNameKey(t.name).includes(key)) : tags),
    [tags, q, key],
  );
  const exact = q ? tags.find((t) => tagNameKey(t.name) === key) ?? null : null;
  const full = selected.length >= TAG_LIMITS.perScenario;
  const atLibraryCap = tags.length >= TAG_LIMITS.maxTags;
  const problem = q ? tagNameProblem(q) : null;
  const canCreate = Boolean(q) && !exact && !problem && !full && !atLibraryCap;

  async function create() {
    if (!canCreate || creating) return;
    setCreating(true);
    try {
      await props.onCreate(q);
      setQuery('');
    } finally {
      setCreating(false);
      inputRef.current?.focus();
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    if (exact) {
      const on = selected.includes(exact.id);
      if (on || !full) props.onToggle(exact.id, !on);
      setQuery('');
    } else {
      void create();
    }
  }

  function close() {
    setQuery('');
    setPaletteFor(null);
    props.onClose();
  }

  return (
    <Popover
      open={props.open}
      anchorRef={props.anchorRef}
      onClose={close}
      ariaLabel={`Tags for “${props.scenarioTitle}”`}
      width={300}
      initialFocus={inputRef}
    >
      <div style={{ padding: 12, display: 'grid', gap: 10 }}>
        <div style={{ fontSize: 12.5, fontWeight: 750, color: COLOR.inkSoft }}>Tags</div>
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={tags.length ? 'Search or create a tag…' : 'Name your first tag…'}
          aria-label="Search or create a tag"
          aria-controls={listId}
          maxLength={TAG_LIMITS.nameMax + 8}
          className="pbt-studio-field"
          style={{
            width: '100%',
            padding: '8px 10px',
            borderRadius: 10,
            border: '1px solid rgba(60,20,15,0.16)',
            background: '#fff',
            fontSize: 13,
            fontFamily: 'var(--pbt-font)',
            color: COLOR.ink,
          }}
        />
        {problem && q.length > TAG_LIMITS.nameMax && (
          <div role="status" style={{ fontSize: 12, color: COLOR.danger }}>
            {problem}
          </div>
        )}
        <div id={listId} style={{ display: 'grid', gap: 2 }}>
          {shown.map((t) => {
            const on = selected.includes(t.id);
            const disabled = !on && full;
            return (
              <div key={t.id} style={{ display: 'grid', gap: 6 }}>
                <div className="pbt-gal-row" style={{ display: 'flex', alignItems: 'center', gap: 4, borderRadius: 10, padding: '0 4px' }}>
                  <button
                    type="button"
                    onClick={() => setPaletteFor((cur) => (cur === t.id ? null : t.id))}
                    aria-label={`Colour of “${t.name}”: ${TAG_COLORS[t.color].label}. Change colour`}
                    aria-expanded={paletteFor === t.id}
                    title="Change colour"
                    className="pbt-gal-pill"
                    style={{
                      width: 28,
                      height: 28,
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      border: 'none',
                      background: 'transparent',
                      borderRadius: 8,
                      cursor: 'pointer',
                      padding: 0,
                    }}
                  >
                    <TagDot color={t.color} size={12} />
                  </button>
                  <label
                    style={{
                      flex: 1,
                      minWidth: 0,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '7px 4px',
                      cursor: disabled ? 'not-allowed' : 'pointer',
                      opacity: disabled ? 0.5 : 1,
                      fontSize: 13,
                      fontWeight: on ? 750 : 600,
                    }}
                  >
                    <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {t.name}
                    </span>
                    <input
                      type="checkbox"
                      checked={on}
                      disabled={disabled}
                      onChange={(e) => props.onToggle(t.id, e.target.checked)}
                      style={{ width: 16, height: 16, margin: 0, accentColor: COLOR.brand, cursor: 'inherit', flexShrink: 0 }}
                    />
                  </label>
                </div>
                {paletteFor === t.id && (
                  <div style={{ padding: '2px 8px 8px 36px' }}>
                    <PalettePicker
                      value={t.color}
                      label={`Colour for “${t.name}”`}
                      onChange={(c) => props.onRecolor(t.id, c)}
                    />
                  </div>
                )}
              </div>
            );
          })}
          {shown.length === 0 && !q && (
            <div style={{ fontSize: 12.5, color: COLOR.inkMute, padding: '4px 6px' }}>
              No tags yet — type a name above to make the first one.
            </div>
          )}
          {q && !exact && (
            <button
              type="button"
              onClick={() => void create()}
              disabled={!canCreate || creating}
              className="pbt-gal-row"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '8px 8px',
                border: 'none',
                borderRadius: 10,
                background: 'transparent',
                cursor: canCreate ? 'pointer' : 'not-allowed',
                fontSize: 13,
                fontWeight: 700,
                color: canCreate ? COLOR.brand : COLOR.inkMute,
                fontFamily: 'var(--pbt-font)',
                textAlign: 'left',
              }}
            >
              <Plus size={15} aria-hidden />
              <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>
                {full
                  ? `This scenario already has ${TAG_LIMITS.perScenario} tags`
                  : atLibraryCap
                    ? `The team already has ${TAG_LIMITS.maxTags} tags`
                    : `Create tag “${q}”`}
              </span>
            </button>
          )}
        </div>
        {full && (
          <div role="status" style={{ fontSize: 12, color: COLOR.inkMute }}>
            Up to {TAG_LIMITS.perScenario} tags per scenario — untick one to add another.
          </div>
        )}
        <div style={{ borderTop: '1px solid rgba(60,20,15,0.08)', paddingTop: 8 }}>
          <button
            type="button"
            onClick={() => {
              close();
              props.onManage();
            }}
            className="pbt-gal-row"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              width: '100%',
              padding: '8px 8px',
              border: 'none',
              borderRadius: 10,
              background: 'transparent',
              cursor: 'pointer',
              fontSize: 13,
              fontWeight: 650,
              color: COLOR.inkSoft,
              fontFamily: 'var(--pbt-font)',
            }}
          >
            <Settings2 size={15} aria-hidden />
            Manage tags…
          </button>
        </div>
      </div>
    </Popover>
  );
}
