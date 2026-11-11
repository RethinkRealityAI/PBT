/**
 * The gallery's filter layout, top to bottom:
 *
 *   1. Animal — a big Dog | Cat pill. The overarching choice: every count
 *      below is for the chosen animal.
 *   2. Search + status — search (debounced; `/` focuses it, Escape clears),
 *      the status views with counts, and "Archived (n)" set apart at the end.
 *   3. Refine — category chips (scrolling, edge fade), an objection select
 *      that narrows within the chosen category, and the Tags filter.
 *   4. "Showing 12 of 40 · Clear filters" whenever anything beyond the
 *      animal is set.
 *
 * Purely presentational: every number comes from `galleryFacets`.
 */
import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { Archive, Search, Settings2, Tags, X } from 'lucide-react';
import { COLOR } from '../../lib/tokens';
import { PetIcon } from '../ui';
import {
  ALL_CATEGORIES,
  ALL_OBJECTIONS,
  GALLERY_FILTERS,
  type GalleryFacets,
  type GalleryFilter,
} from '../studioModel';
import type { ScenarioSpecies } from '../../../../src/shared/scenarios/species';
import { CountBadge, EdgeScroller, Popover, TagDot } from './galleryUi';

// ── 1. Animal ────────────────────────────────────────────────

const ANIMALS: Array<{ key: ScenarioSpecies; label: string }> = [
  { key: 'dog', label: 'Dog' },
  { key: 'cat', label: 'Cat' },
];

export function AnimalSwitch({
  value,
  counts,
  loading,
  onChange,
}: {
  value: ScenarioSpecies;
  counts: Record<ScenarioSpecies, number>;
  loading: boolean;
  onChange: (s: ScenarioSpecies) => void;
}) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const delta = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (!delta) return;
    e.preventDefault();
    const i = (ANIMALS.findIndex((a) => a.key === value) + delta + ANIMALS.length) % ANIMALS.length;
    onChange(ANIMALS[i].key);
    refs.current[i]?.focus();
  }
  return (
    <div
      role="radiogroup"
      aria-label="Animal"
      onKeyDown={onKeyDown}
      className="pbt-gal-animal"
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: 4,
        padding: 5,
        borderRadius: 999,
        background: 'rgba(60,20,15,0.06)',
        border: '1px solid rgba(60,20,15,0.05)',
      }}
    >
      {ANIMALS.map((a, i) => {
        const on = a.key === value;
        return (
          <button
            key={a.key}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={on ? 0 : -1}
            className="pbt-gal-seg"
            onClick={() => onChange(a.key)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              padding: '10px 18px',
              borderRadius: 999,
              border: 'none',
              background: on ? '#fff' : 'transparent',
              boxShadow: on ? '0 6px 16px -8px rgba(60,20,15,0.4), 0 0 0 1px rgba(60,20,15,0.06)' : 'none',
              color: on ? COLOR.ink : COLOR.inkSoft,
              fontSize: 15,
              fontWeight: on ? 800 : 650,
              fontFamily: 'var(--pbt-font)',
              cursor: 'pointer',
            }}
          >
            <PetIcon species={a.key} size={18} />
            {a.label}
            <CountBadge n={counts[a.key]} loading={loading} />
          </button>
        );
      })}
    </div>
  );
}

// ── 2. Search + status ──────────────────────────────────────

export function SearchBox({ value, onChange }: { value: string; onChange: (q: string) => void }) {
  const [text, setText] = useState(value);
  const ref = useRef<HTMLInputElement | null>(null);
  // An outside change (Clear filters, a cleared search) wins over the box.
  useEffect(() => setText(value), [value]);
  useEffect(() => {
    if (text === value) return;
    const t = window.setTimeout(() => onChange(text), 200);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);
  // `/` focuses the search from anywhere on the page (not while typing).
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      e.preventDefault();
      ref.current?.focus();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        height: 40,
        padding: '0 10px 0 12px',
        borderRadius: 12,
        background: '#fff',
        border: '1px solid rgba(60,20,15,0.14)',
        flex: '1 1 260px',
        minWidth: 0,
        maxWidth: 440,
      }}
    >
      <Search size={16} aria-hidden style={{ color: COLOR.inkMute, flexShrink: 0 }} />
      <input
        ref={ref}
        type="search"
        className="pbt-gal-search"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape' && text) {
            e.preventDefault();
            e.stopPropagation();
            setText('');
            onChange('');
          } else if (e.key === 'Enter') {
            onChange(text);
          }
        }}
        placeholder="Search scenarios, breeds, tags…"
        aria-label="Search scenarios"
        aria-keyshortcuts="/"
        style={{
          flex: 1,
          minWidth: 0,
          border: 'none',
          outline: 'none',
          background: 'transparent',
          fontSize: 13.5,
          fontFamily: 'var(--pbt-font)',
          color: COLOR.ink,
        }}
      />
      {text ? (
        <button
          type="button"
          onClick={() => {
            setText('');
            onChange('');
            ref.current?.focus();
          }}
          aria-label="Clear search"
          className="pbt-gal-seg"
          style={{ border: 'none', background: 'transparent', color: COLOR.inkMute, cursor: 'pointer', padding: 4, display: 'inline-flex', borderRadius: 6 }}
        >
          <X size={15} aria-hidden />
        </button>
      ) : (
        <kbd
          aria-hidden
          style={{
            fontFamily: 'var(--pbt-mono)',
            fontSize: 11,
            color: COLOR.inkMute,
            border: '1px solid rgba(60,20,15,0.14)',
            borderRadius: 6,
            padding: '1px 6px',
          }}
        >
          /
        </kbd>
      )}
    </div>
  );
}

export function StatusControl({
  value,
  counts,
  loading,
  onChange,
}: {
  value: GalleryFilter;
  counts: Record<GalleryFilter, number>;
  loading: boolean;
  onChange: (f: GalleryFilter) => void;
}) {
  return (
    <div
      role="group"
      aria-label="Show"
      style={{
        display: 'inline-flex',
        flexWrap: 'wrap',
        gap: 2,
        padding: 3,
        borderRadius: 12,
        background: 'rgba(60,20,15,0.055)',
        // In the Archived view none of these is selected — read as inactive.
        opacity: value === 'archived' ? 0.62 : 1,
      }}
    >
      {GALLERY_FILTERS.map((f) => {
        const on = value === f.key;
        return (
          <button
            key={f.key}
            type="button"
            aria-pressed={on}
            className="pbt-gal-seg"
            onClick={() => onChange(f.key)}
            style={{
              padding: '6px 11px',
              borderRadius: 9,
              border: 'none',
              background: on ? '#fff' : 'transparent',
              boxShadow: on ? '0 2px 8px -4px rgba(60,20,15,0.35)' : 'none',
              color: on ? COLOR.ink : COLOR.inkSoft,
              fontSize: 12.5,
              fontWeight: on ? 800 : 650,
              fontFamily: 'var(--pbt-font)',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            {f.label}
            <CountBadge n={counts[f.key]} loading={loading} />
          </button>
        );
      })}
    </div>
  );
}

export function ArchivedToggle({
  active,
  count,
  loading,
  onToggle,
}: {
  active: boolean;
  count: number;
  loading: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onToggle}
      className="pbt-gal-seg"
      title={active ? 'Back to the scenarios in use' : 'Scenarios put away — hidden from trainees'}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '7px 12px',
        borderRadius: 12,
        border: `1px solid ${active ? COLOR.ink : 'rgba(60,20,15,0.14)'}`,
        background: active ? COLOR.ink : 'transparent',
        color: active ? '#fff' : COLOR.inkSoft,
        fontSize: 12.5,
        fontWeight: 700,
        fontFamily: 'var(--pbt-font)',
        cursor: 'pointer',
        whiteSpace: 'nowrap',
      }}
    >
      <Archive size={14} aria-hidden />
      Archived
      <CountBadge n={count} loading={loading} />
    </button>
  );
}

// ── 3. Refine ───────────────────────────────────────────────

export function CategoryChips({
  facets,
  value,
  loading,
  onChange,
}: {
  facets: GalleryFacets;
  value: string;
  loading: boolean;
  onChange: (id: string) => void;
}) {
  const chip = (id: string, label: string, count: number) => {
    const on = value === id;
    return (
      <button
        key={id}
        type="button"
        aria-pressed={on}
        className="pbt-studio-chip"
        onClick={() => onChange(on && id !== ALL_CATEGORIES ? ALL_CATEGORIES : id)}
        style={{
          flexShrink: 0,
          padding: '6px 12px',
          borderRadius: 999,
          border: `1px solid ${on ? COLOR.brand : 'rgba(60,20,15,0.10)'}`,
          background: on ? COLOR.brand : 'rgba(255,255,255,0.85)',
          color: on ? '#fff' : COLOR.ink,
          fontSize: 12.5,
          fontWeight: 650,
          fontFamily: 'var(--pbt-font)',
          cursor: 'pointer',
          whiteSpace: 'nowrap',
        }}
      >
        {label}
        <CountBadge n={count} loading={loading} />
      </button>
    );
  };
  return (
    <EdgeScroller ariaLabel="Category">
      {chip(ALL_CATEGORIES, 'All categories', facets.categoryTotal)}
      {facets.categories.map((c) => chip(c.id, c.label, c.count))}
    </EdgeScroller>
  );
}

export function ObjectionSelect({
  facets,
  value,
  loading,
  onChange,
}: {
  facets: GalleryFacets;
  value: string;
  loading: boolean;
  onChange: (id: string) => void;
}) {
  const id = useId();
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: '1 1 260px', minWidth: 0, maxWidth: 400 }}>
      <label htmlFor={id} style={{ fontSize: 12.5, fontWeight: 700, color: COLOR.inkSoft, flexShrink: 0 }}>
        Objection
      </label>
      <select
        id={id}
        className="pbt-studio-field"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          flex: 1,
          minWidth: 0,
          height: 36,
          padding: '0 10px',
          borderRadius: 10,
          border: '1px solid rgba(60,20,15,0.14)',
          background: '#fff',
          fontSize: 13,
          fontFamily: 'var(--pbt-font)',
          color: COLOR.ink,
        }}
      >
        <option value={ALL_OBJECTIONS}>All objections{loading ? '' : ` (${facets.objectionTotal})`}</option>
        {facets.objections.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label} ({o.count})
          </option>
        ))}
      </select>
    </div>
  );
}

/** "Tags" — a multi-select (any-of) with colour dots and counts, plus "Manage tags…". */
export function TagFilter({
  facets,
  value,
  onChange,
  onManage,
  canManage,
}: {
  facets: GalleryFacets;
  value: readonly string[];
  onChange: (ids: string[]) => void;
  onManage: () => void;
  canManage: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLButtonElement | null>(null);
  const n = value.length;
  const names = facets.tags.filter((t) => value.includes(t.id)).map((t) => t.label);
  return (
    <>
      <button
        ref={ref}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="pbt-gal-seg"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 7,
          height: 36,
          padding: '0 12px',
          borderRadius: 10,
          border: `1px solid ${n ? COLOR.brand : 'rgba(60,20,15,0.14)'}`,
          background: n ? COLOR.brandSoft : '#fff',
          color: COLOR.ink,
          fontSize: 13,
          fontWeight: 700,
          fontFamily: 'var(--pbt-font)',
          cursor: 'pointer',
          maxWidth: 260,
          flexShrink: 0,
        }}
      >
        <Tags size={15} aria-hidden style={{ color: n ? COLOR.brand : COLOR.inkSoft, flexShrink: 0 }} />
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {n === 0 ? 'Tags' : n === 1 ? names[0] ?? '1 tag' : `${n} tags`}
        </span>
      </button>
      <Popover open={open} anchorRef={ref} onClose={() => setOpen(false)} ariaLabel="Filter by tags" width={280} align="start">
        <div style={{ padding: 12, display: 'grid', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 12.5, fontWeight: 750, color: COLOR.inkSoft, flex: 1 }}>
              Show scenarios with any of
            </span>
            {n > 0 && (
              <button
                type="button"
                onClick={() => onChange([])}
                style={{ border: 'none', background: 'transparent', color: COLOR.brand, fontWeight: 700, fontSize: 12.5, cursor: 'pointer', fontFamily: 'var(--pbt-font)' }}
              >
                Clear
              </button>
            )}
          </div>
          {facets.tags.length === 0 ? (
            <div style={{ fontSize: 12.5, color: COLOR.inkMute, padding: '2px 2px 6px' }}>
              No tags yet.{canManage ? ' Create them from a card’s tag button or below.' : ''}
            </div>
          ) : (
            <div style={{ display: 'grid', gap: 2 }}>
              {facets.tags.map((t) => {
                const on = value.includes(t.id);
                return (
                  <label
                    key={t.id}
                    className="pbt-gal-row"
                    style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '7px 8px', borderRadius: 10, cursor: 'pointer', fontSize: 13, fontWeight: on ? 750 : 600 }}
                  >
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={(e) => onChange(e.target.checked ? [...value, t.id] : value.filter((v) => v !== t.id))}
                      style={{ width: 16, height: 16, margin: 0, accentColor: COLOR.brand }}
                    />
                    <TagDot color={t.color} />
                    <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.label}</span>
                    <CountBadge n={t.count} />
                  </label>
                );
              })}
            </div>
          )}
          {canManage && (
            <div style={{ borderTop: '1px solid rgba(60,20,15,0.08)', paddingTop: 8 }}>
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  onManage();
                }}
                className="pbt-gal-row"
                style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '8px 8px', border: 'none', borderRadius: 10, background: 'transparent', cursor: 'pointer', fontSize: 13, fontWeight: 650, color: COLOR.inkSoft, fontFamily: 'var(--pbt-font)' }}
              >
                <Settings2 size={15} aria-hidden />
                Manage tags…
              </button>
            </div>
          )}
        </div>
      </Popover>
    </>
  );
}

// ── 4. Summary ──────────────────────────────────────────────

export function ActiveFilterSummary({
  shown,
  total,
  archived = false,
  onClear,
}: {
  shown: number;
  total: number;
  /** The Archived view: count archived scenarios, never "of" the ones in use. */
  archived?: boolean;
  /** Null when nothing but the view itself is set (nothing to clear). */
  onClear: (() => void) | null;
}) {
  const plural = (n: number) => `${n} archived scenario${n === 1 ? '' : 's'}`;
  return (
    <div role="status" style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: COLOR.inkSoft, flexWrap: 'wrap' }}>
      {archived ? (
        <span>
          {shown === total ? (
            <strong style={{ color: COLOR.ink }}>{plural(total)}</strong>
          ) : (
            <>
              Showing <strong style={{ color: COLOR.ink }}>{shown}</strong> of {plural(total)}
            </>
          )}{' '}
          — hidden from trainees until restored and published
        </span>
      ) : (
        <span>
          Showing <strong style={{ color: COLOR.ink }}>{shown}</strong> of {total}
        </span>
      )}
      {onClear && (
        <>
          <span aria-hidden>·</span>
          <button
            type="button"
            onClick={onClear}
            className="pbt-gal-seg"
            style={{ border: 'none', background: 'transparent', padding: 0, color: COLOR.brand, fontWeight: 750, fontSize: 13, cursor: 'pointer', fontFamily: 'var(--pbt-font)', borderRadius: 4 }}
          >
            Clear filters
          </button>
        </>
      )}
    </div>
  );
}
