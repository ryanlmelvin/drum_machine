// Deterministically version every shipped asset, including the worker's own logic.
import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const workerPath = path.join(root, 'sw.js');
const source = await readFile(workerPath, 'utf8');
const files = new Set(['index.html', 'manifest.webmanifest']);
for (const entry of await readdir(root, { withFileTypes: true })) {
  if (entry.isFile() && /\.(?:html|css|js)$/.test(entry.name) && entry.name !== 'sw.js') files.add(entry.name);
}
async function includeDirectory(directory) {
  try {
    for (const entry of await readdir(path.join(root, directory), { withFileTypes: true })) {
      if (entry.name.startsWith('.')) continue;
      const relative = path.posix.join(directory, entry.name);
      if (entry.isDirectory()) await includeDirectory(relative);
      else if (entry.isFile()) files.add(relative);
    }
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
}
await Promise.all(['icons', 'assets'].map(includeDirectory));
for (const filename of ['THIRD_PARTY_NOTICES.md', 'LICENSE']) {
  try { if ((await stat(path.join(root, filename))).isFile()) files.add(filename); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
}
const sorted = [...files].sort();
const normalized = source.replace(/^const VERSION = .*;$/m, "const VERSION = '';" )
  .replace(/^const ASSETS = .*;$/m, 'const ASSETS = [];');
const hash = createHash('sha256').update(normalized);
for (const filename of sorted) {
  hash.update(filename).update('\0').update(await readFile(path.join(root, filename))).update('\0');
}
const version = hash.digest('hex').slice(0, 16);
const output = source.replace(/^const VERSION = .*;$/m, `const VERSION = '${version}';`)
  .replace(/^const ASSETS = .*;$/m, `const ASSETS = ${JSON.stringify(['./', ...sorted.map(file => `./${file}`)])};`);
if (process.argv.includes('--check')) {
  if (output !== source) {
    console.error('Service worker assets changed. Run npm run build (or node scripts/version-service-worker.mjs).');
    process.exitCode = 1;
  } else console.log(`Service worker is current (${version}; ${sorted.length} files).`);
} else {
  if (output !== source) await writeFile(workerPath, output);
  console.log(`Service worker ${version}; ${sorted.length} files cached.`);
}
