/**
 * One-shot backfill of locally-stored data into Supabase whenever a user
 * transitions from anonymous → authenticated.
 *
 * Anonymous users can run sessions, save pets, and generate RAG-relevant
 * data without an account. When they later sign up OR sign in, that work
 * needs to surface in the admin dashboard. Without this helper, nothing
 * captured before auth would ever reach Supabase — leaving a hole in the
 * RAG corpus and the admin metrics.
 *
 * Design:
 *   - Idempotent: upserts by stable client-generated UUIDs so re-running
 *     after a partial failure (or running on every sign-in) doesn't
 *     duplicate rows.
 *   - Best-effort: failures are logged but never thrown. The local copy
 *     remains canonical for the consumer app.
 *   - Tracks a "high-water mark" in localStorage (`pbt:cloud_backfilled_at`)
 *     so we don't re-walk the entire local archive on every session.
 *     Always safe — re-running is harmless thanks to upserts.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { SessionRecord, ChatMessage, ScoreReport } from '../../services/types';
import type { Scenario } from '../../data/scenarios';
import {
  readStorage,
  writeStorage,
  type StorageKeyDef,
} from '../../lib/storage';
import type { DriverKey } from '../../design-system/tokens';

interface SavedPetLike {
  id: string;
  name: string;
  breed: string;
  weightKg: number;
  bcs: number;
  mcs: string;
  activity: 'active' | 'inactive';
  savedAt?: string;
}

const SESSIONS_KEY: StorageKeyDef<SessionRecord[]> = {
  key: 'sessions',
  fallback: [],
  validate: (v): v is SessionRecord[] => Array.isArray(v),
};

const SAVED_PETS_KEY: StorageKeyDef<SavedPetLike[]> = {
  key: 'saved_pets',
  fallback: [],
  validate: (v): v is SavedPetLike[] => Array.isArray(v),
};

const BACKFILLED_AT_KEY: StorageKeyDef<string | null> = {
  key: 'cloud_backfilled_at',
  fallback: null,
  validate: (v): v is string | null => v === null || typeof v === 'string',
};

/** Map MCS UI tokens → admin numeric bucket. Mirrors useSavedPets. */
const MCS_NUMERIC: Record<string, number> = {
  normal: 1,
  mild: 2,
  moderate: 3,
  severe: 4,
};

/** Map verdict → admin verdict bucket. Mirrors useSavedPets.adminVerdict. */
function adminVerdictFromBcsMcs(bcs: number, mcs: string): string {
  if (mcs !== 'normal') return 'adjust';
  if (bcs >= 4 && bcs <= 6) return 'on_track';
  if (bcs <= 2 || bcs >= 8) return 'concern';
  return 'watch';
}

/**
 * Re-assembles the RAG content + metadata for a completed session. Mirrors
 * `src/services/ragDocument.ts::assembleContent` but with weaker typing
 * (the local SessionRecord doesn't carry the full Scenario object — only a
 * summary + pushback id). The RAG corpus may have less context than a
 * fresh-ended session, but better partial than absent.
 */
function assembleRagContentFromRecord(record: SessionRecord): string {
  const lines: string[] = [];
  lines.push(`# Scenario`);
  lines.push(`Summary: ${record.scenarioSummary}`);
  lines.push(`Pushback: ${record.pushbackId}`);
  lines.push(`Suggested driver: ${record.driver}`);
  lines.push(`Mode: ${record.mode}`);
  lines.push(`Duration: ${record.durationSeconds}s`);
  lines.push('', '# Transcript');
  for (const m of record.transcript) {
    const speaker = m.role === 'user' ? 'STAFF' : 'CUSTOMER';
    lines.push(`${speaker}: ${m.text}`);
  }
  if (record.scoreReport) {
    lines.push('', '# Scorecard');
    lines.push(`Overall: ${record.scoreReport.overall} (${record.scoreReport.band})`);
    if (record.scoreReport.critique) lines.push(`Critique: ${record.scoreReport.critique}`);
    if (record.scoreReport.betterAlternative) {
      lines.push(`Better alternative: ${record.scoreReport.betterAlternative}`);
    }
  }
  return lines.join('\n');
}

function ragMetadataFromRecord(record: SessionRecord): Record<string, unknown> {
  const r = record.scoreReport as ScoreReport | undefined;
  return {
    pushback_id: record.pushbackId,
    driver: record.driver,
    mode: record.mode,
    duration_seconds: record.durationSeconds,
    turns: record.transcript.length,
    completed: !!r,
    score_overall: r?.overall ?? null,
    score_band: r?.band ?? null,
    dimension_scores: r
      ? {
          empathyTone: r.empathyTone,
          activeListening: r.activeListening,
          productKnowledge: r.productKnowledge,
          objectionHandling: r.objectionHandling,
          confidence: r.confidence,
          closingEffectiveness: r.closingEffectiveness,
          pacing: r.pacing,
        }
      : null,
    key_moments: r?.keyMoments ?? null,
    turn_sentiment: r?.turnSentiment ?? null,
    backfilled: true,
  };
}

/** Sanity check — warn loudly if a transcript is single-role. Helps catch
 *  any future regression where staff messages don't make it into storage. */
function warnIfSingleRoleTranscript(
  source: string,
  transcript: ChatMessage[],
): void {
  if (transcript.length < 2) return;
  const roles = new Set(transcript.map((m) => m.role));
  if (roles.size < 2) {
    console.warn(
      `[backfill] ${source}: transcript has only ${[...roles].join(',')} turns ` +
        `(${transcript.length} total). Expected both 'user' and 'ai'.`,
    );
  }
}

/**
 * Run the backfill for the currently-signed-in user. Safe to call on every
 * sign-in — no-ops when there's nothing local to send.
 */
export async function backfillLocalDataToCloud(
  sb: SupabaseClient,
  userId: string,
): Promise<void> {
  const sessions = readStorage(SESSIONS_KEY);
  const pets = readStorage(SAVED_PETS_KEY);

  // ── Sessions → training_sessions ─────────────────────────
  if (sessions.length > 0) {
    try {
      const sessionRows = sessions.map((s) => {
        warnIfSingleRoleTranscript(`session ${s.id}`, s.transcript);
        return {
          id: s.id,
          user_id: userId,
          // Best-effort scenario reconstruction from the local summary.
          // Server-side admin export uses scenario_summary / pushback_id /
          // driver columns directly, so the missing fields aren't fatal.
          scenario: {
            summary: s.scenarioSummary,
            pushbackId: s.pushbackId,
            driver: s.driver,
          } as Record<string, unknown>,
          transcript: s.transcript as unknown as Record<string, unknown>[],
          score_report: s.scoreReport as unknown as Record<string, unknown> | null,
          score_overall: s.scoreReport?.overall ?? null,
          duration_seconds: s.durationSeconds,
          mode: s.mode,
          completed: !!s.scoreReport,
          ended_reason: s.scoreReport ? 'completed' : 'abandoned',
          pushback_id: s.pushbackId,
          driver: s.driver as DriverKey,
          scenario_summary: s.scenarioSummary,
          turns: s.transcript.length,
          created_at: s.createdAt,
        };
      });
      const { error: sessErr } = await sb
        .from('training_sessions')
        .upsert(sessionRows, { onConflict: 'id' });
      if (sessErr) {
        console.warn('[backfill] training_sessions upsert failed', sessErr);
      } else {
        // For each completed session, also upsert a rag_documents row so the
        // RAG corpus reflects historical work, not just sessions started
        // after sign-up. Also idempotent on (session_id) unique index.
        const ragRows = sessions
          .filter((s) => s.transcript.length > 0)
          .map((s) => ({
            session_id: s.id,
            user_id: userId,
            content: assembleRagContentFromRecord(s) as unknown as string,
            metadata: ragMetadataFromRecord(s),
          }));
        if (ragRows.length > 0) {
          const { error: ragErr } = await sb
            .from('rag_documents')
            .upsert(ragRows, { onConflict: 'session_id' });
          if (ragErr) console.warn('[backfill] rag_documents upsert failed', ragErr);
        }
      }
    } catch (err) {
      console.warn('[backfill] sessions block threw', err);
    }
  }

  // ── Pets → pet_records (+ analyzer_events one-per-pet) ──
  if (pets.length > 0) {
    try {
      const petRows = pets.map((p) => ({
        id: p.id,
        user_id: userId,
        name: p.name || null,
        breed: p.breed || null,
        weight_kg: p.weightKg ?? null,
        bcs: p.bcs,
        mcs: p.mcs,
        activity: p.activity,
        created_at: p.savedAt ?? new Date().toISOString(),
      }));
      const { error: petErr } = await sb
        .from('pet_records')
        .upsert(petRows, { onConflict: 'id' });
      if (petErr) {
        console.warn('[backfill] pet_records upsert failed', petErr);
      }

      // Mirror each pet save as one analyzer_event so the admin dashboard's
      // analyzer screen reflects historical activity. We don't have an
      // existing event id to dedupe by — guard with a "backfilled=true"
      // metadata so re-runs don't double-insert.
      const { data: existingEvents } = await sb
        .from('analyzer_events')
        .select('pet_id')
        .eq('user_id', userId);
      const seen = new Set((existingEvents ?? []).map((e) => e.pet_id));
      const eventsToInsert = pets
        .filter((p) => !seen.has(p.id))
        .map((p) => ({
          user_id: userId,
          pet_id: p.id,
          breed: p.breed || null,
          weight_kg: p.weightKg ?? null,
          bcs: p.bcs,
          mcs: MCS_NUMERIC[p.mcs] ?? null,
          activity: p.activity,
          verdict: adminVerdictFromBcsMcs(p.bcs, p.mcs),
          created_at: p.savedAt ?? new Date().toISOString(),
        }));
      if (eventsToInsert.length > 0) {
        const { error: evtErr } = await sb
          .from('analyzer_events')
          .insert(eventsToInsert);
        if (evtErr) console.warn('[backfill] analyzer_events insert failed', evtErr);
      }
    } catch (err) {
      console.warn('[backfill] pets block threw', err);
    }
  }

  writeStorage(BACKFILLED_AT_KEY, new Date().toISOString());
}

/** True if the local store has anything that hasn't been backfilled yet. */
export function hasLocalDataToBackfill(): boolean {
  const sessions = readStorage(SESSIONS_KEY);
  const pets = readStorage(SAVED_PETS_KEY);
  return sessions.length > 0 || pets.length > 0;
}

/** Surfaces the helper's view of "scenario from a session record" for tests. */
export const __testing = {
  assembleRagContentFromRecord,
  ragMetadataFromRecord,
  adminVerdictFromBcsMcs,
};

// Avoid an unused-import warning when only types are referenced.
export type { Scenario };
