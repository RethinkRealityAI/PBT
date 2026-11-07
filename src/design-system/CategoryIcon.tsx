/**
 * Category icons — the drawings for the ONE vocabulary in
 * `src/shared/scenarios/categoryIcons.ts` (the trainee's Training library
 * cards, and the admin Studio's category editor + cards, which import it from
 * here like `SpeciesIcon`).
 *
 * Line icons from lucide-react, drawn in `currentColor` (white line icons on
 * a badge; never emoji). Decorative by default — the category's name sits
 * next to it; pass `title` when the icon stands alone.
 */
import {
  Bean,
  Bone,
  Clock,
  Coins,
  Droplet,
  Heart,
  MessageCircle,
  Pill,
  Scale,
  Shield,
  Soup,
  Sparkles,
  Sprout,
  Stethoscope,
  Tag,
  Users,
  type LucideIcon,
} from 'lucide-react';
import type { CSSProperties } from 'react';
import {
  DEFAULT_CATEGORY_ICON,
  isCategoryIconKey,
  type CategoryIconKey,
} from '../shared/scenarios/categoryIcons';

export const CATEGORY_ICON_GLYPHS: Readonly<Record<CategoryIconKey, LucideIcon>> = {
  bowl: Soup,
  scale: Scale,
  pill: Pill,
  stethoscope: Stethoscope,
  droplet: Droplet,
  kidney: Bean,
  sprout: Sprout,
  heart: Heart,
  bone: Bone,
  sparkles: Sparkles,
  shield: Shield,
  clock: Clock,
  coins: Coins,
  users: Users,
  message: MessageCircle,
  tag: Tag,
};

export function CategoryIcon({
  icon,
  size = 18,
  strokeWidth = 2,
  title,
  style,
}: {
  /** A vocabulary key; anything else draws the default tag. */
  icon: CategoryIconKey | string | null | undefined;
  size?: number;
  strokeWidth?: number;
  /** Accessible name when the icon is the only thing naming the category. */
  title?: string;
  style?: CSSProperties;
}) {
  const Glyph = CATEGORY_ICON_GLYPHS[isCategoryIconKey(icon) ? icon : DEFAULT_CATEGORY_ICON];
  return (
    <Glyph
      size={size}
      strokeWidth={strokeWidth}
      aria-hidden={title ? undefined : true}
      aria-label={title}
      role={title ? 'img' : undefined}
      focusable={false}
      data-category-icon={isCategoryIconKey(icon) ? icon : DEFAULT_CATEGORY_ICON}
      style={{ flexShrink: 0, ...style }}
    />
  );
}
