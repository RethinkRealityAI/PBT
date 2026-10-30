/**
 * sessions-recover-background — scores sessions that were saved but never
 * scored (see `_shared/sessionRecovery.ts` for the rules). A Netlify
 * BACKGROUND function: the `-background` suffix buys a 202 at once and a
 * 15-minute budget, which a batch of scorer calls needs (a scheduled function
 * gets 30 s). Fired hourly by `sessions-recover` (scheduled).
 *
 * Not open: like `knowledge-sync-background`, every deploy (previews, old
 * production deploys) stays reachable with the production database, so the
 * request must carry `x-pbt-recover-key` (HMAC of a fixed label keyed with the
 * service-role key) and only the published production deploy runs it. The
 * body is never read — a caller cannot choose which rows are scored.
 */
import { getServiceClient } from './_shared/admin';
import { getGeminiClient } from './_shared/gemini';
import { errorMessage, rateLimit } from './_shared/ai';
import {
  syncAllowedHere,
  verifyInternalKey,
  type NetlifyContextLike,
} from './_shared/knowledgeTrigger';
import { RECOVER_KEY_HEADER, RECOVER_KEY_LABEL, runSessionRecovery } from './_shared/sessionRecovery';

/** Leave margin inside Netlify's 15-minute background budget. */
const BUDGET_MS = 12 * 60_000;
const RATE = { limit: 2, windowMs: 10 * 60_000 };
const LOG = '[sessions-recover-background]';

function respond(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}

export default async (req: Request, context?: NetlifyContextLike): Promise<Response> => {
  if (req.method !== 'POST') return respond(405, { error: 'Method not allowed' });
  if (!verifyInternalKey(req, RECOVER_KEY_HEADER, RECOVER_KEY_LABEL)) {
    console.warn(`${LOG} refused — missing or invalid ${RECOVER_KEY_HEADER}`);
    return respond(401, { error: 'Unauthorized' });
  }
  const allowed = syncAllowedHere(context);
  if (!allowed.ok) {
    console.warn(`${LOG} refused — ${allowed.reason}`);
    return respond(403, { error: 'Session recovery only runs on the published production deploy' });
  }
  const limited = rateLimit(req, 'sessions-recover', RATE);
  if (limited) return limited;

  const missing = ['GEMINI_API_KEY', 'SUPABASE_SERVICE_ROLE_KEY'].filter((n) => !process.env[n]);
  if (missing.length > 0) {
    console.warn(`${LOG} skipped — missing env: ${missing.join(', ')}`);
    return respond(202, { ok: true, status: 'skipped: missing env' });
  }

  try {
    const result = await runSessionRecovery({
      sb: getServiceClient(),
      ai: getGeminiClient(),
      deadline: Date.now() + BUDGET_MS,
    });
    console.info(`${LOG} done`, result);
    return respond(202, { ok: true, ...result });
  } catch (err) {
    console.error(`${LOG} failed`, errorMessage(err));
    return respond(202, { ok: false });
  }
};
