import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Icon } from '../../design-system/Icon';
import { Chip } from '../../design-system/Chip';
import {
  POPULAR_BREEDS,
  searchBreeds,
  type BreedEntry,
} from '../../data/breeds';

/**
 * Searchable breed input with autocomplete.
 *
 * Behaviour:
 *   - Empty + focused → POPULAR_BREEDS quick-pick chips (one-tap select).
 *   - Typing → fuzzy match against canonical names + aliases ("gsd", "lab",
 *     "frenchie") with up to 8 suggestions.
 *   - No match → keep input free-text so unlisted breeds still work.
 *   - Selecting a suggestion or pressing Enter on the top match commits.
 *   - Keyboard: ↑ / ↓ / Enter / Escape navigate the dropdown.
 *
 * The component is uncontrolled-ish — parent passes `value` + `onChange`,
 * we manage open/highlight state internally.
 */
export interface BreedSearchProps {
  value: string;
  onChange: (value: string) => void;
  /** Called with the resolved breed entry when one is committed. Optional —
   *  consumers that don't need size hints can ignore it. */
  onSelectBreed?: (entry: BreedEntry | null) => void;
  placeholder?: string;
  autoFocus?: boolean;
  /** Optional invalid hint — outlines the input red. */
  invalid?: boolean;
}

export function BreedSearch({
  value,
  onChange,
  onSelectBreed,
  placeholder = 'Search breed (e.g. lab, frenchie, gsd)',
  autoFocus,
  invalid,
}: BreedSearchProps) {
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listboxId = useId();

  const suggestions = useMemo(() => searchBreeds(value, 8), [value]);
  const showPopular = value.trim().length === 0;

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  // Reset highlight whenever the suggestion list changes.
  useEffect(() => {
    setHighlight(0);
  }, [value]);

  function commit(name: string, entry: BreedEntry | null) {
    onChange(name);
    onSelectBreed?.(entry);
    setOpen(false);
    inputRef.current?.blur();
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') {
      setOpen(false);
      return;
    }
    if (!open) return;
    if (suggestions.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlight((h) => (h + 1) % suggestions.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight((h) => (h - 1 + suggestions.length) % suggestions.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const pick = suggestions[highlight];
      if (pick) commit(pick.name, pick);
    }
  }

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '10px 13px',
          borderRadius: 14,
          border: invalid
            ? '1.5px solid var(--pbt-score-poor)'
            : '1px solid color-mix(in oklab, var(--pbt-driver-primary) 42%, rgba(255,255,255,0.45))',
          background: 'color-mix(in oklab, var(--pbt-driver-primary) 10%, rgba(255,255,255,0.12))',
          backdropFilter: 'blur(14px) saturate(260%)',
          WebkitBackdropFilter: 'blur(14px) saturate(260%)',
          boxShadow:
            '0 1px 0 rgba(255,255,255,0.85) inset, 0 0 0 1px rgba(255,255,255,0.06) inset',
        }}
      >
        <Icon.search />
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          autoFocus={autoFocus}
          role="combobox"
          aria-expanded={open}
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-activedescendant={
            open && suggestions.length > 0
              ? `${listboxId}-opt-${highlight}`
              : undefined
          }
          style={{
            flex: 1,
            border: 'none',
            outline: 'none',
            background: 'transparent',
            fontFamily: 'inherit',
            fontSize: 16,
            color: 'var(--pbt-text)',
            minWidth: 0,
          }}
        />
        {value.length > 0 && (
          <button
            type="button"
            aria-label="Clear breed"
            onClick={() => {
              onChange('');
              onSelectBreed?.(null);
              inputRef.current?.focus();
            }}
            style={{
              border: 'none',
              background: 'transparent',
              padding: 4,
              cursor: 'pointer',
              color: 'var(--pbt-text-muted)',
              fontSize: 18,
              lineHeight: 1,
            }}
          >
            ×
          </button>
        )}
      </div>

      {/* Empty-state quick picks */}
      {open && showPopular && (
        <div style={{ marginTop: 10 }}>
          <div
            style={{
              fontFamily: 'var(--pbt-font-mono)',
              fontSize: 9,
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              color: 'var(--pbt-text-muted)',
              marginBottom: 6,
              paddingLeft: 2,
            }}
          >
            Popular
          </div>
          <div className="flex flex-wrap gap-2">
            {POPULAR_BREEDS.map((b) => (
              <Chip
                key={b}
                onClick={() => commit(b, null)}
              >
                {b}
              </Chip>
            ))}
          </div>
        </div>
      )}

      {/* Suggestion dropdown */}
      {open && !showPopular && suggestions.length > 0 && (
        <ul
          id={listboxId}
          role="listbox"
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            marginTop: 6,
            zIndex: 30,
            listStyle: 'none',
            padding: 4,
            margin: 0,
            borderRadius: 14,
            border: '1px solid color-mix(in oklab, var(--pbt-driver-primary) 30%, rgba(255,255,255,0.6))',
            background: 'color-mix(in oklab, white 80%, transparent)',
            backdropFilter: 'blur(28px) saturate(220%)',
            WebkitBackdropFilter: 'blur(28px) saturate(220%)',
            boxShadow:
              '0 1px 0 rgba(255,255,255,0.9) inset, 0 12px 32px -12px rgba(60,20,15,0.18)',
            maxHeight: 320,
            overflowY: 'auto',
          }}
        >
          {suggestions.map((entry, i) => {
            const active = i === highlight;
            return (
              <li
                key={entry.name}
                id={`${listboxId}-opt-${i}`}
                role="option"
                aria-selected={active}
                onMouseEnter={() => setHighlight(i)}
                // mousedown so we beat the input's blur handler.
                onMouseDown={(e) => {
                  e.preventDefault();
                  commit(entry.name, entry);
                }}
                style={{
                  padding: '9px 10px',
                  borderRadius: 10,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'baseline',
                  justifyContent: 'space-between',
                  gap: 10,
                  background: active
                    ? 'color-mix(in oklab, var(--pbt-driver-primary) 14%, transparent)'
                    : 'transparent',
                  color: 'var(--pbt-text)',
                }}
              >
                <span style={{ fontSize: 14, fontWeight: 600 }}>{entry.name}</span>
                <span
                  style={{
                    fontFamily: 'var(--pbt-font-mono)',
                    fontSize: 10,
                    letterSpacing: '0.06em',
                    color: 'var(--pbt-text-muted)',
                  }}
                >
                  {entry.group} · {entry.sizeKg[0]}–{entry.sizeKg[1]} kg
                </span>
              </li>
            );
          })}
        </ul>
      )}

      {/* No-match — explicit "use as custom" affordance so users always have a path forward. */}
      {open && !showPopular && suggestions.length === 0 && value.trim().length > 0 && (
        <div
          style={{
            marginTop: 6,
            padding: '10px 12px',
            borderRadius: 12,
            background: 'rgba(255,255,255,0.6)',
            border: '1px dashed color-mix(in oklab, var(--pbt-driver-primary) 30%, rgba(0,0,0,0.08))',
            fontSize: 13,
            color: 'var(--pbt-text-muted)',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            flexWrap: 'wrap',
          }}
        >
          <span>No matches.</span>
          <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              commit(value.trim(), null);
            }}
            style={{
              background: 'none',
              border: 'none',
              padding: 0,
              cursor: 'pointer',
              fontWeight: 700,
              color: 'var(--pbt-driver-primary)',
              fontFamily: 'inherit',
              fontSize: 13,
            }}
          >
            Use “{value.trim()}” anyway
          </button>
        </div>
      )}
    </div>
  );
}
