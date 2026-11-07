import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Glass } from '../design-system/Glass';
import { Icon } from '../design-system/Icon';
import { Chip } from '../design-system/Chip';
import { PillButton } from '../design-system/PillButton';
import { Segmented, type SegmentedOption } from '../design-system/Segmented';
import { SpeciesIcon } from '../design-system/SpeciesIcon';
import { TopBar } from '../shell/TopBar';
import { Page } from '../shell/Page';
import { useNavigation } from '../app/providers/NavigationProvider';
import { useScenario } from '../app/providers/ScenarioProvider';
import { useProfile } from '../app/providers/ProfileProvider';
import { useSavedPets } from '../features/pet-analyzer/useSavedPets';
import {
  LIFE_STAGES,
  OWNER_PERSONAS,
  PUSHBACK_CATEGORIES,
  type Difficulty,
  type LifeStage,
  type OwnerPersona,
  type PushbackCategory,
  type Scenario,
} from '../data/scenarios';
import { DRIVER_KEYS, type DriverKey } from '../design-system/tokens';
import { persistUserScenario } from '../features/scenarios/persistScenario';
import { useCatScenariosEnabled, useTrainingSpecies } from '../features/scenarios/useTrainingSpecies';
import {
  useObjectionCatalog,
  type TrainingCategory,
  type TrainingObjection,
} from '../features/scenarios/useObjectionCatalog';
import { SCENARIO_LIMITS } from '../shared/scenarios/limits';
import {
  POPULAR_BREEDS,
  type ScenarioSpecies,
} from '../shared/scenarios/species';
import { useT } from '../i18n/useT';
import { useLanguage } from '../app/providers/LanguageProvider';
import {
  localizedLifeStage,
  localizedPersona,
} from '../i18n/dataL10n/scenarios';
import {
  localizedDifficulty,
  localizedDifficultyLabel,
} from '../i18n/dataL10n/pushbacks';

const CUSTOM_PUSHBACK = PUSHBACK_CATEGORIES.find((c) => c.id === 'custom')!;
/** Quick-pick breed chips shown per animal (the field stays free text). */
const BREED_CHIP_COUNT = 6;

function breedChips(species: ScenarioSpecies): readonly string[] {
  return POPULAR_BREEDS[species].slice(0, BREED_CHIP_COUNT);
}

/**
 * The trainee's own scenario builder ("Build your own" in Home's Select
 * scenario dialog). Ready-made scenarios live on the Training library screen
 * (`ScenarioLibraryScreen`), not here.
 */
export function CreateScreen() {
  const { go } = useNavigation();
  const { setScenario } = useScenario();
  const { profile } = useProfile();
  const { savedPets } = useSavedPets();
  const t = useT();
  const { locale } = useLanguage();
  // Dogs only while `scenario.cat.enabled` is off: the hook reads 'dog' and
  // the "Which animal?" row below is not rendered.
  const [species, setSpecies] = useTrainingSpecies();
  const catEnabled = useCatScenariosEnabled();
  const { categoriesFor, objectionsIn } = useObjectionCatalog();
  // Line icons, not emoji: white on the active gradient, muted otherwise.
  const animalOptions: SegmentedOption<ScenarioSpecies>[] = [
    { value: 'dog', label: t('create.animal.dog'), icon: <SpeciesIcon species="dog" size={14} /> },
    { value: 'cat', label: t('create.animal.cat'), icon: <SpeciesIcon species="cat" size={14} /> },
  ];

  // Default matches the first quick-pick chip so it renders as selected
  // on load instead of an orphan value no chip highlights.
  const [breed, setBreed] = useState(() => POPULAR_BREEDS[species][0]);
  const [weight, setWeight] = useState('');
  const [age, setAge] = useState<LifeStage>(LIFE_STAGES[2]);
  const [pushbackId, setPushbackId] = useState<string>(PUSHBACK_CATEGORIES[0].id);
  /** Build tab category; null = the first one available for the animal. */
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [persona, setPersona] = useState<OwnerPersona>(OWNER_PERSONAS[0]);
  const [difficulty, setDifficulty] = useState<Difficulty>(1);
  const [context, setContext] = useState('');
  const [pushbackNotes, setPushbackNotes] = useState('');
  const [breedError, setBreedError] = useState<string | null>(null);
  const [pushbackError, setPushbackError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [driver, setDriver] = useState<DriverKey>(profile?.primary ?? 'Activator');
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Build: animal → category → objection. The categories offered are those
  // holding at least one visible objection for this animal; the dropdown
  // offers that category's objections ("Other pushback" is its own card
  // below the dropdown, outside every category).
  const buildCategories = categoriesFor(species);
  const activeCategory: TrainingCategory | null =
    buildCategories.find((c) => c.id === categoryId) ?? buildCategories[0] ?? null;
  const pickable: TrainingObjection[] = activeCategory ? objectionsIn(activeCategory.id, species) : [];
  // A choice that no longer applies (the snapshot refreshed and the team
  // retired it) falls back to the first available one rather than building a
  // scenario on an objection the picker no longer shows.
  const selectedObjection: TrainingObjection | null =
    pushbackId === 'custom'
      ? null
      : (pickable.find((o) => o.id === pushbackId) ?? pickable[0] ?? null);
  const isCustomSelected = selectedObjection == null;
  const pushbackCategory: PushbackCategory = selectedObjection?.pushback ?? CUSTOM_PUSHBACK;

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!dropdownOpen) return;
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [dropdownOpen]);

  const selectPushback = (id: string) => {
    setPushbackId(id);
    setPushbackError(null);
    setDropdownOpen(false);
  };

  // Picking a category picks from it: the dropdown moves to its first
  // objection (kept when the current one is already in it).
  const selectCategory = (id: string) => {
    setCategoryId(id);
    const inCategory = objectionsIn(id, species);
    if (!inCategory.some((o) => o.id === pushbackId)) {
      setPushbackId(inCategory[0]?.id ?? 'custom');
    }
    setPushbackError(null);
    setDropdownOpen(false);
  };

  const changeSpecies = (next: ScenarioSpecies) => {
    if (next === species) return;
    // Swap the breed only when it is still one of the previous animal's
    // suggestions — a breed the trainee typed is theirs to keep.
    const trimmed = breed.trim();
    if (trimmed === POPULAR_BREEDS[species][0] || breedChips(species).includes(trimmed)) {
      setBreed(POPULAR_BREEDS[next][0]);
      setBreedError(null);
    }
    // A category with nothing for the new animal gives way to the first one
    // that has something; an objection that doesn't apply gives way to the
    // first one of that category.
    const nextCategories = categoriesFor(next);
    const nextCategory =
      nextCategories.find((c) => c.id === activeCategory?.id) ?? nextCategories[0] ?? null;
    setCategoryId(nextCategory?.id ?? null);
    if (pushbackId !== 'custom') {
      const nextPickable = nextCategory ? objectionsIn(nextCategory.id, next) : [];
      if (!nextPickable.some((o) => o.id === pushbackId)) {
        setPushbackId(nextPickable[0]?.id ?? 'custom');
      }
    }
    setDropdownOpen(false);
    setSpecies(next);
  };

  const handleGenerate = () => {
    const breedTrim = breed.trim();
    if (!breedTrim) {
      setBreedError(t('create.breed.error'));
      return;
    }
    setBreedError(null);

    const notesTrim = pushbackNotes.trim();
    if (isCustomSelected && !notesTrim) {
      setPushbackError(t('create.pushback.error'));
      return;
    }
    setPushbackError(null);
    setIsSubmitting(true);
    const built: Scenario = {
      // Absent species = dog everywhere (prompts stay byte-identical), so
      // only a cat scenario carries the key.
      ...(species === 'cat' ? { species: 'cat' as const } : {}),
      breed: breedTrim,
      age,
      pushback: pushbackCategory,
      persona,
      difficulty,
      context: context.trim() || undefined,
      pushbackNotes: notesTrim || undefined,
      suggestedDriver: driver,
      weightKg: weight.trim() || undefined,
      // No knowledge keys: the objection's CATEGORY grounds the roleplay, and
      // the server applies it (never a copy carried by the scenario).
    };
    setScenario(built);
    void persistUserScenario(built);
    go('chat');
  };

  return (
    <>
      <TopBar showBack title={t('create.title')} />
      <Page>
        {/* ── Which animal? — the first choice. Only with
            cats switched on: a one-animal app asks no question. ── */}
        {catEnabled && (
          <div
            className="flex items-center justify-between gap-3 lg:justify-start lg:gap-5"
            style={{ marginBottom: 16 }}
          >
            <div
              style={{
                fontSize: 16,
                fontWeight: 700,
                letterSpacing: '-0.01em',
                color: 'var(--pbt-text)',
                paddingLeft: 2,
              }}
            >
              {t('create.animal.title')}
            </div>
            <Segmented
              options={animalOptions}
              value={species}
              onChange={changeSpecies}
              ariaLabel={t('create.animal.aria')}
            />
          </div>
        )}

        {/*
           * Two-column grid on desktop.
           * Left col: Category, The pushback, Breed, Life stage, Owner
           *   persona, ECHO driver — category → objection first, mirroring
           *   animal → category → objection.
           * Right col: Difficulty, Additional details.
           * On mobile: single column, JSX order preserved.
           */}
          <div className="lg:grid lg:grid-cols-2 lg:gap-8 lg:items-start">
            {/* Left column */}
            <div>
            {/* ── Category — the subject area; scopes the pushback dropdown ── */}
            {buildCategories.length > 0 && (
              <Section label={t('create.section.category')}>
                <div
                  role="group"
                  aria-label={t('create.category.aria')}
                  className="flex flex-wrap gap-2"
                >
                  {buildCategories.map((c) => (
                    <Chip
                      key={c.id}
                      active={c.id === activeCategory?.id}
                      onClick={() => selectCategory(c.id)}
                      className="max-w-full truncate"
                      title={c.label}
                    >
                      {c.label}
                    </Chip>
                  ))}
                </div>
                {activeCategory?.blurb && (
                  <p
                    style={{
                      margin: '10px 0 0',
                      paddingLeft: 2,
                      fontSize: 12.5,
                      lineHeight: 1.45,
                      color: 'var(--pbt-text-muted)',
                    }}
                  >
                    {activeCategory.blurb}
                  </p>
                )}
              </Section>
            )}

            {/* ── The pushback ── */}
            <Section label={t('create.section.pushback')}>
              {/* Glass dropdown trigger */}
              <div ref={dropdownRef} style={{ position: 'relative' }}>
                <Glass
                  radius={18}
                  padding={14}
                  onClick={() => setDropdownOpen((v) => !v)}
                  ariaLabel={t('create.pushback.selectAria')}
                  glow={!isCustomSelected ? 'var(--pbt-driver-primary)' : null}
                  style={{
                    cursor: 'pointer',
                    border: !isCustomSelected
                      ? '1px solid color-mix(in oklab, var(--pbt-driver-primary) 58%, rgba(255,255,255,0.42))'
                      : undefined,
                  }}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div style={{ minWidth: 0 }}>
                      {isCustomSelected ? (
                        <span style={{ fontSize: 15, color: 'var(--pbt-text-muted)' }}>
                          {t('create.pushback.placeholder')}
                        </span>
                      ) : (
                        <>
                          <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--pbt-text)' }}>
                            {selectedObjection?.title}
                          </div>
                          <div style={{ fontSize: 12.5, color: 'var(--pbt-text-muted)', marginTop: 2, fontStyle: 'italic' }}>
                            {selectedObjection?.example}
                          </div>
                        </>
                      )}
                    </div>
                    <motion.div
                      animate={{ rotate: dropdownOpen ? 180 : 0 }}
                      transition={{ duration: 0.2 }}
                      style={{ flexShrink: 0, color: 'var(--pbt-text-muted)', display: 'flex' }}
                    >
                      <Icon.chevronDown />
                    </motion.div>
                  </div>
                </Glass>

                {/* Dropdown panel */}
                <AnimatePresence>
                  {dropdownOpen && (
                    <motion.div
                      initial={{ opacity: 0, y: -8, scale: 0.97 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -6, scale: 0.97 }}
                      transition={{ duration: 0.2, ease: 'easeOut' }}
                      style={{
                        position: 'absolute',
                        top: 'calc(100% + 6px)',
                        left: 0,
                        right: 0,
                        zIndex: 50,
                      }}
                    >
                      <Glass radius={18} padding={6} blur={28} tint={0.06}>
                        <div className="flex flex-col" style={{ gap: 2 }}>
                          {pickable.map((objection) => {
                            const active = objection.id === selectedObjection?.id;
                            return (
                              <button
                                key={objection.id}
                                type="button"
                                aria-pressed={active}
                                onClick={() => selectPushback(objection.id)}
                                style={{
                                  textAlign: 'left',
                                  padding: '10px 12px',
                                  borderRadius: 13,
                                  border: 'none',
                                  cursor: 'pointer',
                                  background: active
                                    ? 'color-mix(in oklab, var(--pbt-driver-primary) 16%, transparent)'
                                    : 'transparent',
                                  transition: 'background 0.15s',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: 10,
                                }}
                              >
                                <div
                                  style={{
                                    width: 20,
                                    height: 20,
                                    borderRadius: '50%',
                                    flexShrink: 0,
                                    background: active
                                      ? 'linear-gradient(180deg, var(--pbt-driver-primary), var(--pbt-driver-accent))'
                                      : 'color-mix(in oklab, var(--pbt-driver-primary) 11%, rgba(255,255,255,0.06))',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                  }}
                                >
                                  {active && <Icon.check style={{ width: 10, height: 10, color: '#fff' }} />}
                                </div>
                                <div style={{ minWidth: 0 }}>
                                  <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--pbt-text)' }}>
                                    {objection.title}
                                  </div>
                                  <div style={{ fontSize: 12, color: 'var(--pbt-text-muted)', fontStyle: 'italic', marginTop: 1 }}>
                                    {objection.example}
                                  </div>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </Glass>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* "What exactly did they say?" — shown below dropdown for any named pushback */}
              <AnimatePresence>
                {!isCustomSelected && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.22 }}
                    style={{ overflow: 'hidden', marginTop: 8 }}
                  >
                    <Glass radius={16} padding={14}>
                      <div style={{ fontFamily: 'var(--pbt-font-mono)', fontSize: 9.5, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--pbt-text-muted)', marginBottom: 8, fontWeight: 700 }}>
                        {t('create.pushback.notesOptional')}
                      </div>
                      <textarea
                        value={pushbackNotes}
                        maxLength={SCENARIO_LIMITS.pushbackNotesMax}
                        onChange={(e) => { setPushbackNotes(e.target.value); if (pushbackError) setPushbackError(null); }}
                        placeholder={t('create.pushback.notesOptionalPlaceholder')}
                        rows={2}
                        style={{
                          width: '100%', minHeight: 56, border: 'none', outline: 'none',
                          resize: 'vertical', background: 'transparent', fontFamily: 'inherit',
                          fontSize: 14, color: 'var(--pbt-text)',
                        }}
                      />
                    </Glass>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Divider */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  margin: '14px 0',
                }}
              >
                <div style={{ flex: 1, height: 1, background: 'color-mix(in oklab, var(--pbt-driver-primary) 12%, transparent)' }} />
                <span style={{ fontFamily: 'var(--pbt-font-mono)', fontSize: 9, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--pbt-text-muted)' }}>
                  {t('create.pushback.or')}
                </span>
                <div style={{ flex: 1, height: 1, background: 'color-mix(in oklab, var(--pbt-driver-primary) 12%, transparent)' }} />
              </div>

              {/* Other pushback — separate selectable card */}
              <Glass
                radius={18}
                padding={14}
                onClick={() => { selectPushback(CUSTOM_PUSHBACK.id); }}
                ariaLabel={t('create.pushback.otherTitle')}
                glow={isCustomSelected ? 'var(--pbt-driver-primary)' : null}
                style={{
                  border: isCustomSelected
                    ? '1px solid color-mix(in oklab, var(--pbt-driver-primary) 58%, rgba(255,255,255,0.42))'
                    : undefined,
                }}
              >
                <div className="flex items-center gap-3">
                  <div
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: '50%',
                      flexShrink: 0,
                      background: isCustomSelected
                        ? 'linear-gradient(180deg, var(--pbt-driver-primary), var(--pbt-driver-accent))'
                        : 'color-mix(in oklab, var(--pbt-driver-primary) 11%, rgba(255,255,255,0.06))',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#fff',
                    }}
                  >
                    {isCustomSelected && <Icon.check />}
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--pbt-text)' }}>
                      {t('create.pushback.otherTitle')}
                    </div>
                    <div style={{ fontSize: 12.5, color: 'var(--pbt-text-muted)', marginTop: 1 }}>
                      {t('create.pushback.otherSub')}
                    </div>
                  </div>
                </div>
              </Glass>

              {/* Required custom notes — shown below "Other pushback" card */}
              <AnimatePresence>
                {isCustomSelected && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.22 }}
                    style={{ overflow: 'hidden', marginTop: 8 }}
                  >
                    <Glass radius={16} padding={14}>
                      <div style={{ fontFamily: 'var(--pbt-font-mono)', fontSize: 9.5, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--pbt-text-muted)', marginBottom: 8, fontWeight: 700 }}>
                        {t('create.pushback.notesRequired')}
                      </div>
                      <textarea
                        value={pushbackNotes}
                        maxLength={SCENARIO_LIMITS.pushbackNotesMax}
                        onChange={(e) => { setPushbackNotes(e.target.value); if (pushbackError) setPushbackError(null); }}
                        placeholder={t('create.pushback.notesRequiredPlaceholder')}
                        rows={3}
                        style={{
                          width: '100%', minHeight: 72, border: 'none', outline: 'none',
                          resize: 'vertical', background: 'transparent', fontFamily: 'inherit',
                          fontSize: 14, color: 'var(--pbt-text)',
                        }}
                        aria-invalid={pushbackError != null}
                      />
                      {pushbackError && (
                        <div style={{ marginTop: 8, fontSize: 12, color: 'var(--pbt-score-poor)' }}>
                          {pushbackError}
                        </div>
                      )}
                    </Glass>
                  </motion.div>
                )}
              </AnimatePresence>
            </Section>

            {/* ── Breed ── */}
            <Section label={t('create.section.breed')}>
              <Glass
                radius={20}
                padding={12}
                style={breedError ? { border: '1.5px solid var(--pbt-score-poor)' } : undefined}
              >
                <div className="flex items-center gap-2">
                  <Icon.search />
                  <input
                    value={breed}
                    onChange={(e) => { setBreed(e.target.value); if (breedError) setBreedError(null); }}
                    placeholder={t(
                      species === 'cat' ? 'create.breed.placeholderCat' : 'create.breed.placeholderDog',
                    )}
                    aria-label={t('create.section.breed')}
                    style={{
                      flex: 1, border: 'none', outline: 'none', background: 'transparent',
                      fontFamily: 'inherit', fontSize: 15, color: 'var(--pbt-text)',
                    }}
                    aria-invalid={breedError != null}
                  />
                </div>
              </Glass>
              {breedError && (
                <div style={{ marginTop: 6, fontSize: 12, color: 'var(--pbt-score-poor)', paddingLeft: 4 }}>
                  {breedError}
                </div>
              )}
              {savedPets.length > 0 && (
                <div style={{ marginTop: 10 }}>
                  <div style={{ fontFamily: 'var(--pbt-font-mono)', fontSize: 9, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--pbt-driver-primary)', marginBottom: 6, paddingLeft: 2 }}>
                    {t('create.savedPets.eyebrow')}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {savedPets.map((pet) => (
                      <Chip key={pet.id} active={breed === pet.breed} onClick={() => setBreed(pet.breed)}>
                        <Icon.paw style={{ width: 12, height: 12, marginRight: 4, display: 'inline-block', verticalAlign: 'middle' }} />
                        {pet.name || pet.breed}
                      </Chip>
                    ))}
                  </div>
                </div>
              )}
              <div className="mt-3 flex flex-wrap gap-2">
                {breedChips(species).map((b) => (
                  <Chip key={b} active={b === breed} onClick={() => setBreed(b)}>{b}</Chip>
                ))}
              </div>

              {/* Weight — compact, prominent */}
              <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 10 }}>
                <Glass radius={16} padding="10px 16px" style={{ display: 'inline-flex', alignItems: 'baseline', gap: 6 }}>
                  <input
                    id="pet-weight"
                    type="number"
                    min="0.5"
                    max="100"
                    step="0.5"
                    value={weight}
                    onChange={(e) => setWeight(e.target.value)}
                    placeholder="—"
                    style={{
                      width: 64,
                      border: 'none',
                      outline: 'none',
                      background: 'transparent',
                      fontFamily: 'inherit',
                      fontSize: 30,
                      fontWeight: 700,
                      letterSpacing: '-0.03em',
                      color: 'var(--pbt-text)',
                      lineHeight: 1,
                    }}
                  />
                  <span style={{ fontFamily: 'var(--pbt-font-mono)', fontSize: 13, color: 'var(--pbt-text-muted)', fontWeight: 600 }}>
                    {t('create.weight.unit')}
                  </span>
                </Glass>
                <label htmlFor="pet-weight" style={{ fontSize: 13, color: 'var(--pbt-text-muted)' }}>
                  {t(species === 'cat' ? 'create.weight.labelCat' : 'create.weight.labelDog')}
                </label>
              </div>
            </Section>

            {/* ── Life stage ── */}
            <Section label={t('create.section.lifeStage')}>
              <div className="grid grid-cols-2 gap-2">
                {LIFE_STAGES.map((stage) => (
                  <Glass
                    key={stage}
                    radius={18}
                    padding={14}
                    onClick={() => setAge(stage)}
                    ariaLabel={localizedLifeStage(stage, locale, species)}
                    glow={stage === age ? 'var(--pbt-driver-primary)' : null}
                    style={{
                      border:
                        stage === age
                          ? '1px solid color-mix(in oklab, var(--pbt-driver-primary) 58%, rgba(255,255,255,0.42))'
                          : undefined,
                    }}
                  >
                    <div style={{ fontWeight: 600, fontSize: 14 }}>
                      {localizedLifeStage(stage, locale, species)}
                    </div>
                  </Glass>
                ))}
              </div>
            </Section>

            {/* ── Owner persona ── */}
            <Section label={t('create.section.persona')}>
              <div className="flex flex-wrap gap-2">
                {OWNER_PERSONAS.map((p) => (
                  <Chip key={p} active={p === persona} onClick={() => setPersona(p)}>
                    {localizedPersona(p, locale)}
                  </Chip>
                ))}
              </div>
            </Section>

            {/* ── ECHO driver ── */}
            <Section label={t('create.section.driver')}>
              <div className="flex flex-wrap gap-2">
                {DRIVER_KEYS.map((d) => (
                  <Chip key={d} active={d === driver} onClick={() => setDriver(d)}>{d}</Chip>
                ))}
              </div>
            </Section>
            </div>{/* end left column */}

            {/* Right column */}
            <div>
            {/* ── Difficulty ── */}
            <Section label={t('create.section.difficulty')}>
              <DifficultySlider
                value={difficulty}
                onChange={setDifficulty}
                ariaLabel={t('create.difficulty.aria')}
              />
            </Section>

            {/* ── Additional details ── */}
            <Section label={t('create.section.details')}>
              <Glass radius={20} padding={14}>
                <textarea
                  value={context}
                  maxLength={SCENARIO_LIMITS.contextMax}
                  onChange={(e) => setContext(e.target.value)}
                  placeholder={t('create.details.placeholder')}
                  rows={4}
                  style={{
                    width: '100%', minHeight: 90, border: 'none', outline: 'none',
                    resize: 'vertical', background: 'transparent', fontFamily: 'inherit',
                    fontSize: 14, color: 'var(--pbt-text)',
                  }}
                />
              </Glass>
            </Section>

            {/*
              Desktop: inline CTA at the end of the form, right-aligned. We
              used to render a corner FAB but it floated awkwardly over
              content. Inline + auto-width is calmer and keeps the button
              visually anchored to the form it submits. Mobile users still
              get the sticky bottom bar below.
            */}
            <div className="hidden lg:flex lg:justify-end lg:pt-2 lg:pb-4">
              <PillButton
                size="lg"
                icon={<Icon.spark />}
                onClick={handleGenerate}
                disabled={isSubmitting}
                style={isSubmitting ? { opacity: 0.65 } : undefined}
              >
                {t('create.submit')}
              </PillButton>
            </div>

            <div style={{ height: 90 }} className="lg:hidden" />
            </div>
          </div>
      </Page>

      {/* Mobile-only sticky CTA. Desktop has the inline button above. */}
      <div
        className="fixed bottom-0 left-1/2 z-30 w-full max-w-[var(--pbt-layout-max)] -translate-x-1/2 px-5 lg:hidden"
        style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 18px)' }}
      >
        <PillButton
          size="lg"
          fullWidth
          icon={<Icon.spark />}
          onClick={handleGenerate}
          disabled={isSubmitting}
          style={isSubmitting ? { opacity: 0.65 } : undefined}
        >
          {t('create.submit')}
        </PillButton>
      </div>
    </>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: 22 }}>
      <div
        style={{
          fontSize: 16,
          fontWeight: 700,
          letterSpacing: '-0.01em',
          color: 'var(--pbt-text)',
          marginBottom: 12,
          paddingLeft: 2,
        }}
      >
        {label}
      </div>
      {children}
    </section>
  );
}

function DifficultySlider({
  value,
  onChange,
  ariaLabel,
}: {
  value: Difficulty;
  onChange: (d: Difficulty) => void;
  ariaLabel: string;
}) {
  const { locale } = useLanguage();
  const STEPS = [1, 2, 3, 4] as Difficulty[];
  const fraction = (value - 1) / 3;
  const pct = fraction * 100;

  return (
    <div>
      {/* Step labels row — taps shift the orb to that step */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12, paddingLeft: 2, paddingRight: 2 }}>
        {STEPS.map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => onChange(d)}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: '2px 4px',
              fontFamily: 'var(--pbt-font-mono)',
              fontSize: 9.5,
              fontWeight: d === value ? 800 : 500,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              color: d === value ? 'var(--pbt-driver-primary)' : 'var(--pbt-text-muted)',
              transition: 'color 0.2s, font-weight 0.15s',
              lineHeight: 1,
            }}
          >
            {localizedDifficultyLabel(d, locale)}
          </button>
        ))}
      </div>

      {/* Track area — single orb that smoothly slides between positions */}
      <div
        style={{
          position: 'relative',
          height: 36,
          display: 'flex',
          alignItems: 'center',
          padding: '0 12px',
        }}
      >
        {/* Background track */}
        <div
          style={{
            position: 'absolute',
            left: 12,
            right: 12,
            height: 6,
            borderRadius: 9999,
            background: 'color-mix(in oklab, var(--pbt-text) 8%, rgba(255,255,255,0.10))',
            border: '1px solid color-mix(in oklab, var(--pbt-text) 6%, rgba(255,255,255,0.18))',
            overflow: 'hidden',
          }}
        >
          {/* Gradient fill — animates smoothly with the orb */}
          <motion.div
            animate={{ width: `${pct}%` }}
            transition={{ type: 'spring', stiffness: 280, damping: 26 }}
            style={{
              height: '100%',
              borderRadius: 9999,
              background: 'linear-gradient(90deg, var(--pbt-driver-primary), var(--pbt-driver-accent))',
              boxShadow: '0 0 8px color-mix(in oklab, var(--pbt-driver-primary) 55%, transparent)',
            }}
          />
        </div>

        {/* Single sliding orb */}
        <motion.div
          aria-hidden
          animate={{ left: `calc(12px + (100% - 24px) * ${fraction})` }}
          transition={{ type: 'spring', stiffness: 280, damping: 26 }}
          style={{
            position: 'absolute',
            top: '50%',
            transform: 'translate(-50%, -50%)',
            width: 22,
            height: 22,
            borderRadius: '50%',
            background: 'linear-gradient(160deg, var(--pbt-driver-primary), var(--pbt-driver-accent))',
            boxShadow:
              '0 0 0 4px color-mix(in oklab, var(--pbt-driver-primary) 18%, transparent), 0 4px 14px color-mix(in oklab, var(--pbt-driver-primary) 45%, transparent), inset 0 1px 0 rgba(255,255,255,0.5)',
            zIndex: 2,
            pointerEvents: 'none',
          }}
        />

        {/* Native range input — full overlay, drives drag + keyboard */}
        <input
          type="range"
          min={1}
          max={4}
          step={1}
          value={value}
          onChange={(e) => onChange(Number(e.target.value) as Difficulty)}
          aria-label={ariaLabel}
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: 0,
            bottom: 0,
            width: '100%',
            height: '100%',
            opacity: 0,
            cursor: 'pointer',
            margin: 0,
            padding: 0,
            zIndex: 3,
          }}
        />
      </div>

      {/* Animated description */}
      <AnimatePresence mode="wait">
        <motion.div
          key={value}
          initial={{ opacity: 0, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.18, ease: 'easeOut' }}
          style={{ marginTop: 6 }}
        >
          <Glass radius={14} padding="10px 14px">
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              <span
                style={{
                  flexShrink: 0,
                  fontFamily: 'var(--pbt-font-mono)',
                  fontSize: 9,
                  fontWeight: 800,
                  letterSpacing: '0.14em',
                  textTransform: 'uppercase',
                  color: 'var(--pbt-driver-primary)',
                  paddingTop: 2,
                }}
              >
                {value}/4
              </span>
              <p style={{ margin: 0, fontSize: 13, color: 'var(--pbt-text-muted)', lineHeight: 1.5 }}>
                {localizedDifficulty(value, locale).description}
              </p>
            </div>
          </Glass>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
