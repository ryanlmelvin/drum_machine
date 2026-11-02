import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = fileURLToPath(new URL('../', import.meta.url));
const read = file => readFile(path.join(root, file), 'utf8');
for (const file of ['app.js', 'audio.js', 'rhythm.js', 'pwa.js', 'sw.js']) execFileSync(process.execPath, ['--check', path.join(root, file)]);
execFileSync(process.execPath, [path.join(root, 'scripts/version-service-worker.mjs'), '--check'], { stdio: 'inherit' });
const html = await read('index.html');
for (const [, url] of html.matchAll(/(?:href|src)="([^"#]+)"/g)) {
  if (/^https?:/.test(url)) continue;
  assert(url.startsWith('./'), `Asset must be relative for GitHub Pages: ${url}`);
  await stat(path.join(root, url));
}
const manifest = JSON.parse(await read('manifest.webmanifest'));
assert.equal(manifest.start_url, './');
assert.equal(manifest.scope, './');
assert.equal(manifest.display, 'standalone');
for (const icon of manifest.icons) {
  const data = await readFile(path.join(root, icon.src));
  assert.equal(data.subarray(1, 4).toString(), 'PNG');
  const [width, height] = icon.sizes.split('x').map(Number);
  assert.equal(data.readUInt32BE(16), width);
  assert.equal(data.readUInt32BE(20), height);
}
const provenance = JSON.parse(await read('assets/audio/sources.json'));
assert.equal(provenance.license, 'CC0-1.0');
for (const sample of provenance.samples) {
  const data = await readFile(path.join(root, sample.file));
  assert.equal(createHash('sha256').update(data).digest('hex'), sample.sha256, `${sample.file} provenance hash`);
  assert.equal(data.subarray(0, 4).toString(), 'RIFF');
  assert.equal(data.subarray(8, 12).toString(), 'WAVE');
}
console.log('JavaScript, relative paths, install icons, and CC0 sound provenance checked.');
