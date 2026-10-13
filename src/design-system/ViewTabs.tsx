import { useRef, type KeyboardEvent } from 'react';

export interface ViewTabOption<V extends string> {
  value: V;
  label: string;
}

export interface ViewTabsProps<V extends string> {
  options: ViewTabOption<V>[];
  value: V;
  onChange: (value: V) => void;
  ariaLabel: string;
}

/**
 * Full-width underline tabs that switch between two VIEWS of one screen.
 *
 * Deliberately not a pill: a screen that stacks a view switch, a choice
 * (`Segmented`) and filters (`Chip`) reads as one undifferentiated row of
 * buttons when all three are gold pills. Underline tabs say "these are
 * places", pills say "pick one", chips say "narrow the list".
 *
 * Keyboard: roving tab stop; ←/→ move and select, Home/End jump.
 */
export function ViewTabs<V extends string>({ options, value, onChange, ariaLabel }: ViewTabsProps<V>) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  const move = (index: number) => {
    const next = (index + options.length) % options.length;
    onChange(options[next].value);
    refs.current[next]?.focus();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (e.key === 'ArrowRight') move(index + 1);
    else if (e.key === 'ArrowLeft') move(index - 1);
    else if (e.key === 'Home') move(0);
    else if (e.key === 'End') move(options.length - 1);
    else return;
    e.preventDefault();
  };

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      style={{
        display: 'flex',
        width: '100%',
        borderBottom: '1px solid color-mix(in oklab, var(--pbt-text) 12%, transparent)',
      }}
    >
      {options.map((opt, i) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="tab"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(opt.value)}
            onKeyDown={(e) => onKeyDown(e, i)}
            className="pbt-view-tab"
            style={{
              flex: 1,
              minHeight: 44,
              padding: '10px 8px',
              marginBottom: -1,
              border: 'none',
              borderBottom: `2px solid ${active ? 'var(--pbt-driver-primary)' : 'transparent'}`,
              background: 'transparent',
              color: active ? 'var(--pbt-text)' : 'var(--pbt-text-muted)',
              fontSize: 15,
              fontWeight: active ? 700 : 500,
              letterSpacing: '-0.01em',
              cursor: 'pointer',
              transition: 'color 0.2s, border-color 0.2s',
            }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
