/**
 * Persists a `rag_documents` row when a session ends.
 *
 * Document shape:
 *   - `content` is the trainable text: scenario summary + transcript +
 *     scorer critique + better-alternative, normalised so chunkers don't
 *     need any awareness of our schema.
 *   - `metadata` mirrors what the admin dashboard surfaces — pushback id,
 *     driver, breed, life-stage, scenario summary, full scorecard, AI
 *     telemetry rollup. Filterable via JSONB GIN indexes.
 *
 * Best-effort: errors are logged but never surface to the user.
 */
import type { Scenario } from '../data/scenarios';
import type { ChatMessage, ScoreReport } from './types';
import { getSupabase } from '../features/auth/supabaseClient';

interface PersistArgs {
  sessionId: string;
  scenario: Scenario;
  transcript: ChatMessage[];
  scoreReport: ScoreReport | null;
  durationSeconds: number;
  mode: 'text' | 'voice';
  modelId: string;
  completed: boolean;
}

function assembleContent(
  scenario: Scenario,
  transcript: ChatMessage[],
  scoreReport: ScoreReport | null,
): string {
  const lines: string[] = [];
  lines.push(`# Scenario`);
  lines.push(`Pushback: ${scenario.pushback.title}`);
  lines.push(`Breed: ${scenario.breed}`);
  lines.push(`Life stage: ${scenario.age}`);
  lines.push(`Persona: ${scenario.persona}`);
  lines.push(`Difficulty: ${scenario.difficulty}`);
  lines.push(`Suggested driver: ${scenario.suggestedDriver}`);
  if (scenario.context) lines.push(`Context: ${scenario.context}`);
  if (scenario.pushbackNotes) lines.push(`Notes: ${scenario.pushbackNotes}`);

  lines.push('', '# Transcript');
  for (const m of transcript) {
    const speaker = m.role === 'user' ? 'STAFF' : 'CUSTOMER';
    lines.push(`${speaker}: ${m.text}`);
  }

  if (scoreReport) {
    lines.push('', '# Scorecard');
    lines.push(`Overall: ${scoreReport.overall} (${scoreReport.band})`);
    if (scoreReport.critique) lines.push(`Critique: ${scoreReport.critique}`);
    if (scoreReport.betterAlternative)
      lines.push(`Better alternative: ${scoreReport.betterAlternative}`);
  }

  return lines.join('\n');
}

export async function persistRagDocument(args: PersistArgs): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;
  try {
    const {
      data: { user },
    } = await sb.auth.getUser();
    // RLS allows insert for the owner; anonymous users can't write here, so
    // skip unless authed. The session's transcript still lives in localStorage.
    if (!user) return;

    const content = assembleContent(args.scenario, args.transcript, args.scoreReport);
    const metadata: Record<string, unknown> = {
      pushback_id: args.scenario.pushback.id,
      driver: args.scenario.suggestedDriver,
      breed: args.scenario.breed,
      life_stage: args.scenario.age,
      persona: args.scenario.persona,
      difficulty: args.scenario.difficulty,
      mode: args.mode,
      model_id: args.modelId,
      duration_seconds: args.durationSeconds,
      turns: args.transcript.length,
      completed: args.completed,
      score_overall: args.scoreReport?.overall ?? null,
      score_band: args.scoreReport?.band ?? null,
      dimension_scores: args.scoreReport
        ? {
            empathyTone: args.scoreReport.empathyTone,
            activeListening: args.scoreReport.activeListening,
            productKnowledge: args.scoreReport.productKnowledge,
            objectionHandling: args.scoreReport.objectionHandling,
            confidence: args.scoreReport.confidence,
            closingEffectiveness: args.scoreReport.closingEffectiveness,
            pacing: args.scoreReport.pacing,
          }
        : null,
      key_moments: args.scoreReport?.keyMoments ?? null,
      turn_sentiment: args.scoreReport?.turnSentiment ?? null,
    };

    await sb
      .from('rag_documents')
      .upsert(
        {
          session_id: args.sessionId,
          user_id: user.id,
          content,
          metadata,
        },
        { onConflict: 'session_id' },
      );
  } catch (err) {
    console.warn('[rag-document] persist failed', err);
  }
}
