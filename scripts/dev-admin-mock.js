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
    env: { ...process.env, VITE_ADMIN_MOCK: '1' },
  },
);

child.on('exit', (code) => process.exit(code ?? 0));
