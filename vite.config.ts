import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(({ mode }) => {
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
      // Inject Node env vars into the client bundle at build time.
      // GEMINI_API_KEY must be set in Netlify → Site configuration → Environment variables.
      define: {
        'process.env.GEMINI_API_KEY': JSON.stringify(process.env.GEMINI_API_KEY ?? ''),
      },
      build: {
        // Keep the @google/genai SDK in its own long-lived chunk so app code
        // edits don't bust its cache on every deploy.
        rollupOptions: {
          output: {
            manualChunks: {
              'genai':  ['@google/genai'],
              'react':  ['react', 'react-dom'],
              'icons':  ['lucide-react'],
            },
          },
        },
        chunkSizeWarningLimit: 900,
      },
    };
});
