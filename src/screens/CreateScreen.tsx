import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Glass } from '../design-system/Glass';
import { Icon } from '../design-system/Icon';
import { Chip } from '../design-system/Chip';
import { PillButton } from '../design-system/PillButton';
import { Segmented } from '../design-system/Segmented';
import { TopBar } from '../shell/TopBar';
import { Page } from '../shell/Page';
import { useNavigation } from '../app/providers/NavigationProvider';
import { useScenario } from '../app/providers/ScenarioProvider';
import { useProfile } from '../app/providers/ProfileProvider';
import { useSavedPets } from '../features/pet-analyzer/useSavedPets';
import {
  BREEDS,
  DIFFICULTY_DESCRIPTIONS,
  DIFFICULTY_LABELS,
  LIBRARY_SCENARIOS,
  LIFE_STAGES,
  OWNER_PERSONAS,
  PUSHBACK_CATEGORIES,
  SEED_SCENARIOS,
  type Difficulty,
  type LifeStage,
  type OwnerPersona,
  type PushbackCategory,
  type Scenario,
} from '../data/scenarios';
import { DRIVER_KEYS, type DriverKey } from '../design-system/tokens';
import { persistUserScenario } from '../features/scenarios/persistScenario';
import { logEvent } from '../lib/analytics';

type Tab = 'build' | 'library';

const TAB_OPTIONS: { value: Tab; label: string }[] = [
  { value: 'build', label: 'Build' },
  { value: 'library', label: 'Library' },
];

// Dropdown: all named pushbacks (not custom)
const DROPDOWN_PUSHBACKS = PUSHBACK_CATEGORIES.filter((c) => c.id !== 'custom');
const CUSTOM_PUSHBACK = PUSHBACK_CATEGORIES.find((c) => c.id === 'custom')!;

export function CreateScreen() {
  const { go } = useNavigation();
  const { setScenario } = useScenario();
  const { profile } = useProfile();
  const { savedPets } = useSavedPets();

  const [tab, setTab] = useState<Tab>('build');
  const [breed, setBreed] = useState('Labrador Retriever');
  const [weight, setWeight] = useState('');
  const [age, setAge] = useState<LifeStage>(LIFE_STAGES[2]);
  const [pushback, setPushback] = useState<PushbackCategory>(PUSHBACK_CATEGORIES[0]);
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

  const isCustomSelected = pushback.id === 'custom';

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

  const selectPushback = (cat: PushbackCategory) => {
    setPushback(cat);
    setPushbackError(null);
    setDropdownOpen(false);
  };

  const handleGenerate = () => {
    const breedTrim = breed.trim();
    if (!breedTrim) {
      setBreedError('Choose a breed or type one in.');
      return;
    }
    setBreedError(null);

    const notesTrim = pushbackNotes.trim();
    if (pushback.id === 'custom' && !notesTrim) {
      setPushbackError('Describe what the client pushed back on.');
      return;
    }
    setPushbackError(null);
    setIsSubmitting(true);
    const built: Scenario = {
      breed: breedTrim,
      age,
      pushback,
      persona,
      difficulty,
      context: context.trim() || undefined,
      pushbackNotes: notesTrim || undefined,
      suggestedDriver: driver,
      weightKg: weight.trim() || undefined,
    };
    setScenario(built);
    void persistUserScenario(built);
    go('chat');
  };

  const startLibraryScenario = (scenario: Scenario) => {
    logEvent({
      type: 'card_click',
      screen: 'create',
      target: 'library_scenario',
      meta: { pushback: scenario.pushback.id, breed: scenario.breed },
    });
    setScenario(scenario);
    go('chat');
  };

  return (
    <>
      <TopBar showBack title="Build a scenario" />
      <Page>
        <div className="flex justify-center mb-5">
          <Segmented
            options={TAB_OPTIONS}
            value={tab}
            onChange={(v) => setTab(v)}
            ariaLabel="Scenario tabs"
          />
        </div>

        {tab === 'library' ? (
          <div className="lg:grid lg:grid-cols-2 lg:gap-4 flex flex-col gap-3">
            {LIBRARY_SCENARIOS.map((scenario, i) => (
              <Glass key={i} radius={18} padding={14}>
                <div className="flex items-start justify-between gap-3">
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>
                      {scenario.pushback.title}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--pbt-text-muted)', marginBottom: 8 }}>
                      {scenario.breed} · {scenario.age} · {scenario.persona}
                    </div>
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        padding: '3px 10px',
                        borderRadius: 9999,
                        fontSize: 10,
                        fontFamily: 'var(--pbt-font-mono)',
                        fontWeight: 600,
                        letterSpacing: '0.10em',
                        textTransform: 'uppercase',
                        background: 'linear-gradient(180deg, var(--pbt-driver-primary), var(--pbt-driver-accent))',
                        color: '#fff',
                      }}
                    >
                      {DIFFICULTY_LABELS[scenario.difficulty]}
                    </span>
                  </div>
                  <button
                    onClick={() => startLibraryScenario(scenario)}
                    style={{
                      flexShrink: 0,
                      alignSelf: 'center',
                      padding: '8px 18px',
                      borderRadius: 9999,
                      border: 'none',
                      cursor: 'pointer',
                      fontFamily: 'var(--pbt-font-mono)',
                      fontSize: 11,
                      fontWeight: 600,
                      letterSpacing: '0.10em',
                      textTransform: 'uppercase',
                      background: 'linear-gradient(180deg, var(--pbt-driver-primary), var(--pbt-driver-accent))',
                      color: '#fff',
                      boxShadow:
                        '0 4px 12px -4px color-mix(in oklab, var(--pbt-driver-primary) 42%, transparent)',
                    }}
                  >
                    Start
                  </button>
                </div>
              </Glass>
            ))}
          </div>
        ) : (
          /*
           * Build tab: two-column grid on desktop.
           * Left col: Breed, Life stage, Owner persona, ECHO driver.
           * Right col: The pushback, Difficulty, Additional details.
           * On mobile: single column, JSX order preserved.
           */
          <div className="lg:grid lg:grid-cols-2 lg:gap-8 lg:items-start">
            {/* Left column */}
            <div>
            {/* ── Breed ── */}
            <Section label="Breed">
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
                    placeholder="Search breed"
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
                    Saved pets
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
                {BREEDS.slice(0, 6).map((b) => (
                  <Chip key={b} active={b === breed} onClick={() => setBreed(b)}>{b}</Chip>
                ))}
              </div>

              {/* Weight — compact, prominent */}
              <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 10 }}>
                <Glass radius={16} padding="10px 16px" style={{ display: 'inline-flex', alignItems: 'baseline', gap: 6 }}>
                  <input
                    id="dog-weight"
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
                    kg
                  </span>
                </Glass>
                <span style={{ fontSize: 13, color: 'var(--pbt-text-muted)' }}>
                  Dog's weight (optional)
                </span>
              </div>
            </Section>

            {/* ── Life stage ── */}
            <Section label="Life stage">
              <div className="grid grid-cols-2 gap-2">
                {LIFE_STAGES.map((stage) => (
                  <Glass
                    key={stage}
                    radius={18}
                    padding={14}
                    onClick={() => setAge(stage)}
                    ariaLabel={stage}
                    glow={stage === age ? 'var(--pbt-driver-primary)' : null}
                    style={{
                      border:
                        stage === age
                          ? '1px solid color-mix(in oklab, var(--pbt-driver-primary) 58%, rgba(255,255,255,0.42))'
                          : undefined,
                    }}
                  >
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{stage}</div>
                  </Glass>
                ))}
              </div>
            </Section>

            {/* ── The pushback ── */}
            <Section label="The pushback">
              {/* Glass dropdown trigger */}
              <div ref={dropdownRef} style={{ position: 'relative' }}>
                <Glass
                  radius={18}
                  padding={14}
                  onClick={() => setDropdownOpen((v) => !v)}
                  ariaLabel="Select pushback type"
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
                          Choose a pushback type…
                        </span>
                      ) : (
                        <>
                          <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--pbt-text)' }}>
                            {pushback.title}
                          </div>
                          <div style={{ fontSize: 12.5, color: 'var(--pbt-text-muted)', marginTop: 2, fontStyle: 'italic' }}>
                            {pushback.example}
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
                          {DROPDOWN_PUSHBACKS.map((cat) => {
                            const active = cat.id === pushback.id;
                            return (
                              <button
                                key={cat.id}
                                type="button"
                                onClick={() => selectPushback(cat)}
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
                                    {cat.title}
                                  </div>
                                  <div style={{ fontSize: 12, color: 'var(--pbt-text-muted)', fontStyle: 'italic', marginTop: 1 }}>
                                    {cat.example}
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
                        What exactly did they say? · optional
                      </div>
                      <textarea
                        value={pushbackNotes}
                        onChange={(e) => { setPushbackNotes(e.target.value); if (pushbackError) setPushbackError(null); }}
                        placeholder="Add the actual wording or nuance — helps the AI stay specific."
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
                  or
                </span>
                <div style={{ flex: 1, height: 1, background: 'color-mix(in oklab, var(--pbt-driver-primary) 12%, transparent)' }} />
              </div>

              {/* Other pushback — separate selectable card */}
              <Glass
                radius={18}
                padding={14}
                onClick={() => { selectPushback(CUSTOM_PUSHBACK); }}
                ariaLabel={CUSTOM_PUSHBACK.title}
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
                      Other pushback
                    </div>
                    <div style={{ fontSize: 12.5, color: 'var(--pbt-text-muted)', marginTop: 1 }}>
                      Describe any objection in your own words
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
                        What did they push back on? · required
                      </div>
                      <textarea
                        value={pushbackNotes}
                        onChange={(e) => { setPushbackNotes(e.target.value); if (pushbackError) setPushbackError(null); }}
                        placeholder='e.g. "They insisted supermarket senior food is identical to Rx…"'
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

            {/* ── Owner persona ── */}
            <Section label="Owner persona">
              <div className="flex flex-wrap gap-2">
                {OWNER_PERSONAS.map((p) => (
                  <Chip key={p} active={p === persona} onClick={() => setPersona(p)}>{p}</Chip>
                ))}
              </div>
            </Section>

            {/* ── ECHO driver ── */}
            <Section label="ECHO driver">
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
            <Section label="Difficulty">
              <DifficultySlider value={difficulty} onChange={setDifficulty} />
            </Section>

            {/* ── Additional details ── */}
            <Section label="Additional details">
              <Glass radius={20} padding={14}>
                <textarea
                  value={context}
                  onChange={(e) => setContext(e.target.value)}
                  placeholder="Add specifics — what was said, what stalled the conversation…"
                  rows={4}
                  style={{
                    width: '100%', minHeight: 90, border: 'none', outline: 'none',
                    resize: 'vertical', background: 'transparent', fontFamily: 'inherit',
                    fontSize: 14, color: 'var(--pbt-text)',
                  }}
                />
              </Glass>
            </Section>

            <div style={{ height: 90 }} className="lg:hidden" />
            </div>
          </div>
        )}
      </Page>

      {tab === 'build' && (
        <div
          className="fixed bottom-0 left-1/2 z-30 w-full max-w-[var(--pbt-layout-max)] -translate-x-1/2 px-5 lg:left-[240px] lg:right-0 lg:translate-x-0 lg:max-w-none"
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
            Start scenario
          </PillButton>
        </div>
      )}
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

function DifficultySlider({ value, onChange }: { value: Difficulty; onChange: (d: Difficulty) => void }) {
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
            {DIFFICULTY_LABELS[d]}
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
          aria-label="Difficulty"
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
                {DIFFICULTY_DESCRIPTIONS[value]}
              </p>
            </div>
          </Glass>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
