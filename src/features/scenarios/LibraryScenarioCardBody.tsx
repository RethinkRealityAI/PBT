/**
 * The inside of a Training library card: eyebrows, title, pet line, owner +
 * difficulty meter, and the arrow affordance. The arrow says "tap to start",
 * so only a host where the card IS a start button shows it: the admin's
 * preview passes `showArrow={false}`.
 *
 * Pure presentation — no hooks, no providers, no Tailwind classes — so the
 * admin bundle renders the SAME card in the Scenario Studio's preview
 * (`admin/src/scenario-studio/CardPreview.tsx`) instead of a lookalike. The
 * trainee app wraps it in `LibraryScenarioCard` (the tappable Glass button).
 *
 * Colours come from the trainee app's CSS variables (`--pbt-driver-primary`,
 * `--pbt-text`, `--pbt-text-muted`, `--pbt-font-mono`); a host without them
 * (the admin) defines them on a wrapping element.
 */
import { Icon } from '../../design-system/Icon';
import { SpeciesIcon } from '../../design-system/SpeciesIcon';
import { DifficultyMeter, DIFFICULTY_METER_FILL } from '../../design-system/DifficultyMeter';
import type { Difficulty } from '../../data/scenarios';
import type { ScenarioSpecies } from '../../shared/scenarios/species';

/**
 * The card's accent text/marks: the driver colour pulled toward the text
 * colour, so a light driver (Energizer yellow) stays legible on white glass
 * and a dark one stays legible on dark glass.
 */
export const LIBRARY_CARD_ACCENT = DIFFICULTY_METER_FILL;

export interface LibraryScenarioCardBodyProps {
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
  /** The round → start affordance. Default true (the trainee's tappable card). */
  showArrow?: boolean;
}

export function LibraryScenarioCardBody({
  title,
  category,
  objection,
  species,
  pet,
  owner,
  difficulty,
  difficultyLabel,
  difficultyAria,
  showArrow = true,
}: LibraryScenarioCardBodyProps) {
  return (
    <div style={{ display: 'flex', height: '100%', alignItems: 'center', gap: 12 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        {category && (
          <div
            style={{
              fontFamily: 'var(--pbt-font-mono)',
              fontSize: 10,
              fontWeight: 600,
              letterSpacing: '0.16em',
              textTransform: 'uppercase',
              color: LIBRARY_CARD_ACCENT,
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
              color: LIBRARY_CARD_ACCENT,
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
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 13,
            color: 'var(--pbt-text-muted)',
            marginBottom: 10,
          }}
        >
          <span aria-hidden style={{ display: 'inline-flex', flexShrink: 0 }}>
            <SpeciesIcon species={species} size={14} />
          </span>
          <span style={{ minWidth: 0 }}>{pet}</span>
        </div>
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            columnGap: 14,
            rowGap: 6,
            fontSize: 12.5,
            color: 'var(--pbt-text-muted)',
          }}
        >
          <span>{owner}</span>
          <DifficultyMeter level={difficulty} label={difficultyLabel} ariaLabel={difficultyAria} />
        </div>
      </div>
      {showArrow && (
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
          color: LIBRARY_CARD_ACCENT,
          background: 'color-mix(in oklab, var(--pbt-driver-primary) 16%, transparent)',
          border: '1px solid color-mix(in oklab, var(--pbt-driver-primary) 30%, transparent)',
        }}
      >
        <Icon.arrow />
      </span>
      )}
    </div>
  );
}
