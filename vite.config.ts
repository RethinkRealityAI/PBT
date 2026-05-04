import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, process.cwd(), '');
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [react(), tailwindcss()],
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      },
      // Inject the Gemini API key into the client bundle at build time.
      // Without this, `process.env.GEMINI_API_KEY` references stay literal in
      // the output and throw `ReferenceError: process is not defined` in the
      // browser the moment a module reading them loads — blanking the page.
      // GEMINI_API_KEY must be set in Netlify → Site configuration → Environment variables.
      define: {
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY ?? ''),
      },
      build: {
        rollupOptions: {
          output: {
            manualChunks: {
              'vendor-react': ['react', 'react-dom'],
              'vendor-genai': ['@google/genai'],
              'vendor-supabase': ['@supabase/supabase-js'],
              'vendor-motion': ['motion'],
            },
          },
        },
        chunkSizeWarningLimit: 700,
      },
    };
});
