import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const nativeRoot = resolve(here, '..');
const repoRoot = resolve(nativeRoot, '..');
const out = join(nativeRoot, 'www');

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

const files = [
  'index.html',
  'manifest.webmanifest',
  'sw.js',
  'workcat-home-v12.png',
  'app-icon-v115-180.png',
  'app-icon-v115-192.png',
  'app-icon-v115-512.png'
];

for (const name of files) {
  const source = join(repoRoot, name);
  if (!existsSync(source)) throw new Error(`Missing web asset: ${name}`);
  cpSync(source, join(out, name));
}
cpSync(join(repoRoot, 'assets'), join(out, 'assets'), { recursive: true });

console.log(`Synced web app into ${out}`);
