import {
  DriverChip,
  Eyebrow,
  Modal,
  ModalCloseButton,
  ScoreBadge,
  StatusPill,
} from '../primitives';
import { COLOR, type DriverKey } from '../lib/tokens';
import { fmtAgo } from '../lib/format';
import type { UserScenario } from '../data/types';

const DIFFICULTY_LABEL: Record<number, string> = {
  1: 'Coachable',
  2: 'Skeptical',
  3: 'Hostile',
  4: 'Combative',
};

/**
 * Beautiful, full-detail view of a user-built scenario.
 *
 * Surfaces every field the consumer app captures on the Create screen so an
 * admin can see exactly what was built — not just the title + a "Private"
 * pill. Layout follows the same Glass + Eyebrow + driver-tinted vocabulary
 * the rest of the dashboard uses.
 */
export function ScenarioDetailModal({
  scenario,
  onClose,
}: {
  scenario: UserScenario | null;
  onClose: () => void;
}) {
  if (!scenario) return null;
  const driver =
    scenario.suggested_driver as DriverKey | null | undefined;
  const difficultyLabel =
    scenario.difficulty != null ? DIFFICULTY_LABEL[scenario.difficulty] ?? `L${scenario.difficulty}` : null;

  return (
    <Modal open={true} onClose={onClose} width={760} ariaLabel={scenario.title}>
      {/* Header — driver-tinted gradient, title, status pills */}
      <div
        style={{
          padding: '24px 28px 16px',
          background: driver
            ? `linear-gradient(180deg, color-mix(in oklab, var(--pbt-driver-primary, ${COLOR.brand}) 12%, white), transparent)`
            : 'transparent',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div
              style={{
                fontFamily: 'var(--pbt-mono)',
                fontSize: 11,
                fontWeight: 800,
                letterSpacing: '0.18em',
                textTransform: 'uppercase',
                color: COLOR.inkMute,
              }}
            >
              {scenario.id.slice(0, 8)} · {fmtAgo(new Date(scenario.created_at).getTime())}
            </div>
            <h2
              style={{
                margin: '4px 0 0',
                fontSize: 26,
                fontWeight: 800,
                letterSpacing: '-0.025em',
                lineHeight: 1.15,
                color: COLOR.ink,
              }}
            >
              {scenario.title}
            </h2>
            {scenario.scenario_summary && scenario.scenario_summary !== scenario.title && (
              <div
                style={{
                  marginTop: 6,
                  fontSize: 13,
                  color: COLOR.inkSoft,
                  lineHeight: 1.5,
                }}
              >
                {scenario.scenario_summary}
              </div>
            )}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 12 }}>
              {driver && <DriverChip driver={driver} />}
              {difficultyLabel && (
                <StatusPill tone="warn" dot={false}>
                  {difficultyLabel}
                </StatusPill>
              )}
              {scenario.is_public ? (
                <StatusPill tone="info" dot={false}>
                  Public
                </StatusPill>
              ) : (
                <StatusPill tone="neutral" dot={false}>
                  Private
                </StatusPill>
              )}
              <StatusPill tone="neutral" dot={false}>
                {scenario.plays} plays
              </StatusPill>
              {scenario.avg_score != null && (
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    fontSize: 11,
                    color: COLOR.inkMute,
                  }}
                >
                  Avg score <ScoreBadge score={scenario.avg_score} />
                </span>
              )}
            </div>
          </div>
          <ModalCloseButton onClose={onClose} />
        </div>
      </div>

      {/* Body — scrolls if scenario is long */}
      <div
        style={{
          flex: 1,
          overflow: 'auto',
          padding: 24,
          display: 'flex',
          flexDirection: 'column',
          gap: 18,
        }}
      >
        {/* Pet card */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 12,
          }}
        >
          <DetailCell label="Breed" value={scenario.breed} />
          <DetailCell label="Life stage" value={scenario.life_stage} />
          <DetailCell
            label="Weight"
            value={scenario.weight_kg != null ? `${scenario.weight_kg} kg` : null}
          />
          <DetailCell label="Owner persona" value={scenario.persona} />
          <DetailCell label="Pushback type" value={scenario.pushback_id} />
          <DetailCell
            label="Difficulty"
            value={difficultyLabel ?? null}
          />
        </div>

        {scenario.pushback_notes && (
          <DetailParagraph
            label="What the owner pushed back on"
            value={scenario.pushback_notes}
          />
        )}
        {scenario.context && (
          <DetailParagraph label="Context the trainee added" value={scenario.context} />
        )}
        {scenario.opening_line && (
          <DetailParagraph
            label="Opening line"
            value={scenario.opening_line}
            italic
          />
        )}
        {!scenario.context &&
          !scenario.pushback_notes &&
          !scenario.opening_line && (
            <div
              style={{
                padding: 16,
                borderRadius: 14,
                background: 'rgba(60,20,15,0.04)',
                border: '0.5px dashed rgba(60,20,15,0.12)',
                fontSize: 12,
                color: COLOR.inkMute,
                textAlign: 'center',
              }}
            >
              This scenario was saved before we captured rich context. New
              scenarios will include the full notes / opening line / persona.
            </div>
          )}
      </div>
    </Modal>
  );
}

function DetailCell({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div
      style={{
        padding: 14,
        borderRadius: 14,
        background: 'rgba(255,255,255,0.6)',
        border: '0.5px solid rgba(255,255,255,0.9)',
        boxShadow: '0 1px 0 rgba(255,255,255,0.95) inset',
      }}
    >
      <Eyebrow>{label}</Eyebrow>
      <div
        style={{
          marginTop: 4,
          fontSize: 14,
          fontWeight: 700,
          color: value ? COLOR.ink : COLOR.inkMute,
          letterSpacing: '-0.01em',
        }}
      >
        {value ?? '—'}
      </div>
    </div>
  );
}

function DetailParagraph({
  label,
  value,
  italic,
}: {
  label: string;
  value: string;
  italic?: boolean;
}) {
  return (
    <div>
      <Eyebrow>{label}</Eyebrow>
      <div
        style={{
          marginTop: 6,
          padding: 14,
          borderRadius: 14,
          background: 'rgba(255,255,255,0.6)',
          border: '0.5px solid rgba(255,255,255,0.9)',
          fontSize: 14,
          lineHeight: 1.55,
          color: COLOR.ink,
          fontStyle: italic ? 'italic' : 'normal',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}
      >
        {italic ? `“${value}”` : value}
      </div>
    </div>
  );
}
