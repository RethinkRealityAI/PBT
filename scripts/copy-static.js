// Copies static micro-sites from docs/ into dist/ after the Vite build so
// Netlify's file-first routing serves them at their natural paths.
// e.g.  docs/scenario-template/ → dist/scenario-template/

import { cpSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const copies = [
  { src: 'docs/scenario-template', dst: 'dist/scenario-template' },
];

for (const { src, dst } of copies) {
  cpSync(resolve(root, src), resolve(root, dst), { recursive: true });
  console.log(`copied ${src} → ${dst}`);
}
