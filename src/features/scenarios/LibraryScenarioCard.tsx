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
import { Icon } from '../../design-system/Icon';
import { Chip } from '../../design-system/Chip';
import { SpeciesIcon } from '../../design-system/SpeciesIcon';
import { DifficultyMeter, DIFFICULTY_METER_FILL } from '../../design-system/DifficultyMeter';
import type { Difficulty } from '../../data/scenarios';
import type { ScenarioSpecies } from '../../shared/scenarios/species';

/**
 * The card's accent text/marks: the driver colour pulled toward the text
 * colour, so a light driver (Energizer yellow) stays legible on white glass
 * and a dark one stays legible on dark glass.
 */
const CARD_ACCENT = DIFFICULTY_METER_FILL;

export function LibraryScenarioCard({
  title,
  category,
  objection,
  species,
  pet,
  owner,
  difficulty,
  difficultyLabel,
  difficultyAria,
  startAria,
  onStart,
}: {
  title: string;
  /** The focus area, as a mono eyebrow (left out inside that area). */
  category?: string | null;
  /**
   * The objection, when a custom card title hides which one this is — in
   * sentence case: it is a phrase, unreadable in mono capitals.
   */
  objection?: string | null;
  species: ScenarioSpecies;
  pet: string;
  owner: string;
  difficulty: Difficulty;
  difficultyLabel: string;
  difficultyAria: string;
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
        <div className="flex h-full items-center gap-3">
          <div style={{ flex: 1, minWidth: 0 }}>
            {category && (
              <div
                style={{
                  fontFamily: 'var(--pbt-font-mono)',
                  fontSize: 10,
                  fontWeight: 600,
                  letterSpacing: '0.16em',
                  textTransform: 'uppercase',
                  color: CARD_ACCENT,
                  marginBottom: 6,
                  lineHeight: 1.4,
                }}
              >
                {category}
              </div>
            )}
            {objection && (
              <div
                style={{
                  fontSize: 12.5,
                  fontWeight: 600,
                  lineHeight: 1.35,
                  color: CARD_ACCENT,
                  marginBottom: 4,
                }}
              >
                {objection}
              </div>
            )}
            <div
              style={{
                fontWeight: 700,
                fontSize: 16,
                lineHeight: 1.3,
                letterSpacing: '-0.01em',
                marginBottom: 6,
              }}
            >
              {title}
            </div>
            <div
              className="flex items-center gap-1.5"
              style={{ fontSize: 13, color: 'var(--pbt-text-muted)', marginBottom: 10 }}
            >
              <span aria-hidden style={{ display: 'inline-flex', flexShrink: 0 }}>
                <SpeciesIcon species={species} size={14} />
              </span>
              <span style={{ minWidth: 0 }}>{pet}</span>
            </div>
            <div
              className="flex flex-wrap items-center"
              style={{ columnGap: 14, rowGap: 6, fontSize: 12.5, color: 'var(--pbt-text-muted)' }}
            >
              <span>{owner}</span>
              <DifficultyMeter level={difficulty} label={difficultyLabel} ariaLabel={difficultyAria} />
            </div>
          </div>
          <span
            aria-hidden
            style={{
              flexShrink: 0,
              width: 40,
              height: 40,
              borderRadius: 9999,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: CARD_ACCENT,
              background: 'color-mix(in oklab, var(--pbt-driver-primary) 16%, transparent)',
              border: '1px solid color-mix(in oklab, var(--pbt-driver-primary) 30%, transparent)',
            }}
          >
            <Icon.arrow />
          </span>
        </div>
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
