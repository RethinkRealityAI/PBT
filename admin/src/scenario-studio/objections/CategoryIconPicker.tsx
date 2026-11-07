/**
 * The category editor's icon picker — the picture trainees see on this
 * category's Training library card.
 *
 * One fixed vocabulary (`CATEGORY_ICON_KEYS`, src/shared/scenarios/
 * categoryIcons.ts) — never a free upload or emoji. "Automatic" (null) draws
 * what the category's name suggests (`guessCategoryIcon`), shown live so the
 * admin sees what trainees will get. A radio group: one Tab stop, arrow keys
 * move and choose (Home / End jump), like a native radio set.
 */
import { useRef, type KeyboardEvent } from 'react';
import { Wand2 } from 'lucide-react';
import { COLOR } from '../../lib/tokens';
import { CategoryIcon } from '../../../../src/design-system/CategoryIcon';
import {
  CATEGORY_ICON_KEYS,
  CATEGORY_ICON_LABELS,
  guessCategoryIcon,
  type CategoryIconKey,
} from '../../../../src/shared/scenarios/categoryIcons';

type Choice = CategoryIconKey | null;

const OPTIONS: Choice[] = [null, ...CATEGORY_ICON_KEYS];

export function CategoryIconPicker({
  value,
  onChange,
  disabled,
  name,
  nameFr,
  description,
  labelledBy,
}: {
  value: Choice;
  onChange: (next: Choice) => void;
  disabled?: boolean;
  /** The category's words, for the "Automatic" preview. */
  name: string;
  nameFr: string;
  description: string;
  labelledBy: string;
}) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const guess = guessCategoryIcon({ name, nameFr, description });
  const selectedIndex = Math.max(0, OPTIONS.indexOf(value));

  function move(e: KeyboardEvent<HTMLButtonElement>, index: number) {
    let next = index;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (index + 1) % OPTIONS.length;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = (index - 1 + OPTIONS.length) % OPTIONS.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = OPTIONS.length - 1;
    else return;
    e.preventDefault();
    onChange(OPTIONS[next]);
    refs.current[next]?.focus();
  }

  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <div
        role="radiogroup"
        aria-labelledby={labelledBy}
        aria-disabled={disabled || undefined}
        style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}
      >
        {OPTIONS.map((option, i) => {
          const selected = option === value;
          const label =
            option === null
              ? `Automatic — ${CATEGORY_ICON_LABELS[guess].toLowerCase()}, from the name`
              : CATEGORY_ICON_LABELS[option];
          return (
            <button
              key={option ?? 'auto'}
              ref={(el) => {
                refs.current[i] = el;
              }}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={label}
              title={label}
              disabled={disabled}
              tabIndex={i === selectedIndex ? 0 : -1}
              onClick={() => onChange(option)}
              onKeyDown={(e) => move(e, i)}
              className="pbt-studio-field"
              style={{
                position: 'relative',
                width: 44,
                height: 44,
                borderRadius: 12,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: disabled ? 'default' : 'pointer',
                color: selected ? '#fff' : COLOR.ink,
                background: selected ? COLOR.brand : 'rgba(255,255,255,0.9)',
                border: `1px solid ${selected ? COLOR.brand : COLOR.border}`,
                boxShadow: selected ? '0 6px 14px -8px oklch(0.55 0.24 22 / 0.7)' : 'none',
                opacity: disabled && !selected ? 0.55 : 1,
              }}
            >
              {option === null ? (
                <>
                  <CategoryIcon icon={guess} size={18} />
                  <Wand2
                    aria-hidden
                    size={11}
                    style={{ position: 'absolute', right: 4, bottom: 4, opacity: 0.85 }}
                  />
                </>
              ) : (
                <CategoryIcon icon={option} size={18} />
              )}
            </button>
          );
        })}
      </div>
      <div style={{ fontSize: 12, color: COLOR.inkSoft, lineHeight: 1.5 }}>
        {value === null
          ? `Automatic: ${CATEGORY_ICON_LABELS[guess]} — picked from the name. Choose one to fix it.`
          : `${CATEGORY_ICON_LABELS[value]}.`}
      </div>
    </div>
  );
}
