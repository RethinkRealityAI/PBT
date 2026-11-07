/**
 * The scenario card as a trainee sees it in the Training library
 * (src/screens/ScenarioLibraryScreen.tsx).
 *
 * It only earns its place if it is what the trainee will read, so nothing
 * here is a lookalike:
 *  - the card itself is the trainee app's own `LibraryScenarioCardBody`
 *    (the provider-free inside of `LibraryScenarioCard`);
 *  - the title / objection line / pet line follow `libraryCardTitles` and
 *    `libraryCardPetLine` — the library's text rules;
 *  - "<persona> owner" and the difficulty's accessible name are the English
 *    catalogue strings (`src/i18n/en/library.ts`);
 *  - the fallbacks for a blank persona / difficulty are the ones the app
 *    plays (`draftToScenario`, parity-tested against the consumer's
 *    `adminOverrideToScenario`): Skeptical, level 2.
 *
 * The trainee app paints the card with the TRAINEE's own ECHO colour (the
 * `--pbt-driver-*` vars of their locked profile), so the preview uses the
 * app's default palette rather than this scenario's driver.
 *
 * `compact` is the gallery thumbnail: the card alone. The full preview (the
 * Publish step) also shows the focus area it is filed under — the library's
 * first step, then the heading above its cards.
 */
import type { CSSProperties } from 'react';
import { Glass } from '../primitives/Glass';
import { COLOR } from '../lib/tokens';
import { CategoryIcon } from '../../../src/design-system/CategoryIcon';
import { LibraryScenarioCardBody } from '../../../src/features/scenarios/LibraryScenarioCardBody';
import { libraryCardPetLine, libraryCardTitles } from '../../../src/features/scenarios/libraryCardText';
import { library as libraryCatalog } from '../../../src/i18n/en/library';
import { create as createCatalog } from '../../../src/i18n/en/create';
import { DIFFICULTY_LABELS, isPersona } from '../../../src/shared/scenarios/enums';
import { lifeStageLabel, speciesOf, type ScenarioSpecies } from '../../../src/shared/scenarios/species';
import {
  OTHER_CATEGORY_ICON,
  categoryIconFor,
  type CategoryIconKey,
} from '../../../src/shared/scenarios/categoryIcons';
import type { Difficulty } from '../../../src/data/scenarios';
import type { StudioDraft } from './studioModel';
import { objectionLabel, type ObjectionRef } from './objections/objectionsModel';
import { builtInAdminCategories, categoryOfObjection } from './objections/categoriesModel';
import { useObjectionsContext } from './objections/ObjectionsContext';

/** `{token}` substitution for the English catalogue strings. */
function fill(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (m, k: string) => vars[k] ?? m);
}

export interface LibraryCardPreview {
  title: string;
  /** The objection, shown above the title only when a custom title hides it. */
  objection: string | null;
  species: ScenarioSpecies;
  pet: string;
  owner: string;
  difficulty: Difficulty;
  difficultyLabel: string;
  difficultyAria: string;
  /** The focus area it is filed under in the library. */
  focusArea: { name: string; icon: CategoryIconKey };
}

/**
 * What the library card will say for this draft (English). Pass the
 * EFFECTIVE draft — for a library scenario, blank fields inherit the
 * built-in values, exactly as trainees get them (`withBaseFallback`).
 * `fallbackTitle` names a scenario with no pushback yet.
 */
export function libraryCardPreview(
  draft: StudioDraft,
  {
    fallbackTitle,
    objections = [],
    categories = builtInAdminCategories(),
  }: {
    fallbackTitle?: string | null;
    objections?: ReadonlyArray<ObjectionRef & { categoryId?: string | null }>;
    categories?: ReadonlyArray<{ id: string; name: string; icon?: string | null }>;
  } = {},
): LibraryCardPreview {
  const species = speciesOf(draft.species);
  const objectionTitle = draft.pushback_id
    ? objectionLabel(draft.pushback_id, objections)
    : fallbackTitle?.trim() || 'Untitled scenario';
  const { title, objection } = libraryCardTitles(draft.card_title_override, objectionTitle);
  const persona = isPersona(draft.persona_override) ? draft.persona_override : 'Skeptical';
  const d = draft.difficulty_override;
  const difficulty: Difficulty = d === 1 || d === 2 || d === 3 || d === 4 ? d : 2;
  const difficultyLabel = DIFFICULTY_LABELS[difficulty];
  const team = objections.map((o) => ({ id: o.id, categoryId: o.categoryId ?? '' }));
  const category = categoryOfObjection(draft.pushback_id, team, categories);
  return {
    title,
    objection,
    species,
    pet: libraryCardPetLine(
      draft.breed?.trim() || '—',
      lifeStageLabel(draft.life_stage, draft.species) || '—',
    ),
    owner: fill(libraryCatalog['library.card.persona'], { persona }),
    difficulty,
    difficultyLabel,
    difficultyAria: fill(libraryCatalog['library.card.difficultyAria'], {
      label: difficultyLabel,
      level: String(difficulty),
    }),
    focusArea: category
      ? { name: category.name, icon: categoryIconFor(category) }
      : { name: createCatalog['create.pushback.otherTitle'], icon: OTHER_CATEGORY_ICON },
  };
}

/**
 * The trainee app's light-theme variables the card body reads, scoped to the
 * preview (the admin defines none of them). Values: `src/design-system/tokens.css`
 * `:root` — the default palette a trainee sees before their ECHO profile
 * colours the app.
 */
const TRAINEE_VARS = {
  '--pbt-driver-primary': 'oklch(0.62 0.22 25)',
  '--pbt-driver-accent': 'oklch(0.52 0.24 22)',
  '--pbt-text': COLOR.ink,
  '--pbt-text-muted': COLOR.inkMute,
  '--pbt-font-mono': "'Geist Mono', ui-monospace, monospace",
  color: 'var(--pbt-text)',
} as CSSProperties;

export function CardPreview({
  draft,
  fallbackTitle,
  compact = false,
}: {
  draft: StudioDraft;
  fallbackTitle?: string | null;
  compact?: boolean;
}) {
  const { objections, categories } = useObjectionsContext();
  const card = libraryCardPreview(draft, { fallbackTitle, objections, categories });

  const body = (
    <Glass radius={18} padding={16} shine={false}>
      <LibraryScenarioCardBody
        title={card.title}
        objection={card.objection}
        species={card.species}
        pet={card.pet}
        owner={card.owner}
        difficulty={card.difficulty}
        difficultyLabel={card.difficultyLabel}
        difficultyAria={card.difficultyAria}
      />
    </Glass>
  );

  if (compact) return <div style={{ ...TRAINEE_VARS, overflowWrap: 'anywhere' }}>{body}</div>;

  return (
    <div
      role="group"
      aria-label="Preview of the card trainees will see"
      style={{
        ...TRAINEE_VARS,
        display: 'grid',
        gap: 12,
        padding: 14,
        borderRadius: 22,
        background:
          'radial-gradient(120% 90% at 0% 0%, color-mix(in oklab, var(--pbt-driver-primary) 10%, transparent), transparent 60%), rgba(60,20,15,0.035)',
        border: `1px solid ${COLOR.border}`,
        overflowWrap: 'anywhere',
      }}
    >
      {/* The focus area the card sits under (the library's first step, then
          the heading above its scenarios). */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
        <span
          aria-hidden
          style={{
            flexShrink: 0,
            width: 34,
            height: 34,
            borderRadius: 11,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff',
            background: 'linear-gradient(160deg, var(--pbt-driver-primary), var(--pbt-driver-accent))',
            boxShadow:
              'inset 0 1px 0 rgba(255,255,255,0.35), 0 8px 18px -10px color-mix(in oklab, var(--pbt-driver-primary) 70%, transparent)',
          }}
        >
          <CategoryIcon icon={card.focusArea.icon} size={17} strokeWidth={1.9} />
        </span>
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontFamily: 'var(--pbt-font-mono)',
              fontSize: 9.5,
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              color: 'var(--pbt-text-muted)',
              marginBottom: 2,
            }}
          >
            {libraryCatalog['library.eyebrow']} · focus area
          </div>
          <div style={{ fontSize: 15, fontWeight: 600, letterSpacing: '-0.015em', lineHeight: 1.2 }}>
            {card.focusArea.name}
          </div>
        </div>
      </div>
      {body}
    </div>
  );
}
