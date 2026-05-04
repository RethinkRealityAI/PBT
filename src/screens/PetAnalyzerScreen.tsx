import { useState } from 'react';
import { motion } from 'framer-motion';
import { Glass } from '../design-system/Glass';
import { Icon } from '../design-system/Icon';
import { Chip } from '../design-system/Chip';
import { PillButton } from '../design-system/PillButton';
import { TopBar } from '../shell/TopBar';
import { Page } from '../shell/Page';
import { usePetAnalyzer } from '../features/pet-analyzer/usePetAnalyzer';
import { useSavedPets } from '../features/pet-analyzer/useSavedPets';
import { BREEDS } from '../data/scenarios';
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
  const isCustomBreed = !BREEDS.includes(state.breed);

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
                    background: 'rgba(255,255,255,0.28)',
                    border: '1px solid rgba(255,255,255,0.5)',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'var(--pbt-text)',
                    flexShrink: 0,
                  }}
                >
                  <Icon.paw />
                </div>
                <input
                  value={state.name}
                  onChange={(e) => update('name', e.target.value)}
                  placeholder="Pet name"
                  style={{
                    border: 'none',
                    outline: 'none',
                    background: 'transparent',
                    fontFamily: 'inherit',
                    fontSize: 18,
                    fontWeight: 700,
                    color: 'var(--pbt-text)',
                    flex: 1,
                    minWidth: 0,
                  }}
                />
              </div>

              {/* Breed section */}
              <Eyebrow>Breed</Eyebrow>
              <motion.div
                className="flex flex-wrap gap-2 mb-2"
                initial="hidden"
                animate="visible"
                variants={{ visible: { transition: { staggerChildren: 0.05 } } }}
              >
                {BREEDS.map((b) => (
                  <motion.div
                    key={b}
                    variants={{
                      hidden: { opacity: 0, scale: 0.8 },
                      visible: { opacity: 1, scale: 1, transition: { duration: 0.18 } },
                    }}
                  >
                    <Chip active={state.breed === b} onClick={() => update('breed', b)}>
                      {b}
                    </Chip>
                  </motion.div>
                ))}
                <motion.div
                  variants={{
                    hidden: { opacity: 0, scale: 0.8 },
                    visible: { opacity: 1, scale: 1, transition: { duration: 0.18 } },
                  }}
                >
                  <Chip
                    active={isCustomBreed}
                    onClick={() => { if (!isCustomBreed) update('breed', ''); }}
                  >
                    Other
                  </Chip>
                </motion.div>
              </motion.div>

              {/* Custom breed input — always gets a proper glass border */}
              {isCustomBreed && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    marginTop: 8,
                    padding: '9px 13px',
                    borderRadius: 14,
                    border: '1px solid rgba(255,255,255,0.55)',
                    background: 'rgba(255,255,255,0.38)',
                    backdropFilter: 'blur(12px)',
                    WebkitBackdropFilter: 'blur(12px)',
                    boxShadow: '0 1px 0 rgba(255,255,255,0.9) inset',
                  }}
                >
                  <Icon.search />
                  <input
                    value={state.breed}
                    onChange={(e) => update('breed', e.target.value)}
                    placeholder="Type any breed"
                    autoFocus
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
            max={49}
            step={1}
            value={state.weightKg}
            onChange={(e) => update('weightKg', parseInt(e.target.value, 10))}
            style={{ width: '100%', accentColor: 'oklch(0.62 0.22 22)', marginBottom: 16 }}
          />

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
                      ? '1px solid oklch(0.62 0.22 22)'
                      : '1px solid rgba(255,255,255,0.50)',
                    background: active
                      ? 'linear-gradient(135deg, oklch(0.96 0.04 20), oklch(0.93 0.06 22))'
                      : 'rgba(255,255,255,0.22)',
                    backdropFilter: 'blur(18px) saturate(240%) brightness(1.02)',
                    WebkitBackdropFilter: 'blur(18px) saturate(240%) brightness(1.02)',
                    boxShadow: active
                      ? '0 1px 0 rgba(255,255,255,0.95) inset, 0 10px 24px -10px oklch(0.62 0.22 22 / 0.28)'
                      : '0 1px 0 rgba(255,255,255,0.85) inset, 0 4px 12px -6px rgba(60,20,15,0.06)',
                    transition: 'all 0.2s ease',
                  }}
                  aria-pressed={active}
                >
                  <div
                    style={{
                      fontWeight: 700,
                      fontSize: 15,
                      color: active ? 'oklch(0.50 0.22 18)' : 'var(--pbt-text)',
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
                      color: active ? 'oklch(0.62 0.14 22)' : 'var(--pbt-text-muted)',
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
                      ? `color-mix(in oklab, ${m.color} 22%, rgba(255,255,255,0.5))`
                      : 'rgba(255,255,255,0.22)',
                    backdropFilter: 'blur(18px) saturate(240%) brightness(1.02)',
                    WebkitBackdropFilter: 'blur(18px) saturate(240%) brightness(1.02)',
                    boxShadow: active
                      ? `0 1px 0 rgba(255,255,255,0.9) inset, 0 6px 18px -8px color-mix(in oklab, ${m.color} 45%, transparent)`
                      : '0 1px 0 rgba(255,255,255,0.85) inset, 0 4px 12px -6px rgba(60,20,15,0.06)',
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
                  border: `1px solid color-mix(in oklab, ${bcsLevel.color} 55%, transparent)`,
                  background: `color-mix(in oklab, ${bcsLevel.color} 20%, rgba(255,255,255,0.35))`,
                  backdropFilter: 'blur(12px)',
                  WebkitBackdropFilter: 'blur(12px)',
                  boxShadow: '0 1px 0 rgba(255,255,255,0.8) inset, 0 4px 10px -4px rgba(60,20,15,0.08)',
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
        <Glass radius={22} padding={16}>
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
        className="fixed bottom-0 left-1/2 z-30 w-full max-w-[var(--pbt-layout-max)] -translate-x-1/2 px-5 lg:left-[240px] lg:right-0 lg:translate-x-0 lg:max-w-none"
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
