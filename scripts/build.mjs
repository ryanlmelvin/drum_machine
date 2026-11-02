import { cp, mkdir, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import './version-service-worker.mjs';
const root = fileURLToPath(new URL('../', import.meta.url));
const dist = path.join(root, 'dist');
await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
for (const entry of ['index.html', 'styles.css', 'app.js', 'audio.js', 'rhythm.js', 'pwa.js', 'sw.js', 'manifest.webmanifest', 'icons', 'assets', 'LICENSE', 'THIRD_PARTY_NOTICES.md']) {
  await cp(path.join(root, entry), path.join(dist, entry), { recursive: true });
}
await cp(path.join(root, '.nojekyll'), path.join(dist, '.nojekyll'));
console.log('Static GitHub Pages app built in dist/.');
