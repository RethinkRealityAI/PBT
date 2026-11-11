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
import { libraryCardTitles, libraryCardPetLine } from '../features/scenarios/libraryCardText';
import {
  libraryForAnimal,
  libraryGroupOf,
  libraryGroups,
  libraryHasBothAnimals,
  practisedScenarioIds,
  scenariosInGroup,
  type PracticeFilter,
  type LibraryGroup,
} from '../features/scenarios/libraryGrouping';
import { objectionCategoryId } from '../shared/scenarios/objectionCategories';
import { speciesOf, type ScenarioSpecies } from '../shared/scenarios/species';
import { readStorage } from '../lib/storage';
import { SESSIONS_KEY } from '../lib/sessionsKey';
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
  const { teamObjections, categories, categoryById } = useObjectionCatalog();

  /** null = step 1 (focus areas); a group id or ALL = step 2. */
  const [groupId, setGroupId] = useState<string | null>(null);
  const [practiceFilter, setPracticeFilter] = useState<PracticeFilter>('all');
  // Sessions saved on this device — read once per visit (a session can't
  // finish while this screen is open).
  const [sessions] = useState(() => readStorage(SESSIONS_KEY));

  const showAnimalToggle = libraryHasBothAnimals(resolved);
  const forAnimal = useMemo(() => libraryForAnimal(resolved, species), [resolved, species]);
  const otherLabel = t('create.pushback.otherTitle');
  const groups = useMemo(
    () => libraryGroups(forAnimal, teamObjections, categories, otherLabel),
    [forAnimal, teamObjections, categories, otherLabel],
  );
  // Dog and cat get the SAME two steps (focus areas → scenarios), even
  // when an animal has a single area: skipping step 1 for one animal made
  // the two sides look like different screens.
  const activeGroup: string | null =
    groupId === ALL || groups.some((g) => g.id === groupId) ? groupId : null;
  const step: 'groups' | 'scenarios' = activeGroup ? 'scenarios' : 'groups';

  const inGroup =
    activeGroup === ALL || activeGroup == null
      ? forAnimal
      : scenariosInGroup(forAnimal, activeGroup, teamObjections, categories);
  // All · Practised · Not practised — the same three on every list, for
  // every animal (the per-objection chips repeated each card's title).
  const practised = useMemo(() => practisedScenarioIds(forAnimal, sessions), [forAnimal, sessions]);
  const practisedCount = inGroup.filter((r) => practised.has(r.scenarioId)).length;
  const visible =
    practiceFilter === 'all'
      ? inGroup
      : inGroup.filter((r) => practised.has(r.scenarioId) === (practiceFilter === 'practised'));

  // The animal is chosen on step 1. If it changes while an area is open
  // (another tab, another surface), go back there: the area may not exist
  // for the other animal.
  const seenSpecies = useRef(species);
  useEffect(() => {
    if (seenSpecies.current === species) return;
    seenSpecies.current = species;
    setGroupId(null);
    setPracticeFilter('all');
  }, [species]);

  const leaveGroup = () => {
    setGroupId(null);
    setPracticeFilter('all');
  };
  // The step only exists when there was a step 1 to come back to.
  useBrowserBackStep(step === 'scenarios', leaveGroup);

  const openGroup = (group: LibraryGroup | null) => {
    logEvent({
      type: 'card_click',
      screen: 'scenarioLibrary',
      target: 'library_category',
      meta: { category: group ? group.id : 'all', species: speciesOf(species), count: group?.count ?? forAnimal.length },
    });
    setPracticeFilter('all');
    setGroupId(group ? group.id : ALL);
  };

  const changeSpecies = (next: ScenarioSpecies) => {
    if (next === species) return;
    setPracticeFilter('all');
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
    if (step === 'scenarios') leaveGroup();
    else back();
  };

  // The area step 2 is showing (null = all of this animal's scenarios).
  const current =
    activeGroup && activeGroup !== ALL ? (groups.find((g) => g.id === activeGroup) ?? null) : null;
  // Every step names the animal it is for: "All Dog Scenarios",
  // "Cat Gastrointestinal Scenarios".
  const isCat = species === 'cat';
  const allTitle = t(isCat ? 'library.step.allCat' : 'library.step.allDog');
  const stepTitle = current
    ? t(isCat ? 'library.step.groupCat' : 'library.step.groupDog', { area: current.label })
    : allTitle;
  const speciesBadge = (
    <SpeciesBadge
      species={species}
      size={26}
      background="linear-gradient(160deg, var(--pbt-driver-primary), var(--pbt-driver-accent))"
      title={t(isCat ? 'create.animal.cat' : 'create.animal.dog')}
    />
  );
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
                  title={allTitle}
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
            <StepHeading
              id="pbt-library-heading"
              eyebrow={t('library.eyebrow')}
              title={stepTitle}
              sub={countText(inGroup.length)}
              badge={speciesBadge}
              icon={current ? current.icon : 'all'}
            />
            {/* Inside an area the animal is fixed (chosen on step 1): the
                title and the badge say which. */}
            <ChipScroller ariaLabel={t('library.practice.aria')} className="mb-3">
              <FilterChip
                label={t('library.filterAll')}
                count={inGroup.length}
                active={practiceFilter === 'all'}
                onClick={() => setPracticeFilter('all')}
              />
              <FilterChip
                label={t('library.practice.done')}
                count={practisedCount}
                active={practiceFilter === 'practised'}
                onClick={() => setPracticeFilter('practised')}
              />
              <FilterChip
                label={t('library.practice.new')}
                count={inGroup.length - practisedCount}
                active={practiceFilter === 'new'}
                onClick={() => setPracticeFilter('new')}
              />
            </ChipScroller>
            {visible.length === 0 && (
              <p style={{ margin: '8px 2px 16px', fontSize: 14, color: 'var(--pbt-text-muted)' }}>
                {t(practiceFilter === 'practised' ? 'library.practice.noneDone' : 'library.practice.noneNew')}
              </p>
            )}
            <div
              aria-label={t('library.scenariosAria')}
              role="list"
              className="flex flex-col gap-3 lg:grid lg:grid-cols-2 lg:gap-4"
            >
              {visible.map((item) => {
                const { scenario, override } = item;
                const { title: cardTitle, objection: eyebrowObjection } = libraryCardTitles(
                  override?.card_title_override,
                  localizedScenario(scenario, locale).pushback.title,
                );
                // Inside one focus area its name would only repeat the
                // heading; under "All scenarios" it says where each one lives.
                const categoryLabel =
                  activeGroup === ALL
                    ? (categoryById(objectionCategoryId(scenario.pushback.id, teamObjections))?.label ?? null)
                    : null;
                const difficultyLabel = localizedDifficultyLabel(scenario.difficulty, locale);
                return (
                  <div role="listitem" key={item.scenarioId}>
                    <LibraryScenarioCard
                      title={cardTitle}
                      category={categoryLabel}
                      objection={eyebrowObjection}
                      species={speciesOf(scenario.species)}
                      pet={libraryCardPetLine(scenario.breed, localizedLifeStage(scenario.age, locale, scenario.species))}
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
        {/* The animal badge rides at the end of the title text: it sits
            after the last word, and drops to the next line with it when the
            title is long — never squeezed into a column beside it. */}
        <div style={{ fontSize: 26, lineHeight: 1.15, minWidth: 0 }}>
          <h2
            id={id}
            style={{
              display: 'inline',
              margin: 0,
              fontSize: 26,
              fontWeight: 400,
              letterSpacing: '-0.025em',
              lineHeight: 1.15,
              color: 'var(--pbt-text)',
            }}
          >
            {title}
          </h2>
          {badge && (
            <span
              style={{
                display: 'inline-flex',
                verticalAlign: 'middle',
                marginLeft: 10,
                position: 'relative',
                top: -2,
                whiteSpace: 'nowrap',
              }}
            >
              {badge}
            </span>
          )}
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
