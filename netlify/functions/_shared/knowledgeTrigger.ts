/**
 * Fire-and-forget kick for `knowledge-sync-background`.
 *
 * Nothing in the product should depend on a human remembering to seed the
 * knowledge base, and the build plugin only covers builds. So the two
 * endpoints that are hit whenever the product is actually being USED — the
 * public flag resolve (every app boot) and the admin Knowledge screen's GET —
 * nudge the background function on their way out.
 *
 * Three rules, all about not being felt:
 *
 *   • ONCE per function instance. A module-level flag, not a timer: a warm
 *     instance serving a thousand boots fires one POST, and a cold start
 *     fires one more. The real de-duplication is the background function's
 *     own cooldown; this just keeps the noise off the wire.
 *   • NEVER awaited. The caller's response must not wait on it, and a
 *     rejected promise must not become an unhandled rejection.
 *   • NEVER in `CONTEXT=dev`. `netlify dev` runs with masked secrets, so the
 *     sync would fail on every local boot and fill the terminal with noise.
 */

let triggered = false;

/** Contexts where firing the sync can actually accomplish something. */
function enabled(): boolean {
  return (process.env.CONTEXT ?? '') !== 'dev';
}

/**
 * Kick the background sync, at most once per instance. Synchronous and
 * total: it cannot throw, and it returns before the request completes.
 *
 * @returns true if a request was dispatched (for tests and logging).
 */
export function triggerKnowledgeSync(req: Request): boolean {
  if (triggered || !enabled()) return false;
  triggered = true;
  try {
    const url = new URL('/.netlify/functions/knowledge-sync-background', req.url);
    // `void` + `.catch` so a network failure can never surface as an
    // unhandled rejection in the caller's request.
    void fetch(url.toString(), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    }).catch(() => {});
    return true;
  } catch {
    // A malformed req.url is not worth a log line on every boot.
    return false;
  }
}

/** Test hook — the "once per instance" flag is module-level. */
export function __resetKnowledgeTrigger(): void {
  triggered = false;
}
