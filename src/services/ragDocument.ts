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
import { estimateTokens } from './aiTelemetry';
import { isTrainingUseAllowed } from '../lib/privacy';
import type { RetrievedChunk } from './ragShared';

/**
 * One embedding-ready slice of a session (RAG foundation, SOW §3.2).
 * 'exchange' = a customer→staff turn pair; 'coaching' = the scorer's
 * critique + better-alternative for the whole session.
 */
export interface SessionChunk {
  chunkIdx: number;
  chunkType: 'exchange' | 'coaching';
  content: string;
  tokenEstimate: number;
  tags: Record<string, unknown>;
}

/**
 * Segment a session into tagged, embedding-ready chunks.
 *
 * Exchange chunks pair each customer turn with the staff reply that answered
 * it — the natural retrieval unit for "how was this objection handled".
 * A final coaching chunk carries the scorer's critique so retrieval can also
 * surface "what the coach said about sessions like this".
 */
export function buildSessionChunks(
  scenario: Scenario,
  transcript: ChatMessage[],
  scoreReport: ScoreReport | null,
): SessionChunk[] {
  const baseTags: Record<string, unknown> = {
    pushback_id: scenario.pushback.id,
    driver: scenario.suggestedDriver,
    breed: scenario.breed,
    life_stage: scenario.age,
    difficulty: scenario.difficulty,
    score_band: scoreReport?.band ?? null,
    score_overall: scoreReport?.overall ?? null,
  };

  const chunks: SessionChunk[] = [];
  let idx = 0;
  let i = 0;
  while (i < transcript.length) {
    const msg = transcript[i];
    if (msg.role !== 'ai') {
      i++;
      continue;
    }
    const reply = transcript[i + 1]?.role === 'user' ? transcript[i + 1] : null;
    const content = reply
      ? `CUSTOMER: ${msg.text}\nSTAFF: ${reply.text}`
      : `CUSTOMER: ${msg.text}`;
    chunks.push({
      chunkIdx: idx++,
      chunkType: 'exchange',
      content,
      tokenEstimate: estimateTokens(content),
      tags: {
        ...baseTags,
        turn_range: [i, reply ? i + 1 : i],
        has_staff_reply: reply != null,
      },
    });
    i += reply ? 2 : 1;
  }

  if (scoreReport?.critique?.trim()) {
    const content = [
      `COACH CRITIQUE: ${scoreReport.critique.trim()}`,
      scoreReport.betterAlternative?.trim() && scoreReport.betterAlternative !== '—'
        ? `BETTER ALTERNATIVE: ${scoreReport.betterAlternative.trim()}`
        : null,
    ]
      .filter(Boolean)
      .join('\n');
    chunks.push({
      chunkIdx: idx++,
      chunkType: 'coaching',
      content,
      tokenEstimate: estimateTokens(content),
      tags: baseTags,
    });
  }

  return chunks;
}

interface PersistArgs {
  sessionId: string;
  scenario: Scenario;
  transcript: ChatMessage[];
  scoreReport: ScoreReport | null;
  durationSeconds: number;
  mode: 'text' | 'voice';
  modelId: string;
  completed: boolean;
  /** Knowledge chunks injected into this session's prompts (RAG), recorded
   *  for later effectiveness evaluation. */
  retrieved?: RetrievedChunk[];
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
  // Privacy gate (spec §8.3). rag_documents / rag_chunks are the training
  // corpus by definition, so opting out stops them entirely. The user's own
  // session record, session_feedback, and platform_reports are deliberately
  // NOT gated — that is their own data / deliberate submissions, not
  // "training use".
  if (!isTrainingUseAllowed()) return;
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
            acknowledge: args.scoreReport.acknowledge,
            clarify: args.scoreReport.clarify,
            transform: args.scoreReport.transform,
            empathy: args.scoreReport.empathy,
            rapport: args.scoreReport.rapport,
          }
        : null,
      key_moments: args.scoreReport?.keyMoments ?? null,
      retrieved: args.retrieved?.length
        ? args.retrieved.map((r) => ({ citation: r.citation, similarity: r.similarity }))
        : null,
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

    // Embedding-ready chunks (RAG foundation): one row per customer→staff
    // exchange + a coaching chunk. Same best-effort posture as the document.
    const chunks = buildSessionChunks(args.scenario, args.transcript, args.scoreReport);
    if (chunks.length > 0) {
      await sb.from('rag_chunks').upsert(
        chunks.map((c) => ({
          session_id: args.sessionId,
          user_id: user.id,
          chunk_idx: c.chunkIdx,
          chunk_type: c.chunkType,
          content: c.content,
          token_estimate: c.tokenEstimate,
          tags: c.tags,
        })),
        { onConflict: 'session_id,chunk_idx' },
      );
    }
  } catch (err) {
    console.warn('[rag-document] persist failed', err);
  }
}
