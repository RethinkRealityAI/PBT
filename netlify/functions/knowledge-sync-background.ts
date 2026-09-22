/**
 * Self-seeding knowledge base — the trigger that actually works in production.
 *
 * The service-role key and the Gemini key only exist inside the Netlify
 * runtime (Netlify masks them, so a laptop can't run the sync against prod,
 * and the SQL-emit route is too large to paste by hand). So the deploy seeds
 * ITSELF: this function runs the same engine as `npm run knowledge:sync`
 * (`_shared/knowledgeSyncRun.ts`) from inside a function instance, where the
 * real keys are.
 *
 * The `-background` suffix is load-bearing: Netlify returns 202 to the caller
 * immediately and gives the function up to 15 minutes, which a cold sync
 * (five PDF extractions + ~30 embed calls) needs and a 10-second synchronous
 * function would not survive.
 *
 *   POST /.netlify/functions/knowledge-sync-background
 *
 * Fired fire-and-forget by `flags-resolve` (every app boot) and by
 * `admin-knowledge` GET (opening the Knowledge screen) — see
 * `_shared/knowledgeTrigger.ts`. Also safe to curl by hand after a deploy.
 *
 * ── Why it is safe without auth ────────────────────────────────────────────
 * There is no JWT check, on purpose: the consumer app boots anonymously and
 * must be able to fire it. Three things make that harmless.
 *
 *   1. It can only ever write CODE-DEFINED content. The document set comes
 *      from `buildSeedDocs()` and `BUNDLED_STUDIES`; nothing in the request
 *      is read at all. An attacker's best outcome is the corpus the repo
 *      already says it wants.
 *   2. Hard cooldown. If the newest `metadata.sync.syncedAt` across the
 *      built-in documents is younger than 10 minutes AND a dry-run plan says
 *      nothing changed, it exits before spending a cent. A dry run does not
 *      call Gemini at all (it hashes the PDFs, it does not extract them), so
 *      the flood case costs five static GETs and two SELECTs.
 *   3. Per-IP rate limit, 1 call / 5 min — a speed bump in front of (2).
 *      In-memory and therefore per-instance, which is why the cooldown in the
 *      database, not this, is the real protection.
 *
 * Never throws: a failed sync leaves whatever is already stored, retrieval
 * fails open into the prompts' bundled text, and the app is unaffected.
 */
import { rateLimit } from './_shared/ai';
import { getServiceClient } from './_shared/admin';
import {
  newestSyncedAt,
  readExistingRows,
  runKnowledgeSync,
} from './_shared/knowledgeSyncRun';

/** How recently a sync must have run for a fresh request to be redundant. */
export const SYNC_COOLDOWN_MS = 10 * 60_000;
const RATE = { limit: 1, windowMs: 5 * 60_000 };

const LOG = '[knowledge-sync-background]';

/**
 * Bundled study PDFs, fetched from this deploy's own origin.
 *
 * A function bundle does not contain `public/`, so disk is not an option —
 * but the deploy serves `/studies/*.pdf` as static assets, and the bytes are
 * identical to the ones the CLI reads, so the `sourceHash` skip works across
 * both triggers.
 */
function studyReader(req: Request): (file: string) => Promise<Uint8Array> {
  return async (file: string) => {
    const url = new URL(`/studies/${file}`, req.url);
    const res = await fetch(url.toString());
    if (!res.ok) throw new Error(`fetch /studies/${file} → ${res.status}`);
    return new Uint8Array(await res.arrayBuffer());
  };
}

export default async (req: Request): Promise<Response> => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'content-type': 'application/json', allow: 'POST' },
    });
  }

  const limited = rateLimit(req, 'knowledge-sync-background', RATE);
  if (limited) return limited;

  // Names only — never a value.
  const missing = ['GEMINI_API_KEY', 'SUPABASE_SERVICE_ROLE_KEY'].filter((n) => !process.env[n]);
  if (missing.length > 0) {
    console.warn(`${LOG} skipped — missing env: ${missing.join(', ')}`);
    return accepted('skipped: missing env');
  }

  try {
    const sb = getServiceClient();
    const readStudy = studyReader(req);
    const existingRows = await readExistingRows(sb);

    const newest = newestSyncedAt(existingRows);
    const age = newest ? Date.now() - Date.parse(newest) : Number.POSITIVE_INFINITY;
    if (Number.isFinite(age) && age < SYNC_COOLDOWN_MS) {
      // Inside the cooldown, prove there is nothing to do before refusing.
      // "Recently synced" alone is not enough: a deploy that changes a
      // document lands minutes after the previous sync, and that is exactly
      // the case this whole mechanism exists for.
      const probe = await runKnowledgeSync({
        sb,
        readStudy,
        existingRows,
        dryRun: true,
      });
      if (probe.plan.create.length === 0 && probe.plan.update.length === 0) {
        console.log(
          `${LOG} cooldown — last sync ${Math.round(age / 1000)}s ago and nothing changed; ` +
            `${probe.summary}`,
        );
        return accepted('cooldown');
      }
      console.log(`${LOG} within cooldown but work is pending — ${probe.summary}`);
    }

    const result = await runKnowledgeSync({
      sb,
      readStudy,
      existingRows,
      log: (line) => console.log(`${LOG}${line}`),
    });
    for (const line of result.lines) {
      if (line.action === 'unchanged') continue;
      console.log(`${LOG}   ${line.slug} — ${line.action}${line.chunks === null ? '' : ` (${line.chunks} chunks)`}`);
    }
    console.log(`${LOG} ${result.summary}`);
    return accepted(result.summary);
  } catch (err) {
    // Fail-open. The site does not depend on the corpus existing.
    console.error(`${LOG} failed`, err instanceof Error ? err.message : String(err));
    return accepted('failed (logged)');
  }
};

/**
 * Netlify discards a background function's response, so the body is only for
 * a direct curl and for the tests.
 */
function accepted(status: string): Response {
  return new Response(JSON.stringify({ ok: true, status }), {
    status: 202,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}
