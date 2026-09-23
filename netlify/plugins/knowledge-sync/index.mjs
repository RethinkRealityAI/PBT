/**
 * Netlify build plugin — keep the RAG knowledge base seeded, with no admin
 * action and no button in the UI.
 *
 * Runs `scripts/knowledge-sync.ts` in `onSuccess`, i.e. AFTER the deploy is
 * built, for two reasons: a knowledge write must never be able to hold up (or
 * fail) a site deploy, and the studies are read from the repo rather than
 * over HTTP, so nothing here depends on the deploy URL. The engine runs
 * in-process (a child `node`), not through `knowledge-sync-background`, so it
 * needs no `x-pbt-sync-key` — it holds the service-role key itself and takes
 * the same database lease as every other sync.
 *
 * Four deliberate properties:
 *
 *   • Production only. Netlify applies environment variables to EVERY deploy
 *     context by default, so Deploy Previews and branch deploys DO usually
 *     have SUPABASE_SERVICE_ROLE_KEY — and they would write their branch's
 *     corpus into the shared production database. The context check below is
 *     the guard, not the absence of a secret. (A production build published
 *     with auto-publishing off is still a production build; the sync's
 *     content hashing makes a later published build correct it.)
 *   • Fail-open. Any error is reported through `utils.status.show` and
 *     swallowed. The app works without a corpus — retrieval returns nothing
 *     and the prompts fall back to their bundled text — so a Gemini outage
 *     must not turn a green deploy red.
 *   • Bounded. Both child processes run under a hard timeout and are killed
 *     when it expires, so a hung extraction can never hang the build. A
 *     killed run leaves the lease to expire on its own (15 min) and the next
 *     sync picks up whatever is still stale.
 *   • Cheap when nothing changed. The script hashes every document (and every
 *     study PDF) and skips what already matches, so the steady-state cost of
 *     a deploy is a handful of SELECTs.
 */
import { exec } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(exec);

/** Contexts allowed to write the (shared, production) knowledge base. */
const SYNCED_CONTEXTS = ['production'];

/** Hard ceilings for the child processes — the build must never hang on us. */
const BUILD_TIMEOUT_MS = 2 * 60_000;
const RUN_TIMEOUT_MS = 10 * 60_000;

const BUILD =
  'npx esbuild scripts/knowledge-sync.ts --bundle --platform=node --format=esm ' +
  '--packages=external --outfile=.netlify/knowledge-sync.mjs';
const RUN = 'node .netlify/knowledge-sync.mjs';

/** The script's last line is its summary; surface that, not 200 lines of table. */
function summaryLine(stdout) {
  const lines = String(stdout ?? '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  const summary = [...lines].reverse().find((l) => l.startsWith('knowledge sync:'));
  return summary ?? lines[lines.length - 1] ?? 'no output';
}

export const onSuccess = async ({ utils }) => {
  const context = process.env.CONTEXT ?? 'unknown';
  if (!SYNCED_CONTEXTS.includes(context)) {
    console.log(
      `[knowledge-sync] skipped — CONTEXT is "${context}" ` +
        `(syncs run on ${SYNCED_CONTEXTS.join(' and ')} only).`,
    );
    return;
  }

  // Names only — never log a value.
  const missing = ['GEMINI_API_KEY', 'SUPABASE_SERVICE_ROLE_KEY'].filter((n) => !process.env[n]);
  if (!process.env.SUPABASE_URL && !process.env.VITE_SUPABASE_URL) {
    missing.push('SUPABASE_URL (or VITE_SUPABASE_URL)');
  }
  if (missing.length > 0) {
    utils.status.show({
      title: 'Knowledge base not synced',
      summary: `Missing environment variable(s): ${missing.join(', ')}.`,
      text: 'The site is unaffected — retrieval falls back to the prompts’ bundled text.',
    });
    return;
  }

  try {
    console.log('[knowledge-sync] bundling scripts/knowledge-sync.ts…');
    await run(BUILD, {
      cwd: process.cwd(),
      maxBuffer: 16 * 1024 * 1024,
      timeout: BUILD_TIMEOUT_MS,
      killSignal: 'SIGKILL',
    });
    console.log('[knowledge-sync] syncing the built-in knowledge base…');
    const { stdout, stderr } = await run(RUN, {
      cwd: process.cwd(),
      maxBuffer: 64 * 1024 * 1024,
      timeout: RUN_TIMEOUT_MS,
      killSignal: 'SIGKILL',
    });
    if (stdout) console.log(stdout);
    if (stderr) console.warn(stderr);
    utils.status.show({
      title: 'Knowledge base synced',
      summary: summaryLine(stdout),
    });
  } catch (err) {
    // Fail-open: a knowledge sync that fails must NOT fail the deploy.
    const timedOut = err?.killed === true && err?.signal === 'SIGKILL';
    const detail = [
      timedOut ? 'timed out — the child process was killed' : null,
      err?.stdout,
      err?.stderr,
      err?.message,
    ]
      .filter(Boolean)
      .join('\n')
      .trim();
    console.warn('[knowledge-sync] sync failed (deploy is unaffected)');
    if (detail) console.warn(detail);
    utils.status.show({
      title: 'Knowledge base sync failed (deploy is live)',
      summary: timedOut
        ? 'Timed out — the sync was stopped so the build could finish.'
        : summaryLine(err?.stderr || err?.message || 'unknown error'),
      text:
        'Retrieval keeps whatever is already stored and falls back to bundled prompt text. ' +
        'Re-run it by hand with `npm run knowledge:sync`.',
    });
  }
};
