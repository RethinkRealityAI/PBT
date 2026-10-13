import type { CSSProperties } from 'react';

/**
 * The difficulty of a scenario at a glance: four small rising bars, the first
 * `level` of them filled, with the level's word beside it ("Combative").
 *
 * The SAME mark everywhere difficulty is shown — the trainee's ready-made
 * library cards, beside a score in History and on the scorecard, and in the
 * admin's session views — so a 75 against a level-4 owner reads as the
 * achievement it is. Scoring is deliberately identical at every level; this
 * is context next to a score, never part of it.
 *
 * Pure presentation (no hooks, no providers): the caller passes the
 * localised word and accessible name, which is also what lets the admin
 * bundle import it the way it imports `SpeciesIcon`. The whole meter is ONE
 * image to assistive tech (`role="img"` + `ariaLabel`); the bars and the word
 * are hidden from it so the level is announced once.
 *
 * Colours: filled bars default to the driver colour pulled toward the text
 * colour (legible for a light driver on white glass and a dark one on dark
 * glass); unfilled bars are a faint text tint. The admin, which has no driver
 * vars, passes its own `color` / `trackColor`.
 */

/** Driver accent, toned toward the text colour so it stays legible. */
export const DIFFICULTY_METER_FILL =
  'color-mix(in oklab, var(--pbt-driver-primary) 72%, var(--pbt-text))';
/** Unfilled steps. */
export const DIFFICULTY_METER_TRACK = 'color-mix(in oklab, var(--pbt-text) 18%, transparent)';

const STEPS = [1, 2, 3, 4] as const;

/** Bar geometry per size. `sm` is the library card's meter (7/9/11/13 px). */
const SIZES = {
  sm: { width: 4, base: 5, rise: 2, gap: 2, radius: 2, labelGap: 6 },
  md: { width: 5, base: 6, rise: 3, gap: 3, radius: 2.5, labelGap: 8 },
} as const;

export type DifficultyMeterSize = keyof typeof SIZES;

export interface DifficultyMeterProps {
  /** 1–4. Out-of-range values clamp (0 = no bars filled). */
  level: number;
  /** The level's visible word ("Combative"); omit for bars only. */
  label?: string;
  /** Accessible name for the whole meter, e.g. "Difficulty: Combative, level 4 of 4". */
  ariaLabel: string;
  size?: DifficultyMeterSize;
  /** Filled-bar colour. Defaults to `DIFFICULTY_METER_FILL`. */
  color?: string;
  /** Unfilled-bar colour. Defaults to `DIFFICULTY_METER_TRACK`. */
  trackColor?: string;
  className?: string;
  /** Styles for the wrapper — the word inherits font + colour from here. */
  style?: CSSProperties;
}

export function DifficultyMeter({
  level,
  label,
  ariaLabel,
  size = 'sm',
  color = DIFFICULTY_METER_FILL,
  trackColor = DIFFICULTY_METER_TRACK,
  className,
  style,
}: DifficultyMeterProps) {
  const geo = SIZES[size];
  const filled = Number.isFinite(level) ? Math.max(0, Math.min(STEPS.length, Math.round(level))) : 0;
  return (
    <span
      role="img"
      aria-label={ariaLabel}
      className={className}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: geo.labelGap,
        whiteSpace: 'nowrap',
        ...style,
      }}
    >
      <span aria-hidden style={{ display: 'inline-flex', alignItems: 'flex-end', gap: geo.gap }}>
        {STEPS.map((step) => (
          <span
            key={step}
            data-difficulty-step={step}
            data-filled={step <= filled ? 'true' : 'false'}
            style={{
              display: 'block',
              width: geo.width,
              height: geo.base + step * geo.rise,
              borderRadius: geo.radius,
              background: step <= filled ? color : trackColor,
            }}
          />
        ))}
      </span>
      {label && <span aria-hidden>{label}</span>}
    </span>
  );
}
