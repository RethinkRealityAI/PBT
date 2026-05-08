import type { Scenario } from '../../data/scenarios';
import { getPushbackKnowledge } from '../../data/knowledge/pushbackTaxonomy';

/**
 * Pre-session coaching hints — surfaces three ACT-aligned cue groups
 * (Acknowledge / Clarify / Take action) pulled from the same
 * `PUSHBACK_KNOWLEDGE` table the AI customer is grounded against, so
 * the trainee sees what earns credit on this scenario without the exact
 * lines to recite. Each group is trimmed to 2 cues so the panel stays
 * scannable. Renders nothing when the pushback isn't in the taxonomy
 * (custom-built scenarios) — preserves the surprise-value of the
 * roleplay.
 *
 * Shared by ChatScreen's Begin Simulation modal and HomeScreen's
 * scenario info modal.
 */
export function ScenarioHints({ scenario }: { scenario: Scenario }) {
  const pb = getPushbackKnowledge(scenario.pushback.id);
  if (!pb) return null;
  const sections: Array<{ heading: string; items: string[] }> = [
    { heading: 'Acknowledge', items: pb.acknowledgePatterns.slice(0, 2) },
    { heading: 'Clarify', items: pb.clarifyQuestions.slice(0, 2) },
    { heading: 'Take action', items: pb.takeActionPatterns.slice(0, 2) },
  ];
  return (
    <div style={{ marginBottom: 12 }}>
      <div
        style={{
          fontFamily: 'var(--pbt-font-mono)',
          fontSize: 9,
          letterSpacing: '0.16em',
          textTransform: 'uppercase',
          color: 'var(--pbt-text-muted)',
          marginBottom: 8,
        }}
      >
        What earns credit
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {sections.map((section) => (
          <div key={section.heading}>
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: 'var(--pbt-driver-primary)',
                letterSpacing: '0.02em',
                marginBottom: 4,
                textTransform: 'uppercase',
              }}
            >
              {section.heading}
            </div>
            <ul
              style={{
                margin: 0,
                paddingLeft: 16,
                fontSize: 12.5,
                lineHeight: 1.5,
                color: 'var(--pbt-text)',
              }}
            >
              {section.items.map((item, i) => (
                <li key={i} style={{ marginBottom: 2 }}>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
