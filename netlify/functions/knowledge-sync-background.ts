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
 *   header x-pbt-sync-key: <HMAC — see `_shared/knowledgeTrigger.ts`>
 *
 * Kicked by `flags-resolve` (every app boot) and by `admin-knowledge` GET
 * (opening the Knowledge screen) — see `_shared/knowledgeTrigger.ts`. The
 * kick always targets the site's PRIMARY URL, so the code that runs is the
 * published production deploy, whichever deploy served the boot.
 *
 * ── Why it is not open to the world ────────────────────────────────────────
 * This function writes to the production database with the service role, and
 * Netlify keeps every deploy — previews, branch deploys, every old production
 * deploy — reachable at its permalink with the same environment variables.
 * An open endpoint would let anyone make an OLD or PREVIEW deploy write ITS
 * code's corpus into production (and two live deploys could flip-flop it).
 * So, in order, a request must pass:
 *
 *   1. The shared key. `x-pbt-sync-key` must equal HMAC-SHA256 of a fixed
 *      label keyed with SUPABASE_SERVICE_ROLE_KEY (constant-time compare).
 *      Only code running inside this site's runtime can compute it; there is
 *      no extra secret to configure. No service-role key → refused. 401.
 *   2. The deploy. `context.deploy.context` (falling back to CONTEXT) must be
 *      `production`, and a production deploy Netlify reports as NOT the
 *      published one is refused too. `dev` (netlify dev) is allowed only with
 *      PBT_ALLOW_DEV_SYNC=1. 403.
 *   3. Per-IP rate limit, 1 call / 5 min — an in-memory speed bump.
 *   4. The database. Inside `runKnowledgeSync`, a single-row lease
 *      (`knowledge_sync_try_lease`, migration 20260923000000) means only one
 *      sync writes at a time; a concurrent run exits quietly. On top of that,
 *      the cooldown below: if the newest built-in `metadata.sync.syncedAt` is
 *      younger than 10 minutes AND a dry-run plan says nothing changed, it
 *      exits before spending a cent (a dry run hashes the PDFs, it never
 *      extracts or embeds).
 *
 * Even an authorised caller can only ever write CODE-DEFINED content: the
 * document set comes from `buildSeedDocs()` and `BUNDLED_STUDIES`; nothing
 * in the request body is read.
 *
 * Never throws: a failed sync leaves whatever is already stored, retrieval
 * fails open into the prompts' bundled text, and the app is unaffected.
 */
import { rateLimit } from './_shared/ai';
import { getServiceClient } from './_shared/admin';
import {
  syncAllowedHere,
  verifyKnowledgeSyncKey,
  type NetlifyContextLike,
} from './_shared/knowledgeTrigger';
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
 * both triggers. The request's own origin is right here: the trigger always
 * posts to the primary URL, so this IS the published deploy's static tree.
 */
function studyReader(req: Request): (file: string) => Promise<Uint8Array> {
  return async (file: string) => {
    const url = new URL(`/studies/${file}`, req.url);
    const res = await fetch(url.toString());
    if (!res.ok) throw new Error(`fetch /studies/${file} → ${res.status}`);
    return new Uint8Array(await res.arrayBuffer());
  };
}

export default async (req: Request, context?: NetlifyContextLike): Promise<Response> => {
  if (req.method !== 'POST') {
    return refuse(405, 'Method not allowed', { allow: 'POST' });
  }

  // 1. Only our own trigger (or an operator holding the service-role key)
  //    can compute this header.
  if (!verifyKnowledgeSyncKey(req)) {
    console.warn(`${LOG} refused — missing or invalid x-pbt-sync-key`);
    return refuse(401, 'Unauthorized');
  }

  // 2. Only the published production deploy writes the shared corpus.
  const allowed = syncAllowedHere(context);
  if (!allowed.ok) {
    console.warn(`${LOG} refused — ${allowed.reason}`);
    return refuse(403, 'Knowledge sync only runs on the published production deploy');
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
      if (
        probe.plan.create.length === 0 &&
        probe.plan.update.length === 0 &&
        probe.plan.retire.length === 0
      ) {
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
    if (result.skipped === 'lease-held') {
      console.log(`${LOG} another sync is running — exiting`);
      return accepted('another sync is running');
    }
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

function refuse(status: number, error: string, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...headers },
  });
}
