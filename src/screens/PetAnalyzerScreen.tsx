import { useState } from 'react';
import { Glass } from '../design-system/Glass';
import { Icon } from '../design-system/Icon';
import { PillButton } from '../design-system/PillButton';
import { TopBar } from '../shell/TopBar';
import { Page } from '../shell/Page';
import { usePetAnalyzer, type PetState } from '../features/pet-analyzer/usePetAnalyzer';
import {
  petStateEquals,
  savedPetToPetState,
  useSavedPets,
  type SavedPet,
  type VisionSaveMeta,
} from '../features/pet-analyzer/useSavedPets';
import { usePetVision } from '../features/pet-analyzer/usePetVision';
import {
  DERM_SEVERITY_KEY,
  PetVisionCard,
} from '../features/pet-analyzer/PetVisionCard';
import { BreedSearch } from '../features/pet-analyzer/BreedSearch';
import { isWeightPlausibleFor, resolveBreed } from '../data/breeds';
import { BCS_LEVELS } from '../data/bcsLevels';
import { MCS_LEVELS } from '../data/mcsLevels';
import { COLORS } from '../design-system/tokens';
import { useNavigation } from '../app/providers/NavigationProvider';
import { useScenario } from '../app/providers/ScenarioProvider';
import { useTheme } from '../app/providers/ThemeProvider';
import { useT, type TFunction } from '../i18n/useT';
import { useLanguage } from '../app/providers/LanguageProvider';
import { translate } from '../i18n/translate';
import type { Locale } from '../i18n/locales';
import { localizedBcsLevel, localizedMcsLevel } from '../i18n/dataL10n/clinical';
import { PUSHBACK_CATEGORIES, type Scenario } from '../data/scenarios';
import {
  visionLifeStageToLabel,
  type PetVisionResult,
} from '../services/petVisionService';

/** Build a training scenario from a vision analysis so the analyzed pet
 *  flows straight into a roleplay (the "feeds into the platform" handoff). */
function scenarioFromVision(
  breed: string,
  weightKg: number,
  result: PetVisionResult,
  locale: Locale,
): Scenario {
  const pushbackId =
    result.bcs >= 7
      ? 'weight-denial'
      : result.dermatitis.severity !== 'none'
        ? 'rx-diet'
        : 'cost';
  const pushback =
    PUSHBACK_CATEGORIES.find((p) => p.id === pushbackId) ?? PUSHBACK_CATEGORIES[0];
  // The context brief is read by the trainee (chat scenario panel) as well as
  // the roleplay model, so it follows the app locale like every other visible
  // string. Breed names stay canonical (glossary), and `ageEstimate` is
  // already produced in the app locale by the vision service.
  const contextBits = [
    translate(locale, 'analyzer.vision.context.pet', {
      breed: breed || result.breed,
      age: result.ageEstimate,
    }),
    translate(locale, 'analyzer.vision.context.bcs', { score: result.bcs }),
  ];
  if (result.dermatitis.severity !== 'none') {
    contextBits.push(
      translate(locale, 'analyzer.vision.context.skin', {
        severity: translate(
          locale,
          DERM_SEVERITY_KEY[result.dermatitis.severity] ?? DERM_SEVERITY_KEY.none,
        ),
        details:
          result.dermatitis.indicators.join(', ') || result.dermatitis.note,
      }),
    );
  }
  return {
    breed: breed || result.breed,
    age: visionLifeStageToLabel(result.lifeStage),
    pushback,
    persona: 'Devoted',
    difficulty: 2,
    context: contextBits.join(' '),
    suggestedDriver: 'Harmonizer',
    weightKg: String(weightKg),
  };
}

export function PetAnalyzerScreen() {
  const { state, update, load, calorieTarget, reference, verdictResult } =
    usePetAnalyzer();
  const { savedPets, savePet, deletePet } = useSavedPets();
  const vision = usePetVision();
  const { go } = useNavigation();
  const { setScenario } = useScenario();
  const t = useT();
  const { locale } = useLanguage();
  const [saved, setSaved] = useState(false);
  // Inline delete confirmation, one row at a time. No browser confirm().
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Vision provenance to attach on save — present once a photo has been
  // analysed (and the user may have edited the seeded fields afterwards).
  const visionMeta: VisionSaveMeta | undefined =
    vision.status === 'done' && vision.result?.isDog
      ? {
          ageEstimate: vision.result.ageEstimate,
          breedConfidence: vision.result.breedConfidence,
          lifeStage: vision.result.lifeStage,
          dermatitis: vision.result.dermatitis,
        }
      : undefined;

  const handleVisionPick = async (file: File) => {
    const r = await vision.analyzeFile(file);
    // Seed the editable fields from the estimate; the user can override any
    // of them before saving.
    if (r?.isDog) {
      if (r.breed && r.breed !== 'Unknown') {
        update('breed', r.breed);
        // Weight can't be read from a photo. If the detected breed is one we
        // know and the user hasn't dialled in a weight yet (still the 12 kg
        // default), seed the breed midpoint so the calorie target is
        // meaningful — same heuristic BreedSearch uses on manual selection.
        const entry = resolveBreed(r.breed);
        if (entry && state.weightKg === 12) {
          update('weightKg', Math.round((entry.sizeKg[0] + entry.sizeKg[1]) / 2));
        }
      }
      update('bcs', r.bcs);
    }
  };
  const handleLoadPet = (pet: SavedPet) => {
    load(savedPetToPetState(pet));
    // A saved profile supersedes whatever photo is on screen. Without this the
    // stale vision provenance would ride along on the next save, and the
    // "Train with this pet" handoff would describe a different animal.
    vision.reset();
    setConfirmDeleteId(null);
  };

  const handleDeletePet = (id: string) => {
    deletePet(id);
    setConfirmDeleteId(null);
    // Nothing else to unwind: analyzer state is independent of the list, and
    // the "loaded" marker is derived, so it just stops matching.
  };

  const verdictColor =
    verdictResult.verdict === 'good'
      ? COLORS.score.good
      : verdictResult.verdict === 'warn'
        ? COLORS.score.poor
        : COLORS.score.ok;

  const bcsLevelRaw = BCS_LEVELS.find((l) => l.score === state.bcs);
  const bcsLevel = bcsLevelRaw ? localizedBcsLevel(bcsLevelRaw, locale) : bcsLevelRaw;
  // Weight outside the breed's typical range → soft hint (not a hard error).
  const weightPlausible = isWeightPlausibleFor(state.breed, state.weightKg);
  const breedEntry = resolveBreed(state.breed);
  const canSave = state.breed.trim().length > 0;

  return (
    <>
      <TopBar showBack title={t('analyzer.title')} />
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

        {/* ── Card 0: Photo analysis (AI vision) ── */}
        <PetVisionCard vision={vision} onPick={handleVisionPick} />

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
                    placeholder={t('analyzer.petName')}
                    aria-label={t('analyzer.petName')}
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
              <Eyebrow>{t('analyzer.breed.label')}</Eyebrow>
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
                  {t('analyzer.breed.typical', {
                    group: breedEntry.group,
                    min: breedEntry.sizeKg[0],
                    max: breedEntry.sizeKg[1],
                  })}
                </div>
              )}
            </div>
          </div>
        </Glass>

        {/* ── Card 2: Weight & activity ── */}
        <Glass radius={22} padding={18} style={{ marginBottom: 14 }}>
          <Eyebrow>{t('analyzer.weight.label')}</Eyebrow>
          <div className="flex items-baseline gap-2 mb-4">
            <span style={{ fontSize: 40, fontWeight: 700, letterSpacing: '-0.03em' }}>
              {state.weightKg}
            </span>
            <span style={{ fontSize: 15, color: 'var(--pbt-text-muted)' }}>
              {t('analyzer.weight.unit')}
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
              {t('analyzer.weight.implausible', {
                weight: state.weightKg,
                breed: breedEntry.name,
                min: breedEntry.sizeKg[0],
                max: breedEntry.sizeKg[1],
              })}
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
                    {act === 'active'
                      ? t('analyzer.activity.active')
                      : t('analyzer.activity.inactive')}
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
          <Eyebrow>{t('analyzer.bcs.label')}</Eyebrow>
          <div
            className="grid"
            style={{ gridTemplateColumns: 'repeat(9, 1fr)', gap: 4, marginBottom: 10 }}
          >
            {BCS_LEVELS.map((rawLevel) => {
              const l = localizedBcsLevel(rawLevel, locale);
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
                  aria-label={t('analyzer.bcs.buttonAria', {
                    score: l.score,
                    label: l.label,
                  })}
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
          <Eyebrow>{t('analyzer.mcs.label')}</Eyebrow>
          <div className="grid grid-cols-2 gap-2">
            {MCS_LEVELS.map((rawLevel) => {
              const m = localizedMcsLevel(rawLevel, locale);
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
          <Eyebrow>{t('analyzer.calorie.label')}</Eyebrow>
          <div className="flex items-baseline gap-3 mb-3">
            <span style={{ fontSize: 42, fontWeight: 700, letterSpacing: '-0.03em' }}>
              {calorieTarget}
            </span>
            <span style={{ fontSize: 14, color: 'var(--pbt-text-muted)' }}>
              {t('analyzer.calorie.unit')}
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
                {t('analyzer.calorie.bcsChip', { score: bcsLevel.score })}
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
            <Eyebrow>
              {verdictResult.verdict === 'good'
                ? t('analyzer.verdict.good')
                : verdictResult.verdict === 'warn'
                  ? t('analyzer.verdict.warn')
                  : t('analyzer.verdict.ok')}
            </Eyebrow>
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
            <Eyebrow>{t('analyzer.reference.label')}</Eyebrow>
          </div>
          <div style={{ fontSize: 13, color: 'var(--pbt-text-muted)' }}>
            {t('analyzer.reference.closestRow')}{' '}
            <strong>
              {reference.weightKg} {t('analyzer.weight.unit')}
            </strong>{' '}
            →{' '}
            {t('analyzer.reference.kcalSplit', {
              active: reference.activeKcal,
              inactive: reference.inactiveKcal,
            })}
          </div>
        </Glass>

        {/* ── Card 7: Saved pets ── (renders only when there is at least one) */}
        <SavedPetsCard
          pets={savedPets}
          currentState={state}
          confirmDeleteId={confirmDeleteId}
          onRequestDelete={setConfirmDeleteId}
          onConfirmDelete={handleDeletePet}
          onLoad={handleLoadPet}
          t={t}
        />

        <div style={{ height: 100 }} className="lg:hidden" />
        </div>{/* end right column */}
        </div>{/* end two-column grid */}
      </Page>

      <div
        className="fixed bottom-0 left-1/2 z-30 flex w-full max-w-[var(--pbt-layout-max)] -translate-x-1/2 flex-col gap-2 px-5 lg:left-auto lg:right-8 lg:bottom-8 lg:w-[280px] lg:max-w-none lg:translate-x-0 lg:px-0"
        style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 18px)' }}
      >
        {vision.status === 'done' && vision.result?.isDog && (
          <PillButton
            size="lg"
            fullWidth
            variant="glass"
            icon={<Icon.flame />}
            disabled={!canSave}
            onClick={() => {
              if (!canSave || !vision.result) return;
              setScenario(
                scenarioFromVision(
                  state.breed,
                  state.weightKg,
                  vision.result,
                  locale,
                ),
              );
              go('chat');
            }}
          >
            {t('analyzer.action.train')}
          </PillButton>
        )}
        <PillButton
          size="lg"
          fullWidth
          icon={saved ? <Icon.check /> : <Icon.paw />}
          disabled={!canSave || saved}
          onClick={() => {
            if (!canSave) return;
            savePet(state, visionMeta);
            setSaved(true);
            setTimeout(() => setSaved(false), 2000);
          }}
          style={saved ? { opacity: 0.7 } : undefined}
        >
          {saved
            ? t('analyzer.action.saved')
            : canSave
              ? t('analyzer.action.save')
              : t('analyzer.action.needBreed')}
        </PillButton>
      </div>
    </>
  );
}

/**
 * Compact pill action used inside a saved-pet row. Mono/uppercase to match the
 * screen's label language; theme-aware fills so the row never becomes a
 * forced-light pane under near-white `--pbt-text`.
 */
function RowButton({
  children,
  onClick,
  dark,
  tone = 'neutral',
  disabled = false,
  ariaLabel,
  iconOnly = false,
}: {
  children: React.ReactNode;
  onClick: () => void;
  dark: boolean;
  tone?: 'neutral' | 'danger';
  disabled?: boolean;
  ariaLabel?: string;
  iconOnly?: boolean;
}) {
  const danger = tone === 'danger';
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        height: 30,
        width: iconOnly ? 30 : undefined,
        padding: iconOnly ? 0 : '0 12px',
        borderRadius: 9999,
        fontFamily: 'var(--pbt-font-mono)',
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: '0.12em',
        textTransform: 'uppercase',
        whiteSpace: 'nowrap',
        cursor: disabled ? 'default' : 'pointer',
        color: 'var(--pbt-text)',
        opacity: disabled ? 0.55 : 1,
        border: danger
          ? `1px solid color-mix(in oklab, ${COLORS.score.poor} 55%, transparent)`
          : `1px solid ${dark ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.60)'}`,
        background: danger
          ? `color-mix(in oklab, ${COLORS.score.poor} ${dark ? 26 : 14}%, ${
              dark ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.40)'
            })`
          : dark
            ? 'rgba(255,255,255,0.08)'
            : 'rgba(255,255,255,0.45)',
        backdropFilter: 'blur(12px) saturate(200%)',
        WebkitBackdropFilter: 'blur(12px) saturate(200%)',
        transition: 'all 0.2s ease',
      }}
    >
      {children}
    </button>
  );
}

/**
 * Saved pet profiles, listed under the analyzer controls.
 *
 * Renders nothing at all when there is nothing saved — the analyzer stays
 * uncluttered for first-time users.
 *
 * The "loaded" marker is *derived* (`petStateEquals`) rather than stored, so it
 * disappears the moment the user edits a field and there is no dangling id to
 * clean up when the displayed row is deleted.
 */
function SavedPetsCard({
  pets,
  currentState,
  confirmDeleteId,
  onRequestDelete,
  onConfirmDelete,
  onLoad,
  t,
}: {
  pets: SavedPet[];
  currentState: PetState;
  confirmDeleteId: string | null;
  onRequestDelete: (id: string | null) => void;
  onConfirmDelete: (id: string) => void;
  onLoad: (pet: SavedPet) => void;
  t: TFunction;
}) {
  const { resolvedTheme } = useTheme();
  const dark = resolvedTheme === 'dark';

  if (pets.length === 0) return null;

  return (
    <Glass radius={22} padding={18} glow={null} style={{ marginTop: 14 }}>
      <Eyebrow>{t('analyzer.savedPets.title')}</Eyebrow>
      <div
        style={{
          fontSize: 12.5,
          lineHeight: 1.5,
          color: 'var(--pbt-text-muted)',
          marginTop: -3,
          marginBottom: 12,
        }}
      >
        {t('analyzer.savedPets.hint')}
      </div>

      <ul
        style={{
          listStyle: 'none',
          margin: 0,
          padding: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
        }}
      >
        {pets.map((pet) => {
          // Compare against the sanitised mapping, not the raw record — that's
          // exactly what a Load would put on screen.
          const mapped = savedPetToPetState(pet);
          const isLoaded = petStateEquals(mapped, currentState);
          const confirming = confirmDeleteId === pet.id;
          const displayName =
            pet.name.trim() || t('analyzer.savedPets.unnamed');

          return (
            <li
              key={pet.id}
              style={{
                padding: '11px 13px',
                borderRadius: 16,
                border: isLoaded
                  ? '1px solid color-mix(in oklab, var(--pbt-driver-primary) 58%, rgba(255,255,255,0.38))'
                  : `1px solid ${dark ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.50)'}`,
                background: isLoaded
                  ? 'color-mix(in oklab, var(--pbt-driver-primary) 17%, rgba(255,255,255,0.06))'
                  : dark
                    ? 'rgba(255,255,255,0.05)'
                    : 'rgba(255,255,255,0.22)',
                backdropFilter: 'blur(18px) saturate(240%)',
                WebkitBackdropFilter: 'blur(18px) saturate(240%)',
                color: 'var(--pbt-text)',
                transition: 'all 0.2s ease',
              }}
            >
              <div className="flex items-center gap-3">
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontWeight: 600,
                      fontSize: 14,
                      color: 'var(--pbt-text)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {displayName}
                  </div>
                  {mapped.breed && (
                    <div
                      style={{
                        fontSize: 11.5,
                        color: 'var(--pbt-text-muted)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {mapped.breed}
                    </div>
                  )}
                  <div
                    style={{
                      marginTop: 3,
                      fontFamily: 'var(--pbt-font-mono)',
                      fontSize: 10,
                      letterSpacing: '0.08em',
                      color: 'var(--pbt-text-muted)',
                    }}
                  >
                    {t('analyzer.savedPets.stats', {
                      weightKg: mapped.weightKg,
                      bcs: mapped.bcs,
                    })}
                    {pet.source === 'vision' &&
                      ` · ${t('analyzer.savedPets.fromPhoto')}`}
                  </div>
                </div>

                {!confirming && (
                  <div className="flex items-center gap-2">
                    <RowButton
                      dark={dark}
                      disabled={isLoaded}
                      onClick={() => onLoad(pet)}
                      ariaLabel={t('analyzer.savedPets.loadAria', {
                        name: displayName,
                      })}
                    >
                      {isLoaded
                        ? t('analyzer.savedPets.loaded')
                        : t('analyzer.savedPets.load')}
                    </RowButton>
                    <RowButton
                      dark={dark}
                      iconOnly
                      onClick={() => onRequestDelete(pet.id)}
                      ariaLabel={t('analyzer.savedPets.deleteAria', {
                        name: displayName,
                      })}
                    >
                      <Icon.close width={14} height={14} />
                    </RowButton>
                  </div>
                )}
              </div>

              {confirming && (
                <div
                  className="flex flex-wrap items-center gap-2"
                  style={{ marginTop: 10 }}
                >
                  <span style={{ fontSize: 12.5, color: 'var(--pbt-text)' }}>
                    {t('analyzer.savedPets.confirmQuestion')}
                  </span>
                  <div className="flex items-center gap-2" style={{ marginLeft: 'auto' }}>
                    <RowButton dark={dark} onClick={() => onRequestDelete(null)}>
                      {t('analyzer.savedPets.confirmCancel')}
                    </RowButton>
                    <RowButton
                      dark={dark}
                      tone="danger"
                      onClick={() => onConfirmDelete(pet.id)}
                    >
                      {t('analyzer.savedPets.confirmYes')}
                    </RowButton>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </Glass>
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
