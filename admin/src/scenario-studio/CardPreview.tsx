/**
 * The scenario card as a trainee sees it on the Home screen.
 *
 * It only earns its place if it is the string the trainee will read, so every
 * fallback follows HomeScreen exactly: title = card title, else the
 * pushback's name; subtitle = card subtitle, else `home.pick.subtitle`
 * ("<breed>, <life stage>. Driver: <driver>."); tint = the card colour, else
 * the owner's driver. The life stage is species-aware (a kitten reads
 * "Kitten (<1)"), the same as the app.
 *
 * `compact` is the gallery thumbnail: the same tint and title with the
 * species glyph — the gallery card prints the details underneath.
 */
import { COLOR, DRIVERS, type DriverKey } from '../lib/tokens';
import { lifeStageLabel, speciesOf } from '../../../src/shared/scenarios/species';
import { PetBadge } from './ui';
import type { StudioDraft } from './studioModel';
import { objectionLabel, type ObjectionRef } from './objections/objectionsModel';
import { useObjectionsContext } from './objections/ObjectionsContext';

const DRIVER_SET = new Set<string>(['Activator', 'Energizer', 'Analyzer', 'Harmonizer']);

function asDriver(v: unknown): DriverKey | null {
  return typeof v === 'string' && DRIVER_SET.has(v) ? (v as DriverKey) : null;
}

export interface CardText {
  title: string;
  subtitle: string;
  button: string;
  /** Tint of the card itself (card colour override, else the owner's driver). */
  tint: DriverKey;
  /** The scenario's own driver — what the subtitle names. */
  driver: DriverKey | null;
}

/**
 * What the Home card will say for this draft. `fallbackTitle` covers a
 * scenario with no pushback yet (the built-in / trainee title); `team` names
 * a team objection by its own title, the way the app does.
 */
export function cardText(
  draft: StudioDraft,
  fallbackTitle?: string | null,
  team: readonly ObjectionRef[] = [],
): CardText {
  const driver = asDriver(draft.suggested_driver);
  const tint = asDriver(draft.card_driver_override) ?? driver ?? 'Activator';
  const breed = draft.breed?.trim() || '—';
  const stage = lifeStageLabel(draft.life_stage, draft.species) || '—';
  return {
    title:
      draft.card_title_override?.trim() ||
      (draft.pushback_id ? objectionLabel(draft.pushback_id, team) : '') ||
      fallbackTitle?.trim() ||
      'Untitled scenario',
    subtitle:
      draft.card_subtitle_override?.trim() || `${breed}, ${stage}. Driver: ${driver ?? '—'}.`,
    button: draft.start_button_label?.trim() || 'Start scenario',
    tint,
    driver,
  };
}

export function CardPreview({
  draft,
  fallbackTitle,
  compact = false,
}: {
  draft: StudioDraft;
  fallbackTitle?: string | null;
  compact?: boolean;
}) {
  const { objections } = useObjectionsContext();
  const text = cardText(draft, fallbackTitle, objections);
  const dc = DRIVERS[text.tint];
  const species = speciesOf(draft.species);
  const infoBody = draft.info_modal_body?.trim() ?? '';

  return (
    <div
      aria-label={compact ? undefined : 'Preview of the card trainees will see'}
      role={compact ? undefined : 'group'}
      style={{
        position: 'relative',
        padding: compact ? '14px 14px 16px' : 20,
        borderRadius: compact ? 16 : 22,
        background: `linear-gradient(180deg, color-mix(in oklab, ${dc.soft} 62%, white) 0%, white 100%)`,
        border: `1px solid color-mix(in oklab, ${dc.color} 22%, transparent)`,
        boxShadow: compact
          ? 'none'
          : `0 12px 32px -16px color-mix(in oklab, ${dc.color} 35%, transparent)`,
        minHeight: compact ? 84 : 200,
        overflow: 'hidden',
        boxSizing: 'border-box',
      }}
    >
      <div
        aria-hidden
        style={{
          position: 'absolute',
          right: compact ? -34 : -28,
          top: compact ? -34 : -28,
          width: compact ? 96 : 120,
          height: compact ? 96 : 120,
          borderRadius: '50%',
          background: `radial-gradient(closest-side, ${dc.color}, transparent 70%)`,
          opacity: 0.32,
        }}
      />
      {compact && (
        <PetBadge
          species={species}
          size={28}
          title={species === 'cat' ? 'Cat' : 'Dog'}
          style={{
            position: 'absolute',
            right: 10,
            top: 10,
            boxShadow: '0 2px 8px -4px rgba(60,20,15,0.3)',
          }}
        />
      )}
      <div
        style={{
          position: 'relative',
          fontSize: compact ? 15 : 18,
          fontWeight: 600,
          color: COLOR.ink,
          letterSpacing: '-0.02em',
          lineHeight: 1.25,
          marginBottom: compact ? 0 : 6,
          maxWidth: compact ? 'calc(100% - 36px)' : 260,
          overflowWrap: 'anywhere',
        }}
      >
        {text.title}
      </div>
      {!compact && (
        <>
          <div
            style={{
              position: 'relative',
              fontSize: 12,
              color: COLOR.inkMute,
              lineHeight: 1.45,
              marginBottom: 16,
              maxWidth: 300,
              overflowWrap: 'anywhere',
            }}
          >
            {text.subtitle}
          </div>
          <span
            style={{
              position: 'relative',
              display: 'inline-block',
              padding: '8px 16px',
              borderRadius: 9999,
              background: `linear-gradient(180deg, ${dc.color}, color-mix(in oklab, ${dc.color} 70%, black))`,
              color: '#fff',
              fontWeight: 700,
              fontSize: 12,
            }}
          >
            {text.button} →
          </span>
          {infoBody && (
            <div
              style={{
                position: 'relative',
                marginTop: 12,
                fontSize: 11,
                color: COLOR.inkMute,
                fontStyle: 'italic',
              }}
            >
              ⓘ {draft.info_modal_title?.trim() || text.title}: {infoBody.slice(0, 80)}
              {infoBody.length > 80 ? '…' : ''}
            </div>
          )}
        </>
      )}
    </div>
  );
}
