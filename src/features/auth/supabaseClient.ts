import { createClient, type SupabaseClient } from '@supabase/supabase-js';

declare global {
  // Vite injects these via import.meta.env at build time.
  interface ImportMetaEnv {
    readonly VITE_SUPABASE_URL?: string;
    readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string;
  }
}

let cachedClient: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient | null {
  if (cachedClient) return cachedClient;
  const url = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    console.warn(
      '[pbt:auth] Supabase env vars missing. Account upgrade is disabled.',
    );
    return null;
  }
  cachedClient = createClient(url, key, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      storageKey: 'pbt:supabase_session',
    },
  });
  return cachedClient;
}
