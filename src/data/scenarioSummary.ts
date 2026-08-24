/**
 * One-line human summary of a Scenario.
 *
 * Used for the saved SessionRecord / `training_sessions.scenario_summary`
 * column AND — via `scenarioRetrievalCacheKey` in services/ragClient — as the
 * per-scenario RAG cache key for scenarios that carry no `_overrideId`.
 *
 * Lives here rather than inside `useTextChat` so text mode, voice mode and the
 * retrieval client all derive the same string. Voice mode previously fell back
 * to `pushback.id + breed`, which collides across every custom scenario built
 * on the same category and breed — two different builds would share (and
 * poison) one cache entry.
 */
import type { Scenario } from './scenarios';

export function scenarioSummaryLine(scenario: Scenario): string {
  const note = scenario.pushbackNotes?.trim();
  const pb = scenario.pushback.title;
  if (note) {
    const short = note.length > 52 ? `${note.slice(0, 52)}…` : note;
    return `${pb} (${short}) · ${scenario.breed}`;
  }
  return `${pb} · ${scenario.breed}`;
}
