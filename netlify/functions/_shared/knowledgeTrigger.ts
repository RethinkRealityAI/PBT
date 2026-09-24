/**
 * Kick for `knowledge-sync-background`, plus the gate that function applies.
 *
 * Nothing in the product should depend on a human remembering to seed the
 * knowledge base, and the build plugin only covers builds. So the two
 * endpoints that are hit whenever the product is actually being USED — the
 * public flag resolve (every app boot) and the admin Knowledge screen's GET —
 * nudge the background function on their way out.
 *
 * ── Where the kick goes ────────────────────────────────────────────────────
 * ALWAYS the site's primary URL (`process.env.URL`, i.e. the currently
 * published production deploy), never the request's own host. Netlify keeps
 * every deploy reachable at its permalink (`<deploy-id>--<site>.netlify.app`),
 * and an old deploy's `flags-resolve` must never be able to make its own
 * stale code write its own stale corpus into the shared database. Whatever
 * deploy fires the kick, the code that runs is the published one.
 *
 * ── How the background function knows the kick is ours ─────────────────────
 * The kick carries `x-pbt-sync-key`: HMAC-SHA256 of a fixed label keyed with
 * `SUPABASE_SERVICE_ROLE_KEY`. Only code running inside this site's Netlify
 * runtime holds that key, so nobody on the internet can mint the header, and
 * no new secret has to be configured — the service-role key already exists
 * wherever a sync could possibly work. The raw key never leaves the process.
 *
 * ── Rules for the kick itself (all about not being felt) ───────────────────
 *   • Production only (plus `netlify dev` with PBT_ALLOW_DEV_SYNC=1). Preview
 *     and branch deploys never kick.
 *   • At most one SUCCESSFUL dispatch per function instance. The "done" flag
 *     is set only after Netlify accepted the invocation; a failed dispatch
 *     re-arms after a short back-off so a later request retries. The real
 *     de-duplication is the database lease + cooldown in the sync itself.
 *   • Never delays the caller's response. With a Netlify v2 `context`, the
 *     dispatch is handed to `context.waitUntil` so the instance is not frozen
 *     before the request leaves; without one it is fire-and-forget. A
 *     rejected promise can never surface as an unhandled rejection.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

/** The subset of the Netlify Functions v2 `Context` this module reads. */
export interface NetlifyContextLike {
  deploy?: { context?: string; id?: string; published?: boolean };
  site?: { url?: string };
  waitUntil?: (promise: Promise<unknown>) => void;
}

export const KNOWLEDGE_SYNC_KEY_HEADER = 'x-pbt-sync-key';
const KNOWLEDGE_SYNC_KEY_LABEL = 'pbt:knowledge-sync:v1';
export const KNOWLEDGE_SYNC_PATH = '/.netlify/functions/knowledge-sync-background';

/** How long a failed dispatch waits before a later request may retry. */
const RETRY_BACKOFF_MS = 60_000;
/** A dispatch only has to reach Netlify, which answers a background call with 202 at once. */
const DISPATCH_TIMEOUT_MS = 10_000;

/**
 * The header value: HMAC-SHA256(label) keyed with the service-role key, hex.
 * Null when the key is absent — callers must then neither send nor accept.
 */
export function knowledgeSyncKey(
  serviceKey: string | undefined = process.env.SUPABASE_SERVICE_ROLE_KEY,
): string | null {
  if (!serviceKey) return null;
  return createHmac('sha256', serviceKey).update(KNOWLEDGE_SYNC_KEY_LABEL).digest('hex');
}

/** Constant-time check of the request's `x-pbt-sync-key`. False when either side is missing. */
export function verifyKnowledgeSyncKey(req: Request): boolean {
  const expected = knowledgeSyncKey();
  if (!expected) return false;
  const given = req.headers.get(KNOWLEDGE_SYNC_KEY_HEADER) ?? '';
  const a = Buffer.from(given, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * The deploy context this code runs in: the v2 `context.deploy.context` when
 * Netlify provides it, else the `CONTEXT` env var, else ''.
 */
export function deployContext(ctx?: NetlifyContextLike): string {
  return ctx?.deploy?.context ?? process.env.CONTEXT ?? '';
}

/**
 * May a knowledge sync run (or be kicked) from here?
 *
 *   production — yes, unless Netlify says this deploy is NOT the published
 *                one (an old production deploy reached at its permalink).
 *   dev        — only with an explicit PBT_ALLOW_DEV_SYNC=1 (`netlify dev`
 *                testing against a project you mean to write to).
 *   anything else (deploy-preview, branch-deploy, unknown) — no.
 */
export function syncAllowedHere(ctx?: NetlifyContextLike): { ok: boolean; reason?: string } {
  const context = deployContext(ctx);
  if (context === 'production') {
    if (ctx?.deploy?.published === false) {
      return { ok: false, reason: 'this production deploy is not the published deploy' };
    }
    return { ok: true };
  }
  if (context === 'dev') {
    return process.env.PBT_ALLOW_DEV_SYNC === '1'
      ? { ok: true }
      : { ok: false, reason: 'CONTEXT is dev (set PBT_ALLOW_DEV_SYNC=1 to allow)' };
  }
  return { ok: false, reason: `deploy context "${context || 'unknown'}" never syncs` };
}

/** The primary site URL — never a request's host. Null when unknown. */
function primarySiteUrl(ctx?: NetlifyContextLike): string | null {
  return process.env.URL || ctx?.site?.url || null;
}

type TriggerState = 'idle' | 'pending' | 'done';
let state: TriggerState = 'idle';
let retryAfter = 0;

/**
 * Kick the background sync. Synchronous and total: it cannot throw, and it
 * never delays the caller.
 *
 * @returns true if a request was dispatched (for tests and logging).
 */
export function triggerKnowledgeSync(ctx?: NetlifyContextLike): boolean {
  if (state !== 'idle' || Date.now() < retryAfter) return false;
  if (!syncAllowedHere(ctx).ok) return false;
  const key = knowledgeSyncKey();
  const base = primarySiteUrl(ctx);
  if (!key || !base) return false;

  let url: string;
  try {
    url = new URL(KNOWLEDGE_SYNC_PATH, base).toString();
  } catch {
    // A malformed URL env var is not worth a log line on every boot.
    return false;
  }

  state = 'pending';
  const fail = () => {
    state = 'idle';
    retryAfter = Date.now() + RETRY_BACKOFF_MS;
  };
  let dispatch: Promise<void>;
  try {
    dispatch = fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', [KNOWLEDGE_SYNC_KEY_HEADER]: key },
      body: '{}',
      signal: AbortSignal.timeout(DISPATCH_TIMEOUT_MS),
    }).then(
      (res) => {
        if (res.ok) state = 'done';
        else fail();
      },
      () => fail(),
    );
  } catch {
    fail();
    return false;
  }

  try {
    ctx?.waitUntil?.(dispatch);
  } catch {
    // waitUntil unavailable on this runtime — the dispatch is already in flight.
  }
  return true;
}

/** Test hook — the trigger state is module-level. */
export function __resetKnowledgeTrigger(): void {
  state = 'idle';
  retryAfter = 0;
}
