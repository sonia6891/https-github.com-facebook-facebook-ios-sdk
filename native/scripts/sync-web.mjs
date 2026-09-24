import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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
  'privacy.html',
  'terms.html',
  'support.html',
  'workcat-home-v12.png',
  'app-icon-v154-180.png',
  'app-icon-v154-192.png',
  'app-icon-v154-512.png'
];

for (const name of files) {
  const source = join(repoRoot, name);
  if (!existsSync(source)) throw new Error(`Missing web asset: ${name}`);
  cpSync(source, join(out, name));
}
cpSync(join(repoRoot, 'assets'), join(out, 'assets'), { recursive: true });

const nativeIndex = join(out, 'index.html');
let html = readFileSync(nativeIndex, 'utf8');
html = html.replace(
  "const bridge=window.MeowStoreBilling;",
  "const bridge=window.MeowStoreBilling||(window.Capacitor&&window.Capacitor.Plugins&&window.Capacitor.Plugins.MeowStoreBilling);"
);
html = html.replace(
  "目前是網頁預覽版，不會進行付款。",
  "目前這個環境尚未連上商店付款。"
);
writeFileSync(nativeIndex, html);

console.log(`Synced web app into ${out}`);
