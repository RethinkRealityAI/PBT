/**
 * One ready-made scenario on the Training library — and its filter chips.
 *
 * The WHOLE card starts it: one large target and one affordance (the arrow),
 * instead of a gold Start button beside a gold difficulty badge that looked
 * like a second button. Difficulty is a 4-step meter (the level at a glance)
 * with its word, and the persona says "owner" — "Skeptical" is both a persona
 * and a difficulty level.
 */
import { motion } from 'motion/react';
import { Glass } from '../../design-system/Glass';
import { Chip } from '../../design-system/Chip';
import { LibraryScenarioCardBody, type LibraryScenarioCardBodyProps } from './LibraryScenarioCardBody';

/**
 * The tappable card: a Glass button around `LibraryScenarioCardBody` — the
 * provider-free inside the admin's Studio preview renders too, so the two
 * cannot drift. The text rules (title vs objection, pet line) are
 * `libraryCardTitles` / `libraryCardPetLine` in `./libraryCardText`.
 */
export function LibraryScenarioCard({
  startAria,
  onStart,
  ...body
}: LibraryScenarioCardBodyProps & {
  startAria: string;
  onStart: () => void;
}) {
  return (
    <motion.button
      type="button"
      onClick={onStart}
      aria-label={startAria}
      whileTap={{ scale: 0.985 }}
      className="pbt-library-card"
      style={{
        display: 'block',
        width: '100%',
        // Fills its grid cell, so cards side by side (desktop) match heights.
        height: '100%',
        padding: 0,
        border: 'none',
        background: 'none',
        textAlign: 'left',
        color: 'inherit',
        font: 'inherit',
        cursor: 'pointer',
        borderRadius: 18,
      }}
    >
      <Glass radius={18} padding={16} style={{ height: '100%' }}>
        <LibraryScenarioCardBody {...body} />
      </Glass>
    </motion.button>
  );
}

/**
 * A filter chip: the label, plus how many scenarios it leaves. The count is
 * decoration (the list itself is the answer), so assistive tech hears just
 * the label. Sentence case: an objection is a phrase, unreadable in mono
 * capitals. A very long one is cut with an ellipsis (its title tooltip and
 * accessible name stay whole); the row scrolls sideways (`ChipScroller`).
 */
export function FilterChip({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <Chip
      active={active}
      onClick={onClick}
      tone="text"
      className="shrink-0"
      title={label}
      aria-label={label}
      style={{ display: 'inline-flex', alignItems: 'center', maxWidth: 280 }}
    >
      <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span>
      <span aria-hidden style={{ marginLeft: 7, opacity: active ? 0.85 : 0.55, fontWeight: 500, flexShrink: 0 }}>
        {count}
      </span>
    </Chip>
  );
}
