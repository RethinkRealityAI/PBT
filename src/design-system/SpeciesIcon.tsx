/**
 * Dog / cat icons — the ONE pet artwork for the trainee app and the admin
 * Studio (which imports it from here), replacing the emoji glyphs that
 * rendered differently on every platform.
 *
 * Line icons from lucide-react (ISC, already a dependency), drawn in
 * `currentColor`, so the caller decides the colour: white on a coloured
 * badge (`SpeciesBadge`), or inheriting the text colour inside a segmented
 * control. Decorative by default (`aria-hidden`) — the visible label next to
 * the icon says "Dog" / "Cat"; pass `title` when the icon stands alone.
 */
import { Cat, Dog } from 'lucide-react';
import type { CSSProperties } from 'react';

export type SpeciesKey = 'dog' | 'cat';

export function SpeciesIcon({
  species,
  size = 16,
  strokeWidth = 2,
  title,
  style,
}: {
  species: SpeciesKey;
  size?: number;
  strokeWidth?: number;
  /** Accessible name when the icon is the only thing saying which animal. */
  title?: string;
  style?: CSSProperties;
}) {
  const Glyph = species === 'cat' ? Cat : Dog;
  return (
    <Glyph
      size={size}
      strokeWidth={strokeWidth}
      aria-hidden={title ? undefined : true}
      aria-label={title}
      role={title ? 'img' : undefined}
      focusable={false}
      style={{ flexShrink: 0, ...style }}
    />
  );
}

/**
 * A white pet icon on a filled circle — the "species chip" used on cards and
 * tiles. `background` takes any CSS colour or gradient (the admin passes its
 * brand colour, the trainee app its driver gradient).
 */
export function SpeciesBadge({
  species,
  size = 24,
  background,
  title,
  style,
}: {
  species: SpeciesKey;
  /** Outer diameter in px; the icon is ~58% of it. */
  size?: number;
  background: string;
  title?: string;
  style?: CSSProperties;
}) {
  return (
    <span
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: size,
        height: size,
        borderRadius: 999,
        background,
        color: '#fff',
        flexShrink: 0,
        ...style,
      }}
    >
      <SpeciesIcon species={species} size={Math.round(size * 0.58)} strokeWidth={size >= 32 ? 1.9 : 2.1} />
    </span>
  );
}
