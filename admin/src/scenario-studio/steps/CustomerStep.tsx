/**
 * Step 3 — "Who is the owner?"
 *
 * Their ECHO driver (HOW they push back), their persona (the situation
 * layered on top), how hard they are to move, and — optionally — the exact
 * line they open with.
 */
import type { StepProps } from '../types';
import {
  AssistButton,
  Chip,
  FieldBlock,
  OptionTile,
  StudioSection,
  TextArea,
  useFieldId,
} from '../ui';
import { COLOR, DRIVERS, DRIVER_KEYS, type DriverKey } from '../../lib/tokens';
import { InfoTip } from '../../primitives';
import {
  DIFFICULTY_BLURBS,
  DRIVER_BLURBS,
  PERSONA_BLURBS,
} from '../../../../src/shared/ai/scenarioAgent';
import { DIFFICULTY_LABELS, PERSONAS } from '../../../../src/shared/scenarios/enums';
import { SCENARIO_LIMITS } from '../../../../src/shared/scenarios/limits';
import { BuiltInHint, Caption, FitGrid, Group, StepBody } from './stepParts';

/** "2 · Skeptical" */
export function difficultyName(level: number | null | undefined): string {
  if (level == null) return 'not set';
  return `${level} · ${DIFFICULTY_LABELS[level] ?? 'Unknown'}`;
}

function DriverGlyph({ driver }: { driver: DriverKey }) {
  const d = DRIVERS[driver];
  return (
    <span
      aria-hidden
      style={{
        width: 34,
        height: 34,
        borderRadius: 999,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: d.soft,
        color: d.color,
        fontSize: 15,
        fontWeight: 800,
        fontFamily: 'var(--pbt-font)',
        boxShadow: `inset 0 0 0 1.5px color-mix(in oklab, ${d.color} 40%, transparent)`,
      }}
    >
      {d.glyph}
    </span>
  );
}

function DriverExplainer() {
  return (
    <InfoTip title="What is an ECHO driver?">
      <p style={{ marginTop: 0 }}>
        The driver is the owner’s personality profile, and it goes straight into the AI’s briefing:
        what motivates them, how they talk, how they behave under stress, and the kind of phrases
        they reach for.
      </p>
      <ul style={{ paddingLeft: 18, margin: '8px 0' }}>
        {DRIVER_KEYS.map((d) => (
          <li key={d}>
            <strong>{d}</strong> — {DRIVER_BLURBS[d]}
          </li>
        ))}
      </ul>
      <p style={{ marginBottom: 0 }}>
        It changes <em>how</em> the owner pushes back, not <em>what</em> they push back on — the
        pushback step does that.
      </p>
    </InfoTip>
  );
}

export function CustomerStep({ draft, patch, canWrite, base, source, askAssistant }: StepProps) {
  const openingId = useFieldId();
  const driver = (draft.suggested_driver ?? null) as DriverKey | null;
  const persona = draft.persona_override ?? null;
  const difficulty = draft.difficulty_override ?? null;
  const isLibrary = source === 'library';
  const baseDifficulty = base?.difficulty_override ?? null;
  const opening = draft.opening_line_override ?? '';

  return (
    <StepBody>
      <StudioSection
        title="Their ECHO driver"
        hint={
          <>
            The owner’s personality — it shapes how they argue.{' '}
            <span style={{ whiteSpace: 'nowrap' }}>
              What is an ECHO driver? <DriverExplainer />
            </span>
          </>
        }
      >
        <Group label="ECHO driver">
          <FitGrid min={260}>
            {DRIVER_KEYS.map((d) => (
              <OptionTile
                key={d}
                selected={driver === d}
                onSelect={() => patch({ suggested_driver: d })}
                disabled={!canWrite}
                accent={DRIVERS[d].color}
                glyph={<DriverGlyph driver={d} />}
                title={d}
                description={DRIVER_BLURBS[d]}
              />
            ))}
          </FitGrid>
        </Group>
        <BuiltInHint
          base={base}
          draft={draft}
          field="suggested_driver"
          patch={patch}
          canWrite={canWrite}
          noun="ECHO driver"
        />
      </StudioSection>

      <StudioSection title="Their situation" hint="Layered on top of the driver — an Analyzer who is also a bargain-hunter keeps coming back to price.">
        <Group label="Persona">
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {PERSONAS.map((p) => (
              <Chip
                key={p}
                selected={persona === p}
                disabled={!canWrite}
                onClick={() => patch({ persona_override: p })}
              >
                {p}
              </Chip>
            ))}
          </div>
        </Group>
        <div
          aria-live="polite"
          style={{ fontSize: 13, lineHeight: 1.5, color: COLOR.inkSoft, minHeight: 20 }}
        >
          {persona && PERSONA_BLURBS[persona] ? (
            <>
              <strong style={{ color: COLOR.ink }}>{persona}:</strong> {PERSONA_BLURBS[persona]}
            </>
          ) : (
            <span style={{ color: COLOR.inkMute }}>
              {isLibrary ? 'Using the built-in situation.' : 'Not set — the owner will be skeptical.'}
            </span>
          )}
        </div>
        <BuiltInHint
          base={base}
          draft={draft}
          field="persona_override"
          patch={patch}
          canWrite={canWrite}
          noun="persona"
        />
      </StudioSection>

      <StudioSection title="How hard they are to move" hint="How many good turns the trainee needs before the owner gives ground.">
        <Group label="Difficulty">
          {isLibrary && (
            <div
              style={{
                marginBottom: 10,
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(min(260px, 100%), 1fr))',
              }}
            >
              <OptionTile
                compact
                selected={difficulty === null}
                onSelect={() => patch({ difficulty_override: null })}
                disabled={!canWrite}
                title="Use the built-in level"
                description={
                  baseDifficulty != null
                    ? `Ships as ${difficultyName(baseDifficulty)}.`
                    : 'Whatever this scenario ships with.'
                }
              />
            </div>
          )}
          <FitGrid min={260}>
            {SCENARIO_LIMITS.difficultyLevels.map((level) => (
              <OptionTile
                key={level}
                compact
                selected={difficulty === level}
                onSelect={() => patch({ difficulty_override: level })}
                disabled={!canWrite}
                title={difficultyName(level)}
                description={DIFFICULTY_BLURBS[level]}
              />
            ))}
          </FitGrid>
        </Group>
        <Caption>
          At every level the owner <em>does</em> soften when the trainee earns it — a harder owner just
          has to be won over more times. Scoring is the same at every level.
        </Caption>
      </StudioSection>

      <StudioSection
        title="Opening line"
        optional
        right={
          <AssistButton disabled={!canWrite} onClick={() => askAssistant('Write three opening lines')}>
            Write three opening lines
          </AssistButton>
        }
      >
        <FieldBlock
          label="The first thing the owner says"
          htmlFor={openingId}
          hint="Voice sessions open with this line. In text chats the AI opens in its own words, in the same spirit."
        >
          <TextArea
            id={openingId}
            rows={3}
            value={opening}
            disabled={!canWrite}
            placeholder="e.g. “Before you start — I’m not paying for another fancy food.”"
            onChange={(e) => patch({ opening_line_override: e.target.value })}
          />
        </FieldBlock>
        <BuiltInHint
          base={base}
          draft={draft}
          field="opening_line_override"
          patch={patch}
          canWrite={canWrite}
          noun="opening line"
        />
      </StudioSection>
    </StepBody>
  );
}
