import { useState } from 'react';
import { Glass } from '../design-system/Glass';
import { Icon } from '../design-system/Icon';
import { Segmented } from '../design-system/Segmented';
import { PillButton } from '../design-system/PillButton';
import { TopBar } from '../shell/TopBar';
import { Page } from '../shell/Page';
import { usePetAnalyzer } from '../features/pet-analyzer/usePetAnalyzer';
import { useSavedPets } from '../features/pet-analyzer/useSavedPets';
import { BCS_LEVELS } from '../data/bcsLevels';
import { MCS_LEVELS } from '../data/mcsLevels';
import { COLORS } from '../design-system/tokens';

export function PetAnalyzerScreen() {
  const { state, update, calorieTarget, reference, verdictResult } =
    usePetAnalyzer();
  const { savePet } = useSavedPets();
  const [saved, setSaved] = useState(false);
  const verdictColor =
    verdictResult.verdict === 'good'
      ? COLORS.score.good
      : verdictResult.verdict === 'warn'
        ? COLORS.score.poor
        : COLORS.score.ok;

  const bcsLevel = BCS_LEVELS.find((l) => l.score === state.bcs);

  return (
    <>
      <TopBar showBack title="Pet Analyzer" />
      <Page>
        <Glass radius={22} padding={18} style={{ marginBottom: 14 }}>
          <div className="flex items-center gap-3 mb-3">
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: '50%',
                background: 'rgba(255,255,255,0.55)',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--pbt-text)',
              }}
            >
              <Icon.paw />
            </div>
            <div className="flex-1 flex flex-col gap-1">
              <input
                value={state.name}
                onChange={(e) => update('name', e.target.value)}
                placeholder="Pet name"
                style={{
                  border: 'none',
                  outline: 'none',
                  background: 'transparent',
                  fontFamily: 'inherit',
                  fontSize: 16,
                  fontWeight: 600,
                  color: 'var(--pbt-text)',
                }}
              />
              <input
                value={state.breed}
                onChange={(e) => update('breed', e.target.value)}
                placeholder="Breed"
                style={{
                  border: 'none',
                  outline: 'none',
                  background: 'transparent',
                  fontFamily: 'inherit',
                  fontSize: 13,
                  color: 'var(--pbt-text-muted)',
                }}
              />
            </div>
          </div>
        </Glass>

        <Glass radius={22} padding={18} style={{ marginBottom: 14 }}>
          <Eyebrow>Weight & activity</Eyebrow>
          <div className="flex items-baseline gap-2 mb-3">
            <span style={{ fontSize: 32, fontWeight: 600 }}>
              {state.weightKg}
            </span>
            <span style={{ fontSize: 14, color: 'var(--pbt-text-muted)' }}>
              kg
            </span>
          </div>
          <input
            type="range"
            min={2}
            max={49}
            step={1}
            value={state.weightKg}
            onChange={(e) => update('weightKg', parseInt(e.target.value, 10))}
            style={{ width: '100%', accentColor: 'oklch(0.62 0.22 22)' }}
          />
          <div className="mt-3">
            <Segmented
              value={state.activity}
              onChange={(v) => update('activity', v)}
              ariaLabel="Activity"
              options={[
                { value: 'active', label: 'Active 130×kg^0.75' },
                { value: 'inactive', label: 'Inactive 95×kg^0.75' },
              ]}
            />
          </div>
        </Glass>

        <Glass radius={22} padding={18} style={{ marginBottom: 14 }}>
          <Eyebrow>Body condition (BCS)</Eyebrow>
          <div
            className="grid"
            style={{
              gridTemplateColumns: 'repeat(9, 1fr)',
              gap: 4,
              marginBottom: 10,
            }}
          >
            {BCS_LEVELS.map((l) => {
              const active = l.score === state.bcs;
              return (
                <button
                  key={l.score}
                  onClick={() => update('bcs', l.score)}
                  style={{
                    border: 'none',
                    cursor: 'pointer',
                    height: 36,
                    borderRadius: 10,
                    background: active
                      ? `linear-gradient(180deg, ${l.color}, ${l.color})`
                      : 'rgba(60,20,15,0.06)',
                    color: active ? '#fff' : 'var(--pbt-text)',
                    fontFamily: 'var(--pbt-font-mono)',
                    fontSize: 13,
                    fontWeight: 700,
                    transition: 'all 0.2s',
                  }}
                  aria-label={`BCS ${l.score}: ${l.label}`}
                  aria-pressed={active}
                >
                  {l.score}
                </button>
              );
            })}
          </div>
          {bcsLevel && (
            <div
              style={{
                fontSize: 13,
                lineHeight: 1.5,
                padding: '10px 12px',
                borderRadius: 14,
                background: `color-mix(in oklab, ${bcsLevel.color} 14%, transparent)`,
                color: 'var(--pbt-text)',
              }}
            >
              <strong>{bcsLevel.label}.</strong> {bcsLevel.description}
            </div>
          )}
        </Glass>

        <Glass radius={22} padding={18} style={{ marginBottom: 14 }}>
          <Eyebrow>Muscle condition (MCS)</Eyebrow>
          <div className="grid grid-cols-2 gap-2">
            {MCS_LEVELS.map((m) => {
              const active = m.key === state.mcs;
              return (
                <button
                  key={m.key}
                  onClick={() => update('mcs', m.key)}
                  style={{
                    cursor: 'pointer',
                    padding: '12px 14px',
                    borderRadius: 16,
                    textAlign: 'left',
                    background: active
                      ? `color-mix(in oklab, ${m.color} 28%, transparent)`
                      : 'rgba(255,255,255,0.5)',
                    color: 'var(--pbt-text)',
                    border: active
                      ? `1px solid ${m.color}`
                      : '0.5px solid rgba(255,255,255,0.7)',
                    transition: 'all 0.2s',
                  }}
                  aria-pressed={active}
                >
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{m.label}</div>
                  <div
                    style={{
                      fontSize: 11,
                      color: 'var(--pbt-text-muted)',
                      marginTop: 2,
                    }}
                  >
                    {m.description}
                  </div>
                </button>
              );
            })}
          </div>
        </Glass>

        <Glass
          radius={22}
          padding={20}
          glow={verdictColor}
          style={{ marginBottom: 14 }}
        >
          <Eyebrow>Calorie target & verdict</Eyebrow>
          <div className="flex items-baseline gap-3 mb-3">
            <span style={{ fontSize: 38, fontWeight: 600 }}>
              {calorieTarget}
            </span>
            <span style={{ fontSize: 14, color: 'var(--pbt-text-muted)' }}>
              kcal/day
            </span>
            {bcsLevel && (
              <span
                style={{
                  marginLeft: 'auto',
                  padding: '4px 10px',
                  borderRadius: 9999,
                  background: `color-mix(in oklab, ${bcsLevel.color} 24%, transparent)`,
                  color: bcsLevel.color,
                  fontFamily: 'var(--pbt-font-mono)',
                  fontSize: 11,
                  fontWeight: 700,
                }}
              >
                BCS {bcsLevel.score}/9
              </span>
            )}
          </div>
          <div
            style={{
              padding: '10px 12px',
              borderRadius: 14,
              background: `color-mix(in oklab, ${verdictColor} 14%, transparent)`,
              fontSize: 13.5,
              lineHeight: 1.5,
              color: 'var(--pbt-text)',
            }}
          >
            <Eyebrow>{verdictResult.verdict.toUpperCase()}</Eyebrow>
            {verdictResult.message}
          </div>
        </Glass>

        <Glass radius={22} padding={16}>
          <div className="flex items-center gap-2 mb-2">
            <Icon.book />
            <Eyebrow>Reference (WSAVA · 2006 NRC DMER)</Eyebrow>
          </div>
          <div style={{ fontSize: 13, color: 'var(--pbt-text-muted)' }}>
            Closest row: <strong>{reference.weightKg} kg</strong> →{' '}
            {reference.activeKcal} kcal active · {reference.inactiveKcal} kcal
            inactive
          </div>
        </Glass>

        <div style={{ height: 100 }} />
      </Page>
      <div
        className="fixed bottom-0 left-1/2 z-30 w-full max-w-[440px] -translate-x-1/2 px-5"
        style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 18px)' }}
      >
        <PillButton
          size="lg"
          fullWidth
          icon={saved ? <Icon.check /> : <Icon.paw />}
          onClick={() => {
            savePet(state);
            setSaved(true);
            setTimeout(() => setSaved(false), 2000);
          }}
          style={saved ? { opacity: 0.7 } : undefined}
        >
          {saved ? 'Saved to profiles' : 'Save as profile'}
        </PillButton>
      </div>
    </>
  );
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontFamily: 'var(--pbt-font-mono)',
        fontSize: 10,
        letterSpacing: '0.18em',
        textTransform: 'uppercase',
        color: 'var(--pbt-text-muted)',
        marginBottom: 8,
        fontWeight: 700,
      }}
    >
      {children}
    </div>
  );
}
