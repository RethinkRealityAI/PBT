/**
 * sessions-recover — the hourly SCHEDULED trigger (schedule in netlify.toml)
 * for `sessions-recover-background`, which does the scoring. Scheduled
 * functions get 30 s, so this one only dispatches: it signs the request with
 * the internal key and calls the background function at the site's primary
 * URL. Never throws; only the published production deploy dispatches.
 */
import { internalKey, syncAllowedHere, type NetlifyContextLike } from './_shared/knowledgeTrigger';
import { RECOVER_KEY_HEADER, RECOVER_KEY_LABEL, RECOVER_PATH } from './_shared/sessionRecovery';

const LOG = '[sessions-recover]';

export default async (_req: Request, context?: NetlifyContextLike): Promise<Response> => {
  const done = (status: string) =>
    new Response(JSON.stringify({ ok: true, status }), {
      status: 200,
      headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
    });
  if (!syncAllowedHere(context).ok) return done('skipped: not the published production deploy');
  const key = internalKey(RECOVER_KEY_LABEL);
  const base = process.env.URL || context?.site?.url;
  if (!key || !base) return done('skipped: missing key or site URL');
  try {
    const res = await fetch(new URL(RECOVER_PATH, base).toString(), {
      method: 'POST',
      headers: { 'content-type': 'application/json', [RECOVER_KEY_HEADER]: key },
      body: '{}',
      signal: AbortSignal.timeout(10_000),
    });
    return done(`dispatched: ${res.status}`);
  } catch (err) {
    console.warn(`${LOG} dispatch failed`, err instanceof Error ? err.message : String(err));
    return done('dispatch failed');
  }
};
