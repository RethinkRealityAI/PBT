import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Standalone admin app — deploys to admin.<your-domain>.
// Reads VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY from env;
// admin gating is enforced server-side by the `is_admin` RLS policy.
export default defineConfig({
  plugins: [react()],
  server: { port: 5180 },
  build: {
    outDir: 'dist',
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom'],
          'vendor-supabase': ['@supabase/supabase-js'],
        },
      },
    },
  },
});
