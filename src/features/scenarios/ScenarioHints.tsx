import type { Scenario } from '../../data/scenarios';
import { useT } from '../../i18n/useT';
import { useLanguage } from '../../app/providers/LanguageProvider';
import { localizedPushbackHints } from '../../i18n/dataL10n/pushbacks';
import type { Locale } from '../../i18n/locales';
import { adaptPetWords } from '../../shared/scenarios/species';
import { isTeamObjectionId, type TeamObjection } from '../../shared/scenarios/objections';
import { useTeamObjections } from './useObjectionCatalog';

type CueGroups = {
  acknowledge: string[];
  clarify: string[];
  takeAction: string[];
};

/**
 * The three ACT cue groups for a scenario's pushback, already worded for its
 * animal.
 *
 * • Built-in pushback → the taxonomy (localised overlay), canned dog copy
 *   re-worded for a cat.
 * • TEAM objection (`team:<slug>`) → the coaching the team wrote for it in the
 *   Scenario Studio (shown verbatim — it was written for its own animals),
 *   group by group; a group the team left empty falls back to the generic
 *   "Other pushback" cues, as does an objection the snapshot no longer
 *   carries.
 *
 * Null when there is nothing to show (a pushback outside the taxonomy).
 */
export function scenarioHintCues(
  scenario: Scenario,
  locale: Locale,
  team: readonly TeamObjection[],
): CueGroups | null {
  const species = scenario.species;
  const canned = (items: string[]) => items.map((s) => adaptPetWords(s, species));
  const id = scenario.pushback.id;
  if (isTeamObjectionId(id)) {
    const generic = localizedPushbackHints('custom', locale);
    const coaching = team.find((o) => o.id === id)?.coaching ?? {};
    const pick = (own: string[] | undefined, fallback: string[] | undefined) =>
      own && own.length > 0 ? own : canned(fallback ?? []);
    const groups: CueGroups = {
      acknowledge: pick(coaching.acknowledgePatterns, generic?.acknowledgePatterns),
      clarify: pick(coaching.clarifyQuestions, generic?.clarifyQuestions),
      takeAction: pick(coaching.takeActionPatterns, generic?.takeActionPatterns),
    };
    if (!groups.acknowledge.length && !groups.clarify.length && !groups.takeAction.length) {
      return null;
    }
    return groups;
  }
  const pb = localizedPushbackHints(id, locale);
  if (!pb) return null;
  return {
    acknowledge: canned(pb.acknowledgePatterns),
    clarify: canned(pb.clarifyQuestions),
    takeAction: canned(pb.takeActionPatterns),
  };
}

/**
 * Pre-session coaching hints — surfaces three ACT-aligned cue groups
 * (Acknowledge / Clarify / Take action) pulled from the same
 * `PUSHBACK_KNOWLEDGE` table the AI customer is grounded against, so
 * the trainee sees what earns credit on this scenario without the exact
 * lines to recite. Each group is trimmed to 2 cues so the panel stays
 * scannable. Renders nothing when the pushback isn't in the taxonomy —
 * preserves the surprise-value of the roleplay. A team objection's cues come
 * from the coaching the team wrote for it (see `scenarioHintCues`).
 *
 * Shared by ChatScreen's Begin Simulation modal and HomeScreen's
 * scenario info modal.
 */
export function ScenarioHints({ scenario }: { scenario: Scenario }) {
  // Hooks first — the taxonomy miss below returns null and must not change
  // the hook order between renders.
  const t = useT();
  const { locale } = useLanguage();
  const team = useTeamObjections();
  // Canned taxonomy copy is written about a dog ("…for you and your dog?");
  // `scenarioHintCues` says it about the animal this scenario is actually about.
  const groups = scenarioHintCues(scenario, locale, team);
  if (!groups) return null;
  const cues = (items: string[]) => items.slice(0, 2);
  const sections: Array<{ id: string; heading: string; items: string[] }> = [
    { id: 'acknowledge', heading: t('create.hints.acknowledge'), items: cues(groups.acknowledge) },
    { id: 'clarify', heading: t('create.hints.clarify'), items: cues(groups.clarify) },
    { id: 'takeAction', heading: t('create.hints.takeAction'), items: cues(groups.takeAction) },
  ].filter((section) => section.items.length > 0);
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
        {t('create.hints.eyebrow')}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {sections.map((section) => (
          <div key={section.id}>
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
