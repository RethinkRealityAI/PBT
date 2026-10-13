/**
 * The trainee app's difficulty meter (four rising bars + the level's word),
 * in admin colours — the admin has no driver CSS vars, so it passes its
 * brand colour. Same component as the trainee library card, so a level reads
 * identically on both sides. Renders nothing for a session with no level;
 * callers that need a placeholder (a table cell) supply their own.
 */
import type { CSSProperties } from 'react';
import { DifficultyMeter, type DifficultyMeterSize } from '../../../src/design-system/DifficultyMeter';
import type { DifficultyLevel } from '../../../src/shared/scenarios/difficulty';
import { COLOR } from '../lib/tokens';
import { difficultyAria, difficultyLabel } from '../lib/difficulty';

export function AdminDifficultyMeter({
  level,
  showLabel = true,
  size = 'sm',
  style,
}: {
  level: DifficultyLevel | null;
  showLabel?: boolean;
  size?: DifficultyMeterSize;
  style?: CSSProperties;
}) {
  if (level == null) return null;
  return (
    <DifficultyMeter
      level={level}
      label={showLabel ? difficultyLabel(level) : undefined}
      ariaLabel={difficultyAria(level)}
      size={size}
      color={COLOR.brand}
      trackColor="rgba(60,20,15,0.14)"
      style={{ fontSize: 12, fontWeight: 600, color: COLOR.inkSoft, ...style }}
    />
  );
}
