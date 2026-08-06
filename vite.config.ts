import path from 'path';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

/**
 * Mirror the Netlify redirects during `vite dev`.
 *
 * In production `netlify.toml` rewrites `/admin/*` → `/admin.html` and
 * everything else → `/index.html`. Without the same rule locally, real routes
 * — `/admin/invite`, `/admin/reset`, `/reset-password` — 404 on the dev server,
 * so the flows people actually arrive at from an email can't be tested.
 */
function devSpaFallback(): Plugin {
  return {
    name: 'pbt-dev-spa-fallback',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        const url = req.url ?? '/';
        const [pathname] = url.split('?');
        // Leave assets, modules, and Vite's own endpoints alone.
        if (pathname.includes('.') || pathname.startsWith('/@') || pathname.startsWith('/node_modules')) {
          return next();
        }
        if (pathname === '/admin' || pathname.startsWith('/admin/')) {
          req.url = '/admin.html';
        } else if (pathname !== '/') {
          req.url = '/index.html';
        }
        next();
      });
    },
  };
}

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, process.cwd(), '');
    return {
      server: {
        port: 3006,
        host: '0.0.0.0',
      },
      plugins: [react(), tailwindcss(), devSpaFallback()],
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
          // Two entries — the consumer PWA and the admin dashboard.
          // Both built into dist/. Netlify routes `/admin/*` → `/admin.html`.
          input: {
            main: path.resolve(__dirname, 'index.html'),
            admin: path.resolve(__dirname, 'admin.html'),
          },
          output: {
            /*
             * Vendor splitting (function form — see below for why).
             *
             * The previous object form (`{ 'vendor-react': ['react', …] }`)
             * pins *resolved module ids*, which silently mis-fired for
             * packages whose bundled entry differs from their node-resolved
             * one: `vendor-react` and `vendor-supabase` came out as 0-byte
             * chunks while react-dom leaked into an auto-named shared chunk,
             * and `vendor-recharts` over-claimed recharts' small shared
             * dependencies — which made the *consumer* entry statically
             * import the 118 kB-gzip charting chunk it never uses.
             *
             * The function form matches on node_modules path instead, so each
             * bucket contains exactly its package tree and nothing else.
             * Order matters: react is claimed before recharts so recharts
             * can't swallow it.
             */
            manualChunks(id) {
              const norm = id.replace(/\\/g, '/');
              const i = norm.lastIndexOf('node_modules/');
              if (i === -1) return;
              const pkg = norm.slice(i + 'node_modules/'.length);

              // Tiny class-name utilities shared by BOTH entries. They must be
              // claimed first: left unassigned, rollup folded `clsx` into
              // vendor-recharts, which is what dragged the whole charting
              // chunk onto the consumer's critical path.
              if (/^(clsx|tailwind-merge|class-variance-authority)\//.test(pkg))
                return 'vendor-ui';

              if (/^(react|react-dom|scheduler)\//.test(pkg)) return 'vendor-react';
              if (pkg.startsWith('@google/genai/')) return 'vendor-genai';
              if (pkg.startsWith('@supabase/')) return 'vendor-supabase';
              if (/^(motion|motion-dom|motion-utils|framer-motion)\//.test(pkg))
                return 'vendor-motion';
              // Admin-only — keeps the consumer bundle from importing it.
              if (/^(recharts|victory-vendor|d3-[^/]+)\//.test(pkg))
                return 'vendor-recharts';
              // ~390 kB gzip of password dictionaries. Its own chunk so it is
              // cached across deploys instead of invalidating the app bundle.
              // TODO: `src/features/auth/passwordStrength.ts` still imports it
              // statically, so it is on the consumer's critical path. Switching
              // that to a dynamic import() is the single biggest remaining win.
              if (pkg.startsWith('zxcvbn/')) return 'vendor-zxcvbn';
            },
          },
        },
        chunkSizeWarningLimit: 700,
      },
    };
});
