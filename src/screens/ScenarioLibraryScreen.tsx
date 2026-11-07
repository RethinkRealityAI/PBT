/**
 * The Training library (2026-11-07) — Home → "Select scenario" → "Choose from
 * the library". The ready-made scenarios the training team published, in two
 * quick steps:
 *
 *   1. FOCUS AREAS — big category cards (icon, name, "n scenarios"), plus
 *      "All scenarios". Only areas holding a scenario for the animal shown.
 *      With a single area there is nothing to choose and step 2 opens
 *      straight away.
 *   2. SCENARIOS in that area — the whole card starts one; objection chips
 *      narrow an area holding more than one objection.
 *
 * Dog | Cat sits under the step 1 heading ONLY when the resolved library
 * holds scenarios for both animals (cats are already dropped from it while
 * `scenario.cat.enabled` is off) — the same rule Home's old Today's pick
 * used, so a stored preference never empties the list. Inside an area the
 * animal is fixed: a badge says which, and a change made elsewhere (another
 * tab) returns to step 1.
 *
 * Back (the TopBar's, the browser's / Android's) returns from step 2 to the
 * focus areas before it leaves the screen (`useBrowserBackStep`).
 *
 * Data: `useResolvedLibraryScenarios` + `useObjectionCatalog` — no fetches.
 * Grouping rules: `features/scenarios/libraryGrouping.ts` (pure, tested).
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { LayoutGrid } from 'lucide-react';
import { Glass } from '../design-system/Glass';
import { Icon } from '../design-system/Icon';
import { PillButton } from '../design-system/PillButton';
import { Segmented, type SegmentedOption } from '../design-system/Segmented';
import { SpeciesBadge, SpeciesIcon } from '../design-system/SpeciesIcon';
import { ChipScroller } from '../design-system/ChipScroller';
import { CategoryIcon } from '../design-system/CategoryIcon';
import { TopBar } from '../shell/TopBar';
import { Page } from '../shell/Page';
import { useNavigation } from '../app/providers/NavigationProvider';
import { useScenario } from '../app/providers/ScenarioProvider';
import { useLanguage } from '../app/providers/LanguageProvider';
import { useTheme } from '../app/providers/ThemeProvider';
import { useScreenEnabled } from '../app/screenFlags';
import { useResolvedLibraryScenarios, type ResolvedScenario } from '../data/useResolvedScenarios';
import { useTrainingSpecies } from '../features/scenarios/useTrainingSpecies';
import { useObjectionCatalog } from '../features/scenarios/useObjectionCatalog';
import { FilterChip, LibraryScenarioCard } from '../features/scenarios/LibraryScenarioCard';
import {
  libraryForAnimal,
  libraryGroupOf,
  libraryGroups,
  libraryHasBothAnimals,
  libraryObjectionFilters,
  scenariosInGroup,
  type LibraryGroup,
} from '../features/scenarios/libraryGrouping';
import { objectionCategoryId } from '../shared/scenarios/objectionCategories';
import { speciesOf, type ScenarioSpecies } from '../shared/scenarios/species';
import type { CategoryIconKey } from '../shared/scenarios/categoryIcons';
import { logEvent } from '../lib/analytics';
import { useBrowserBackStep } from '../lib/useBrowserBackStep';
import { useT } from '../i18n/useT';
import { localizedScenario, localizedLifeStage, localizedPersona } from '../i18n/dataL10n/scenarios';
import { localizedDifficultyLabel } from '../i18n/dataL10n/pushbacks';

/** Step 2 showing every scenario (the "All scenarios" card, or a one-area library). */
const ALL = '__all';

export function ScenarioLibraryScreen() {
  const { go, back } = useNavigation();
  const { setScenario } = useScenario();
  const t = useT();
  const { locale } = useLanguage();
  const screenEnabled = useScreenEnabled();
  const canBuild = screenEnabled('create');
  const resolved = useResolvedLibraryScenarios();
  const [species, setSpecies] = useTrainingSpecies();
  const { objections, teamObjections, categories, categoryById } = useObjectionCatalog();

  /** null = step 1 (focus areas); a group id or ALL = step 2. */
  const [groupId, setGroupId] = useState<string | null>(null);
  const [objectionFilter, setObjectionFilter] = useState<string>('all');

  const showAnimalToggle = libraryHasBothAnimals(resolved);
  const forAnimal = useMemo(() => libraryForAnimal(resolved, species), [resolved, species]);
  const otherLabel = t('create.pushback.otherTitle');
  const groups = useMemo(
    () => libraryGroups(forAnimal, teamObjections, categories, otherLabel),
    [forAnimal, teamObjections, categories, otherLabel],
  );
  // One focus area (or none): no choice to make, the list is the screen.
  const singleGroup = groups.length <= 1;
  const activeGroup: string | null = singleGroup
    ? ALL
    : groupId === ALL || groups.some((g) => g.id === groupId)
      ? groupId
      : null;
  const step: 'groups' | 'scenarios' = activeGroup ? 'scenarios' : 'groups';

  const inGroup =
    activeGroup === ALL || activeGroup == null
      ? forAnimal
      : scenariosInGroup(forAnimal, activeGroup, teamObjections, categories);
  // Objection chips narrow ONE focus area that holds several objections.
  const objectionChips =
    activeGroup && (activeGroup !== ALL || singleGroup)
      ? libraryObjectionFilters(inGroup, objections, locale)
      : [];
  const showObjectionChips = objectionChips.length > 1;
  const activeObjection =
    showObjectionChips && objectionChips.some((o) => o.id === objectionFilter) ? objectionFilter : 'all';
  const visible =
    activeObjection === 'all' ? inGroup : inGroup.filter((r) => r.scenario.pushback.id === activeObjection);

  // The animal is chosen on step 1. If it changes while an area is open
  // (another tab, another surface), go back there: the area may not exist
  // for the other animal.
  const seenSpecies = useRef(species);
  useEffect(() => {
    if (seenSpecies.current === species) return;
    seenSpecies.current = species;
    setGroupId(null);
    setObjectionFilter('all');
  }, [species]);

  const leaveGroup = () => {
    setGroupId(null);
    setObjectionFilter('all');
  };
  // The step only exists when there was a step 1 to come back to.
  useBrowserBackStep(step === 'scenarios' && !singleGroup, leaveGroup);

  const openGroup = (group: LibraryGroup | null) => {
    logEvent({
      type: 'card_click',
      screen: 'scenarioLibrary',
      target: 'library_category',
      meta: { category: group ? group.id : 'all', species: speciesOf(species), count: group?.count ?? forAnimal.length },
    });
    setObjectionFilter('all');
    setGroupId(group ? group.id : ALL);
  };

  const changeSpecies = (next: ScenarioSpecies) => {
    if (next === species) return;
    setObjectionFilter('all');
    setSpecies(next);
  };

  const start = (item: ResolvedScenario) => {
    const { scenario } = item;
    logEvent({
      type: 'card_click',
      screen: 'scenarioLibrary',
      target: 'library_scenario',
      meta: {
        pushback: scenario.pushback.id,
        breed: scenario.breed,
        species: speciesOf(scenario.species),
        scenarioId: item.scenarioId,
        category: libraryGroupOf(item, teamObjections, categories),
      },
    });
    setScenario(scenario);
    go('chat');
  };

  const onTopBack = () => {
    if (step === 'scenarios' && !singleGroup) leaveGroup();
    else back();
  };

  // The area step 2 is showing (a one-area library shows that area).
  const current = singleGroup
    ? (groups[0] ?? null)
    : activeGroup && activeGroup !== ALL
      ? (groups.find((g) => g.id === activeGroup) ?? null)
      : null;
  const animalOptions: SegmentedOption<ScenarioSpecies>[] = [
    { value: 'dog', label: t('create.animal.dog'), icon: <SpeciesIcon species="dog" size={16} /> },
    { value: 'cat', label: t('create.animal.cat'), icon: <SpeciesIcon species="cat" size={16} /> },
  ];
  const countText = (n: number) => (n === 1 ? t('library.countOne') : t('library.count', { count: n }));

  // The page leads with its title; the animal pill sits under it.
  const animalToggle = showAnimalToggle ? (
    <div style={{ marginBottom: 18 }} className="lg:max-w-[360px]">
      <Segmented
        options={animalOptions}
        value={species}
        onChange={changeSpecies}
        ariaLabel={t('library.animalAria')}
        size="lg"
        fullWidth
      />
    </div>
  ) : null;

  return (
    <>
      <TopBar showBack onBack={onTopBack} title={t('library.title')} />
      <Page withTabBar>
        {forAnimal.length === 0 ? (
          <EmptyLibrary
            species={showAnimalToggle ? species : null}
            canBuild={canBuild}
            onBuild={() => go('create')}
          />
        ) : step === 'groups' ? (
          <section aria-labelledby="pbt-library-heading">
            <StepHeading
              id="pbt-library-heading"
              eyebrow={t('library.eyebrow')}
              title={t('library.heading')}
              sub={t('library.sub')}
            />
            {animalToggle}
            <div
              role="list"
              aria-label={t('library.groupsAria')}
              className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4"
            >
              <div role="listitem" className="col-span-2 sm:col-span-3 lg:col-span-4">
                <GroupCard
                  wide
                  title={t('library.all.title')}
                  count={countText(forAnimal.length)}
                  glyph={<LayoutGrid size={22} strokeWidth={1.9} aria-hidden />}
                  onClick={() => openGroup(null)}
                  index={0}
                />
              </div>
              {groups.map((g, i) => (
                <div role="listitem" key={g.id}>
                  <GroupCard
                    title={g.label}
                    count={countText(g.count)}
                    icon={g.icon}
                    onClick={() => openGroup(g)}
                    index={i + 1}
                  />
                </div>
              ))}
            </div>
          </section>
        ) : (
          <section aria-labelledby="pbt-library-heading">
            {!singleGroup && (
              <button
                type="button"
                onClick={leaveGroup}
                className="pbt-library-card hidden lg:inline-flex"
                style={{
                  alignItems: 'center',
                  gap: 6,
                  marginBottom: 14,
                  padding: '6px 12px 6px 8px',
                  borderRadius: 9999,
                  border: '1px solid var(--pbt-glass-border)',
                  background: 'color-mix(in oklab, var(--pbt-text) 4%, transparent)',
                  color: 'var(--pbt-text)',
                  font: 'inherit',
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                <Icon.back aria-hidden style={{ width: 16, height: 16 }} />
                {t('library.back')}
              </button>
            )}
            <StepHeading
              id="pbt-library-heading"
              eyebrow={t('library.eyebrow')}
              title={current ? current.label : t('library.all.title')}
              sub={countText(inGroup.length)}
              badge={
                showAnimalToggle && !singleGroup ? (
                  <SpeciesBadge
                    species={species}
                    size={26}
                    background="linear-gradient(160deg, var(--pbt-driver-primary), var(--pbt-driver-accent))"
                    title={t(species === 'cat' ? 'create.animal.cat' : 'create.animal.dog')}
                  />
                ) : undefined
              }
              icon={current ? current.icon : 'all'}
            />
            {/* Inside an area the animal is fixed (chosen on step 1) — a badge
                says which; a one-area library has no step 1, so its pill stays. */}
            {singleGroup && animalToggle}
            {showObjectionChips && (
              <ChipScroller ariaLabel={t('library.filterAria')} className="mb-3">
                <FilterChip
                  label={t('library.filterAll')}
                  count={inGroup.length}
                  active={activeObjection === 'all'}
                  onClick={() => setObjectionFilter('all')}
                />
                {objectionChips.map((f) => (
                  <FilterChip
                    key={f.id}
                    label={f.label}
                    count={inGroup.filter((r) => r.scenario.pushback.id === f.id).length}
                    active={activeObjection === f.id}
                    onClick={() => setObjectionFilter(f.id)}
                  />
                ))}
              </ChipScroller>
            )}
            <div
              aria-label={t('library.scenariosAria')}
              role="list"
              className="flex flex-col gap-3 lg:grid lg:grid-cols-2 lg:gap-4"
            >
              {visible.map((item) => {
                const { scenario, override } = item;
                const objectionTitle = localizedScenario(scenario, locale).pushback.title;
                const cardTitle = override?.card_title_override?.trim() || objectionTitle;
                // Inside one focus area its name would only repeat the
                // heading; under "All scenarios" it says where each one lives.
                const categoryLabel =
                  activeGroup === ALL && !singleGroup
                    ? (categoryById(objectionCategoryId(scenario.pushback.id, teamObjections))?.label ?? null)
                    : null;
                // The objection, when a custom card title hides which one it is.
                const eyebrowObjection = cardTitle !== objectionTitle ? objectionTitle : null;
                const difficultyLabel = localizedDifficultyLabel(scenario.difficulty, locale);
                return (
                  <div role="listitem" key={item.scenarioId}>
                    <LibraryScenarioCard
                      title={cardTitle}
                      category={categoryLabel}
                      objection={eyebrowObjection}
                      species={speciesOf(scenario.species)}
                      pet={`${scenario.breed} · ${localizedLifeStage(scenario.age, locale, scenario.species)}`}
                      owner={t('library.card.persona', { persona: localizedPersona(scenario.persona, locale) })}
                      difficulty={scenario.difficulty}
                      difficultyLabel={difficultyLabel}
                      difficultyAria={t('library.card.difficultyAria', {
                        label: difficultyLabel,
                        level: String(scenario.difficulty),
                      })}
                      startAria={t('library.card.startAria', { title: cardTitle })}
                      onStart={() => start(item)}
                    />
                  </div>
                );
              })}
            </div>
          </section>
        )}
        <div style={{ height: 32 }} />
      </Page>
    </>
  );
}

function StepHeading({
  id,
  eyebrow,
  title,
  sub,
  icon,
  badge,
}: {
  id: string;
  eyebrow: string;
  title: string;
  sub: string;
  /** Beside the title — the animal on step 2 when the library holds both. */
  badge?: ReactNode;
  /** A focus area's icon beside its name on step 2 ('all' = the grid glyph). */
  icon?: CategoryIconKey | 'all';
}) {
  return (
    <div className="flex items-center gap-3" style={{ marginBottom: 18 }}>
      {icon && (
        <IconBadge size={48}>
          {icon === 'all' ? (
            <LayoutGrid size={22} strokeWidth={1.9} aria-hidden />
          ) : (
            <CategoryIcon icon={icon} size={22} strokeWidth={1.9} />
          )}
        </IconBadge>
      )}
      <div style={{ minWidth: 0 }}>
        {/* Phones name the screen in the TopBar; desktop has no TopBar. */}
        <div
          className="hidden lg:block"
          style={{
            fontFamily: 'var(--pbt-font-mono)',
            fontSize: 10.5,
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
            color: 'var(--pbt-text-muted)',
            marginBottom: 4,
          }}
        >
          {eyebrow}
        </div>
        <div className="flex items-center" style={{ gap: 10 }}>
          <h2
            id={id}
            style={{
              margin: 0,
              fontSize: 26,
              fontWeight: 400,
              letterSpacing: '-0.025em',
              lineHeight: 1.1,
              color: 'var(--pbt-text)',
              minWidth: 0,
            }}
          >
            {title}
          </h2>
          {badge}
        </div>
        <p style={{ margin: '5px 0 0', fontSize: 13, lineHeight: 1.45, color: 'var(--pbt-text-muted)' }}>{sub}</p>
      </div>
    </div>
  );
}

/** The driver-gradient badge with a white line icon. */
function IconBadge({ size, children }: { size: number; children: React.ReactNode }) {
  return (
    <span
      aria-hidden
      style={{
        flexShrink: 0,
        width: size,
        height: size,
        borderRadius: Math.round(size * 0.32),
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#fff',
        background: 'linear-gradient(160deg, var(--pbt-driver-primary), var(--pbt-driver-accent))',
        boxShadow:
          'inset 0 1px 0 rgba(255,255,255,0.35), 0 8px 18px -10px color-mix(in oklab, var(--pbt-driver-primary) 70%, transparent)',
      }}
    >
      {children}
    </span>
  );
}

/** One focus area: icon, name, how many scenarios. The whole card opens it. */
function GroupCard({
  title,
  count,
  icon,
  glyph,
  wide = false,
  onClick,
  index,
}: {
  title: string;
  count: string;
  icon?: CategoryIconKey;
  /** A drawing in place of a category icon ("All scenarios"). */
  glyph?: React.ReactNode;
  wide?: boolean;
  onClick: () => void;
  index: number;
}) {
  const reduce = useReducedMotion();
  const { resolvedTheme } = useTheme();
  const dark = resolvedTheme === 'dark';
  return (
    <motion.button
      type="button"
      onClick={onClick}
      aria-label={`${title}, ${count}`}
      className="pbt-library-group"
      initial={reduce ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.24, ease: 'easeOut', delay: reduce ? 0 : Math.min(index, 8) * 0.03 }}
      whileTap={{ scale: 0.98 }}
      style={{
        display: 'block',
        width: '100%',
        height: '100%',
        padding: 0,
        border: 'none',
        background: 'none',
        textAlign: 'left',
        color: 'inherit',
        font: 'inherit',
        cursor: 'pointer',
        borderRadius: 20,
      }}
    >
      <Glass
        radius={20}
        padding={wide ? '14px 16px' : 16}
        tint={dark ? 0.44 : 0.22}
        style={{ height: '100%' }}
      >
        <div
          className={wide ? 'flex items-center gap-3' : 'flex flex-col'}
          style={{ gap: wide ? 12 : 12, minHeight: wide ? undefined : 104 }}
        >
          <IconBadge size={wide ? 44 : 46}>
            {glyph ?? <CategoryIcon icon={icon} size={22} strokeWidth={1.9} />}
          </IconBadge>
          <div style={{ minWidth: 0, flex: wide ? 1 : undefined, marginTop: wide ? 0 : 'auto' }}>
            <div
              style={{
                fontWeight: 650,
                fontSize: 15,
                lineHeight: 1.25,
                letterSpacing: '-0.01em',
                color: 'var(--pbt-text)',
                display: '-webkit-box',
                WebkitBoxOrient: 'vertical' as never,
                WebkitLineClamp: 2,
                overflow: 'hidden',
                overflowWrap: 'anywhere',
              }}
            >
              {title}
            </div>
            <div
              style={{
                marginTop: 4,
                fontFamily: 'var(--pbt-font-mono)',
                fontSize: 10,
                fontWeight: 600,
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
                color: 'var(--pbt-text-muted)',
              }}
            >
              {count}
            </div>
          </div>
          {wide && <Icon.arrow aria-hidden style={{ flexShrink: 0, color: 'var(--pbt-text-muted)' }} />}
        </div>
      </Glass>
    </motion.button>
  );
}

function EmptyLibrary({
  species,
  canBuild,
  onBuild,
}: {
  /** The animal chosen on the toggle; null when there is no toggle. */
  species: ScenarioSpecies | null;
  canBuild: boolean;
  onBuild: () => void;
}) {
  const t = useT();
  const title =
    species === 'cat'
      ? t('library.empty.titleCat')
      : species === 'dog'
        ? t('library.empty.titleDog')
        : t('library.empty.title');
  return (
    <Glass radius={22} padding={20}>
      <div className="flex items-start gap-3">
        <IconBadge size={44}>
          <Icon.info aria-hidden />
        </IconBadge>
        <div style={{ minWidth: 0 }}>
          <h2 style={{ margin: '2px 0 6px', fontSize: 18, fontWeight: 500, letterSpacing: '-0.015em' }}>{title}</h2>
          <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.5, color: 'var(--pbt-text-muted)' }}>
            {canBuild ? t('library.empty.body') : t('library.empty.bodyNoBuild')}
          </p>
          {canBuild && (
            <div style={{ marginTop: 14 }}>
              <PillButton icon={<Icon.spark />} onClick={onBuild}>
                {t('library.empty.cta')}
              </PillButton>
            </div>
          )}
        </div>
      </div>
    </Glass>
  );
}
