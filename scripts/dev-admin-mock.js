/**
 * `npm run dev:admin-mock` — the admin portal, offline.
 *
 * Starts Vite on port 3007 with `VITE_ADMIN_MOCK=1`, which makes
 * `admin/src/main.tsx` install `admin/src/dev/mockApi.ts`: a seeded fake
 * session plus fixtures for every `/.netlify/functions/*` call, so the screens
 * can be reviewed and screenshotted with no Supabase project and no deploy.
 *
 * It exists because `VITE_ADMIN_MOCK=1 vite` is a shell-ism that does not run
 * on Windows `cmd`/PowerShell, and `cross-env` is not a dependency of this
 * repo. Setting the variable in Node and spawning Vite works everywhere.
 *
 * Open http://localhost:3007/admin (add `?mock=signedout` for the sign-in
 * screens).
 */
import { spawn } from 'node:child_process';

const child = spawn(
  'npx',
  ['vite', '--port', '3007', '--strictPort'],
  {
    stdio: 'inherit',
    shell: true,
    env: {
      ...process.env,
      VITE_ADMIN_MOCK: '1',
      // The Supabase client is created before the mock intercepts anything,
      // and it refuses to start without these. Nothing is ever sent to them —
      // every call is answered by the mock — so placeholders are enough on a
      // machine with no .env (a fresh clone, CI, a review container).
      VITE_SUPABASE_URL: process.env.VITE_SUPABASE_URL || 'http://localhost:54321',
      VITE_SUPABASE_PUBLISHABLE_KEY: process.env.VITE_SUPABASE_PUBLISHABLE_KEY || 'mock-publishable-key',
    },
  },
);

child.on('exit', (code) => process.exit(code ?? 0));
