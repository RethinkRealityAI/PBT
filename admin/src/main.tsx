import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';

/**
 * Offline UI harness. `VITE_ADMIN_MOCK=1 npm run dev` seeds a fake session and
 * answers every function call from fixtures, so the portal can be reviewed
 * without a Supabase project. The import is inside the branch, so production
 * builds drop the fixtures entirely.
 */
async function boot() {
  if (import.meta.env.VITE_ADMIN_MOCK === '1') {
    const { installAdminMocks } = await import('./dev/mockApi');
    installAdminMocks();
  }
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

void boot();
