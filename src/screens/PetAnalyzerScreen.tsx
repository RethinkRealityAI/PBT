import { useState } from 'react';
import { Glass } from '../design-system/Glass';
import { Icon } from '../design-system/Icon';
import { PillButton } from '../design-system/PillButton';
import { TopBar } from '../shell/TopBar';
import { Page } from '../shell/Page';
import { usePetAnalyzer } from '../features/pet-analyzer/usePetAnalyzer';
import { useSavedPets } from '../features/pet-analyzer/useSavedPets';
import { BreedSearch } from '../features/pet-analyzer/BreedSearch';
import { isWeightPlausibleFor, resolveBreed } from '../data/breeds';
import { BCS_LEVELS } from '../data/bcsLevels';
import { MCS_LEVELS } from '../data/mcsLevels';
import { COLORS } from '../design-system/tokens';

export function PetAnalyzerScreen() {
  const { state, update, calorieTarget, reference, verdictResult } = usePetAnalyzer();
  const { savePet } = useSavedPets();
  const [saved, setSaved] = useState(false);
  const verdictColor =
    verdictResult.verdict === 'good'
      ? COLORS.score.good
      : verdictResult.verdict === 'warn'
        ? COLORS.score.poor
        : COLORS.score.ok;

  const bcsLevel = BCS_LEVELS.find((l) => l.score === state.bcs);
  // Weight outside the breed's typical range → soft hint (not a hard error).
  const weightPlausible = isWeightPlausibleFor(state.breed, state.weightKg);
  const breedEntry = resolveBreed(state.breed);
  const canSave = state.breed.trim().length > 0;

  return (
    <>
      <TopBar showBack title="Pet Analyzer" />
      <Page>
        {/*
         * Two-column grid on desktop.
         * Left: Pet name + breed + weight + BCS.
         * Right: MCS + calorie target + verdict + reference.
         * On mobile: single column, same order as before.
         */}
        <div className="lg:grid lg:grid-cols-2 lg:gap-8 lg:items-start">

        {/* ── Left column ── */}
        <div>

        {/* ── Card 1: Pet name + Breed ── */}
        <Glass
          radius={22}
          padding={0}
          style={{ marginBottom: 14, overflow: 'hidden' }}
        >
          {/* Outer wrapper — everything is positioned relative to this */}
          <div style={{ position: 'relative', minHeight: 230 }}>

            {/* Background image — absolute, top-right, no blur, no harsh line */}
            <div
              aria-hidden
              style={{
                position: 'absolute',
                top: 0,
                right: 0,
                width: '62%',
                height: '100%',
                zIndex: 0,
                overflow: 'hidden',
              }}
            >
              {/* Left-side gradient fade so content overlays cleanly */}
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  background:
                    'linear-gradient(to right, var(--pbt-canvas, white) 0%, transparent 44%)',
                  zIndex: 2,
                  pointerEvents: 'none',
                }}
              />
              {/* Bottom-side fade */}
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  background:
                    'linear-gradient(to bottom, transparent 55%, var(--pbt-canvas, white) 100%)',
                  zIndex: 2,
                  pointerEvents: 'none',
                }}
              />
              <img
                src="/Pet_analyzer_background_image_-removebg-preview.png"
                alt=""
                decoding="async"
                style={{
                  position: 'absolute',
                  top: 0,
                  right: 0,
                  width: '105%',
                  height: '100%',
                  objectFit: 'contain',
                  objectPosition: 'right top',
                  zIndex: 1,
                  // No blur, no scale transform — crisp image
                }}
              />
            </div>

            {/* Content layer — full width, overlays the image */}
            <div style={{ position: 'relative', zIndex: 1, padding: 18 }}>
              {/* Pet name row */}
              <div className="flex items-center gap-3 mb-4">
                <div
                  style={{
                    width: 42,
                    height: 42,
                    borderRadius: '50%',
                    background: 'color-mix(in oklab, var(--pbt-driver-primary) 16%, rgba(255,255,255,0.06))',
                    border: '1px solid color-mix(in oklab, var(--pbt-driver-primary) 42%, rgba(255,255,255,0.45))',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'var(--pbt-driver-primary)',
                    flexShrink: 0,
                    backdropFilter: 'blur(12px) saturate(220%)',
                    WebkitBackdropFilter: 'blur(12px) saturate(220%)',
                    boxShadow: '0 1px 0 rgba(255,255,255,0.35) inset',
                  }}
                >
                  <Icon.paw />
                </div>
                <div
                  style={{
                    flex: 1,
                    minWidth: 0,
                    borderRadius: 16,
                    padding: '11px 15px',
                    border: '1.5px solid color-mix(in oklab, var(--pbt-driver-primary) 52%, rgba(255,255,255,0.38))',
                    background: 'color-mix(in oklab, var(--pbt-driver-primary) 11%, rgba(255,255,255,0.05))',
                    backdropFilter: 'blur(18px) saturate(280%)',
                    WebkitBackdropFilter: 'blur(18px) saturate(280%)',
                    boxShadow:
                      '0 1px 0 rgba(255,255,255,0.32) inset, 0 0 0 1px rgba(255,255,255,0.05) inset, 0 6px 20px -8px color-mix(in oklab, var(--pbt-driver-primary) 22%, transparent)',
                  }}
                >
                  <input
                    value={state.name}
                    onChange={(e) => update('name', e.target.value)}
                    placeholder="Pet name"
                    aria-label="Pet name"
                    style={{
                      width: '100%',
                      border: 'none',
                      outline: 'none',
                      background: 'transparent',
                      fontFamily: 'inherit',
                      fontSize: 18,
                      fontWeight: 700,
                      color: 'var(--pbt-text)',
                    }}
                  />
                </div>
              </div>

              {/* Breed section */}
              <Eyebrow>Breed</Eyebrow>
              <BreedSearch
                value={state.breed}
                onChange={(v) => update('breed', v)}
                onSelectBreed={(entry) => {
                  // Auto-pre-fill weight to the midpoint of the breed's typical
                  // adult range when the user picks a known breed and hasn't
                  // already dialled in something specific. Keeps the analyzer
                  // immediately useful — most users won't know exact kg.
                  if (entry && state.weightKg === 12) {
                    const midpoint = Math.round((entry.sizeKg[0] + entry.sizeKg[1]) / 2);
                    update('weightKg', midpoint);
                  }
                }}
              />
              {breedEntry && (
                <div
                  style={{
                    marginTop: 8,
                    fontSize: 11,
                    color: 'var(--pbt-text-muted)',
                    fontFamily: 'var(--pbt-font-mono)',
                    letterSpacing: '0.06em',
                  }}
                >
                  {breedEntry.group} group · typical adult{' '}
                  {breedEntry.sizeKg[0]}–{breedEntry.sizeKg[1]} kg
                </div>
              )}
            </div>
          </div>
        </Glass>

        {/* ── Card 2: Weight & activity ── */}
        <Glass radius={22} padding={18} style={{ marginBottom: 14 }}>
          <Eyebrow>Weight &amp; activity</Eyebrow>
          <div className="flex items-baseline gap-2 mb-4">
            <span style={{ fontSize: 40, fontWeight: 700, letterSpacing: '-0.03em' }}>
              {state.weightKg}
            </span>
            <span style={{ fontSize: 15, color: 'var(--pbt-text-muted)' }}>
              kg
            </span>
          </div>
          <input
            type="range"
            min={2}
            max={90}
            step={1}
            value={state.weightKg}
            onChange={(e) => update('weightKg', parseInt(e.target.value, 10))}
            style={{ width: '100%', accentColor: 'var(--pbt-driver-primary)', marginBottom: 16 }}
          />
          {breedEntry && !weightPlausible && (
            <div
              style={{
                marginTop: -8,
                marginBottom: 16,
                padding: '8px 11px',
                borderRadius: 10,
                fontSize: 12,
                color: 'var(--pbt-text)',
                background: `color-mix(in oklab, ${COLORS.score.poor} 12%, rgba(255,255,255,0.4))`,
                border: `1px solid color-mix(in oklab, ${COLORS.score.poor} 30%, transparent)`,
              }}
            >
              {state.weightKg} kg is unusual for a {breedEntry.name}
              {' '}— typical adults are {breedEntry.sizeKg[0]}–{breedEntry.sizeKg[1]} kg.
              Double-check before recommending a calorie target.
            </div>
          )}

          {/* Activity selector — full-width glass cards, readable text */}
          <div className="grid grid-cols-2 gap-2">
            {(['active', 'inactive'] as const).map((act) => {
              const active = state.activity === act;
              return (
                <button
                  key={act}
                  type="button"
                  onClick={() => update('activity', act)}
                  style={{
                    cursor: 'pointer',
                    padding: '13px 16px',
                    borderRadius: 18,
                    textAlign: 'left',
                    border: active
                      ? '1px solid color-mix(in oklab, var(--pbt-driver-primary) 58%, rgba(255,255,255,0.38))'
                      : '1px solid rgba(255,255,255,0.50)',
                    background: active
                      ? 'color-mix(in oklab, var(--pbt-driver-primary) 17%, rgba(255,255,255,0.06))'
                      : 'rgba(255,255,255,0.22)',
                    backdropFilter: 'blur(18px) saturate(240%) brightness(1.02)',
                    WebkitBackdropFilter: 'blur(18px) saturate(240%) brightness(1.02)',
                    boxShadow: active
                      ? '0 1px 0 rgba(255,255,255,0.95) inset, 0 10px 24px -10px color-mix(in oklab, var(--pbt-driver-primary) 30%, transparent)'
                      : '0 1px 0 rgba(255,255,255,0.85) inset, 0 4px 12px -6px rgba(0,0,0,0.08)',
                    transition: 'all 0.2s ease',
                  }}
                  aria-pressed={active}
                >
                  <div
                    style={{
                      fontWeight: 700,
                      fontSize: 15,
                      color: 'var(--pbt-text)',
                      marginBottom: 3,
                    }}
                  >
                    {act === 'active' ? 'Active' : 'Inactive'}
                  </div>
                  <div
                    style={{
                      fontFamily: 'var(--pbt-font-mono)',
                      fontSize: 10,
                      letterSpacing: '0.08em',
                      color: 'var(--pbt-text-muted)',
                    }}
                  >
                    {act === 'active' ? '130 × kg^0.75' : '95 × kg^0.75'}
                  </div>
                </button>
              );
            })}
          </div>
        </Glass>

        {/* ── Card 3: Body condition (BCS) ── */}
        <Glass radius={22} padding={18} style={{ marginBottom: 14 }}>
          <Eyebrow>Body condition (BCS)</Eyebrow>
          <div
            className="grid"
            style={{ gridTemplateColumns: 'repeat(9, 1fr)', gap: 4, marginBottom: 10 }}
          >
            {BCS_LEVELS.map((l) => {
              const active = l.score === state.bcs;
              return (
                <button
                  key={l.score}
                  onClick={() => update('bcs', l.score)}
                  style={{
                    border: active ? 'none' : '1px solid rgba(255,255,255,0.45)',
                    cursor: 'pointer',
                    height: 36,
                    borderRadius: 10,
                    background: active
                      ? `linear-gradient(180deg, ${l.color}, ${l.color})`
                      : 'rgba(255,255,255,0.22)',
                    backdropFilter: active ? undefined : 'blur(12px) saturate(200%)',
                    WebkitBackdropFilter: active ? undefined : 'blur(12px) saturate(200%)',
                    boxShadow: active
                      ? `0 4px 12px -6px color-mix(in oklab, ${l.color} 60%, transparent)`
                      : '0 1px 0 rgba(255,255,255,0.80) inset',
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
                lineHeight: 1.55,
                padding: '11px 13px',
                borderRadius: 14,
                border: `1px solid color-mix(in oklab, ${bcsLevel.color} 35%, rgba(255,255,255,0.3))`,
                background: `color-mix(in oklab, ${bcsLevel.color} 14%, rgba(255,255,255,0.35))`,
                backdropFilter: 'blur(12px)',
                WebkitBackdropFilter: 'blur(12px)',
                color: 'var(--pbt-text)',
              }}
            >
              <strong>{bcsLevel.label}.</strong> {bcsLevel.description}
            </div>
          )}
        </Glass>

        </div>{/* end left column */}

        {/* ── Right column ── */}
        <div>

        {/* ── Card 4: Muscle condition (MCS) ── */}
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
                    border: active
                      ? `1px solid ${m.color}`
                      : '1px solid rgba(255,255,255,0.50)',
                    background: active
                      ? `color-mix(in oklab, ${m.color} 26%, rgba(255,255,255,0.12))`
                      : 'rgba(255,255,255,0.22)',
                    backdropFilter: 'blur(18px) saturate(240%) brightness(1.02)',
                    WebkitBackdropFilter: 'blur(18px) saturate(240%) brightness(1.02)',
                    boxShadow: active
                      ? `0 1px 0 rgba(255,255,255,0.9) inset, 0 6px 18px -8px color-mix(in oklab, ${m.color} 45%, transparent)`
                      : '0 1px 0 rgba(255,255,255,0.85) inset, 0 4px 12px -6px rgba(0,0,0,0.08)',
                    color: 'var(--pbt-text)',
                    transition: 'all 0.2s',
                  }}
                  aria-pressed={active}
                >
                  <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 2 }}>{m.label}</div>
                  <div style={{ fontSize: 11, color: 'var(--pbt-text-muted)', lineHeight: 1.4 }}>
                    {m.description}
                  </div>
                </button>
              );
            })}
          </div>
        </Glass>

        {/* ── Card 5: Calorie target & verdict ── */}
        <Glass
          radius={22}
          padding={20}
          glow={verdictColor}
          style={{ marginBottom: 14 }}
        >
          <Eyebrow>Calorie target &amp; verdict</Eyebrow>
          <div className="flex items-baseline gap-3 mb-3">
            <span style={{ fontSize: 42, fontWeight: 700, letterSpacing: '-0.03em' }}>
              {calorieTarget}
            </span>
            <span style={{ fontSize: 14, color: 'var(--pbt-text-muted)' }}>
              kcal/day
            </span>
            {bcsLevel && (
              <span
                style={{
                  marginLeft: 'auto',
                  padding: '5px 12px',
                  borderRadius: 9999,
                  border: `1px solid color-mix(in oklab, ${bcsLevel.color} 65%, white)`,
                  background: `linear-gradient(180deg, color-mix(in oklab, ${bcsLevel.color} 68%, black), color-mix(in oklab, ${bcsLevel.color} 52%, black))`,
                  backdropFilter: 'blur(12px)',
                  WebkitBackdropFilter: 'blur(12px)',
                  boxShadow:
                    '0 1px 0 rgba(255,255,255,0.35) inset, 0 4px 10px -4px rgba(0,0,0,0.22)',
                  color: '#fff',
                  fontFamily: 'var(--pbt-font-mono)',
                  fontSize: 11,
                  fontWeight: 700,
                  textShadow: '0 1px 2px rgba(0,0,0,0.35)',
                }}
              >
                BCS {bcsLevel.score}/9
              </span>
            )}
          </div>
          <div
            style={{
              padding: '11px 13px',
              borderRadius: 14,
              border: `1px solid color-mix(in oklab, ${verdictColor} 35%, rgba(255,255,255,0.3))`,
              background: `color-mix(in oklab, ${verdictColor} 14%, rgba(255,255,255,0.35))`,
              backdropFilter: 'blur(12px)',
              WebkitBackdropFilter: 'blur(12px)',
              boxShadow: '0 1px 0 rgba(255,255,255,0.8) inset',
              fontSize: 13.5,
              lineHeight: 1.5,
              color: 'var(--pbt-text)',
            }}
          >
            <Eyebrow>{verdictResult.verdict.toUpperCase()}</Eyebrow>
            {verdictResult.message}
          </div>
        </Glass>

        {/* ── Card 6: Reference ── */}
        <Glass
          radius={22}
          padding={16}
          blur={32}
          glow={null}
          style={{
            border: '1px solid color-mix(in oklab, var(--pbt-driver-primary) 22%, var(--pbt-glass-border))',
          }}
        >
          <div className="flex items-center gap-2 mb-2">
            <Icon.book />
            <Eyebrow>Reference (WSAVA · 2006 NRC DMER)</Eyebrow>
          </div>
          <div style={{ fontSize: 13, color: 'var(--pbt-text-muted)' }}>
            Closest row: <strong>{reference.weightKg} kg</strong> →{' '}
            {reference.activeKcal} kcal active · {reference.inactiveKcal} kcal inactive
          </div>
        </Glass>

        <div style={{ height: 100 }} className="lg:hidden" />
        </div>{/* end right column */}
        </div>{/* end two-column grid */}
      </Page>

      <div
        className="fixed bottom-0 left-1/2 z-30 w-full max-w-[var(--pbt-layout-max)] -translate-x-1/2 px-5 lg:left-auto lg:right-8 lg:bottom-8 lg:w-[280px] lg:max-w-none lg:translate-x-0 lg:px-0"
        style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 18px)' }}
      >
        <PillButton
          size="lg"
          fullWidth
          icon={saved ? <Icon.check /> : <Icon.paw />}
          disabled={!canSave || saved}
          onClick={() => {
            if (!canSave) return;
            savePet(state);
            setSaved(true);
            setTimeout(() => setSaved(false), 2000);
          }}
          style={saved ? { opacity: 0.7 } : undefined}
        >
          {saved
            ? 'Saved to profiles'
            : canSave
              ? 'Save as profile'
              : 'Pick a breed first'}
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
