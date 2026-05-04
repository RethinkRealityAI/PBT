import { useState } from 'react';
import { Glass } from '../design-system/Glass';
import { Icon } from '../design-system/Icon';
import { Chip } from '../design-system/Chip';
import { PillButton } from '../design-system/PillButton';
import { TopBar } from '../shell/TopBar';
import { Page } from '../shell/Page';
import { useNavigation } from '../app/providers/NavigationProvider';
import { useScenario } from '../app/providers/ScenarioProvider';
import { useProfile } from '../app/providers/ProfileProvider';
import { useSavedPets } from '../features/pet-analyzer/useSavedPets';
import {
  BREEDS,
  DIFFICULTY_LABELS,
  LIFE_STAGES,
  OWNER_PERSONAS,
  PUSHBACK_CATEGORIES,
  type Difficulty,
  type LifeStage,
  type OwnerPersona,
  type PushbackCategory,
} from '../data/scenarios';
import { DRIVER_KEYS, type DriverKey } from '../design-system/tokens';

export function CreateScreen() {
  const { go } = useNavigation();
  const { setScenario } = useScenario();
  const { profile } = useProfile();
  const { savedPets } = useSavedPets();

  const [breed, setBreed] = useState('Labrador Retriever');
  const [age, setAge] = useState<LifeStage>(LIFE_STAGES[2]);
  const [pushback, setPushback] = useState<PushbackCategory>(
    PUSHBACK_CATEGORIES[0],
  );
  const [persona, setPersona] = useState<OwnerPersona>(OWNER_PERSONAS[0]);
  const [difficulty, setDifficulty] = useState<Difficulty>(2);
  const [context, setContext] = useState('');
  const [driver, setDriver] = useState<DriverKey>(
    profile?.primary ?? 'Activator',
  );

  const handleGenerate = () => {
    setScenario({
      breed,
      age,
      pushback,
      persona,
      difficulty,
      context: context.trim() || undefined,
      suggestedDriver: driver,
    });
    go('chat');
  };

  return (
    <>
      <TopBar showBack title="Build a scenario" />
      <Page>
        <Section eyebrow="Breed">
          <Glass radius={20} padding={12} blur={20}>
            <div className="flex items-center gap-2">
              <Icon.search />
              <input
                value={breed}
                onChange={(e) => setBreed(e.target.value)}
                placeholder="Search breed"
                style={{
                  flex: 1,
                  border: 'none',
                  outline: 'none',
                  background: 'transparent',
                  fontFamily: 'inherit',
                  fontSize: 14.5,
                  color: 'var(--pbt-text)',
                }}
              />
            </div>
          </Glass>
          {savedPets.length > 0 && (
            <div style={{ marginTop: 10, marginBottom: 4 }}>
              <div
                style={{
                  fontFamily: 'var(--pbt-font-mono)',
                  fontSize: 9,
                  letterSpacing: '0.18em',
                  textTransform: 'uppercase',
                  color: 'oklch(0.62 0.22 22)',
                  marginBottom: 6,
                  paddingLeft: 2,
                }}
              >
                Saved pets
              </div>
              <div className="flex flex-wrap gap-2">
                {savedPets.map((pet) => (
                  <Chip
                    key={pet.id}
                    active={breed === pet.breed}
                    onClick={() => setBreed(pet.breed)}
                  >
                    <Icon.paw style={{ width: 12, height: 12, marginRight: 4, display: 'inline-block', verticalAlign: 'middle' }} />
                    {pet.name || pet.breed}
                  </Chip>
                ))}
              </div>
            </div>
          )}
          <div className="mt-2 flex flex-wrap gap-2">
            {BREEDS.slice(0, 6).map((b) => (
              <Chip key={b} active={b === breed} onClick={() => setBreed(b)}>
                {b}
              </Chip>
            ))}
          </div>
        </Section>

        <Section eyebrow="Life stage">
          <div className="grid grid-cols-2 gap-2">
            {LIFE_STAGES.map((stage) => (
              <Glass
                key={stage}
                radius={18}
                padding={14}
                onClick={() => setAge(stage)}
                ariaLabel={stage}
                glow={stage === age ? 'oklch(0.62 0.22 22)' : null}
                style={{
                  border: stage === age ? '1px solid oklch(0.62 0.22 22)' : undefined,
                  background:
                    stage === age
                      ? 'linear-gradient(135deg, oklch(0.94 0.05 20), oklch(0.92 0.06 22))'
                      : undefined,
                }}
              >
                <div style={{ fontWeight: 600, fontSize: 14 }}>{stage}</div>
              </Glass>
            ))}
          </div>
        </Section>

        <Section eyebrow="The pushback">
          <div className="flex flex-col gap-2">
            {PUSHBACK_CATEGORIES.map((cat) => {
              const active = cat.id === pushback.id;
              return (
                <Glass
                  key={cat.id}
                  radius={18}
                  padding={14}
                  onClick={() => setPushback(cat)}
                  ariaLabel={cat.title}
                  glow={active ? 'oklch(0.62 0.22 22)' : null}
                  style={{
                    border: active ? '1px solid oklch(0.62 0.22 22)' : undefined,
                  }}
                >
                  <div className="flex items-start gap-3">
                    <div
                      style={{
                        width: 22,
                        height: 22,
                        borderRadius: '50%',
                        flexShrink: 0,
                        marginTop: 2,
                        background: active
                          ? 'linear-gradient(180deg, oklch(0.66 0.22 22), oklch(0.56 0.24 18))'
                          : 'rgba(60,20,15,0.06)',
                        color: '#fff',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      {active && <Icon.check />}
                    </div>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>
                        {cat.title}
                      </div>
                      <div
                        style={{
                          fontStyle: 'italic',
                          fontSize: 13,
                          color: 'var(--pbt-text-muted)',
                          marginTop: 2,
                        }}
                      >
                        "{cat.example}"
                      </div>
                    </div>
                  </div>
                </Glass>
              );
            })}
          </div>
        </Section>

        <Section eyebrow="Owner persona">
          <div className="flex flex-wrap gap-2">
            {OWNER_PERSONAS.map((p) => (
              <Chip key={p} active={p === persona} onClick={() => setPersona(p)}>
                {p}
              </Chip>
            ))}
          </div>
        </Section>

        <Section eyebrow="ECHO driver">
          <div className="flex flex-wrap gap-2">
            {DRIVER_KEYS.map((d) => (
              <Chip key={d} active={d === driver} onClick={() => setDriver(d)}>
                {d}
              </Chip>
            ))}
          </div>
        </Section>

        <Section eyebrow="Difficulty">
          <Glass radius={20} padding={16}>
            <div className="flex items-center justify-between gap-2">
              {([1, 2, 3, 4] as Difficulty[]).map((d) => (
                <button
                  key={d}
                  onClick={() => setDifficulty(d)}
                  style={{
                    flex: 1,
                    padding: '8px 4px',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: 11,
                    fontFamily: 'var(--pbt-font-mono)',
                    letterSpacing: '0.10em',
                    textTransform: 'uppercase',
                    color: d <= difficulty ? '#fff' : 'var(--pbt-text-muted)',
                    background:
                      d <= difficulty
                        ? 'linear-gradient(180deg, oklch(0.66 0.22 22), oklch(0.56 0.24 18))'
                        : 'transparent',
                    borderRadius: 9999,
                    transition: 'all 0.2s',
                  }}
                >
                  {DIFFICULTY_LABELS[d]}
                </button>
              ))}
            </div>
          </Glass>
        </Section>

        <Section eyebrow="What actually happened (optional)">
          <Glass radius={20} padding={14}>
            <textarea
              value={context}
              onChange={(e) => setContext(e.target.value)}
              placeholder="Add specifics — what was said, what stalled the conversation…"
              rows={4}
              style={{
                width: '100%',
                minHeight: 90,
                border: 'none',
                outline: 'none',
                resize: 'vertical',
                background: 'transparent',
                fontFamily: 'inherit',
                fontSize: 14,
                color: 'var(--pbt-text)',
              }}
            />
          </Glass>
        </Section>

        <div style={{ height: 90 }} />
      </Page>
      <div
        className="fixed bottom-0 left-1/2 z-30 w-full max-w-[440px] -translate-x-1/2 px-5"
        style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 18px)' }}
      >
        <PillButton
          size="lg"
          fullWidth
          icon={<Icon.spark />}
          onClick={handleGenerate}
        >
          Generate scenario
        </PillButton>
      </div>
    </>
  );
}

function Section({
  eyebrow,
  children,
}: {
  eyebrow: string;
  children: React.ReactNode;
}) {
  return (
    <section style={{ marginBottom: 18 }}>
      <div
        style={{
          fontFamily: 'var(--pbt-font-mono)',
          fontSize: 10,
          letterSpacing: '0.18em',
          textTransform: 'uppercase',
          color: 'var(--pbt-text-muted)',
          marginBottom: 10,
          paddingLeft: 4,
        }}
      >
        {eyebrow}
      </div>
      {children}
    </section>
  );
}
