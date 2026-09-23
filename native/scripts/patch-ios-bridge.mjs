import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(process.cwd());
const bridgeSourcePath = resolve(root, 'ios-sources/ViewController.swift');
const scenePath = resolve(root, 'ios/App/App/SceneDelegate.swift');

const bridgeSource = readFileSync(bridgeSourcePath, 'utf8');
const sceneSource = readFileSync(scenePath, 'utf8');

const importPattern = /^import\s+[^\n]+$/gm;
const imports = [
  ...bridgeSource.match(importPattern) || [],
  ...sceneSource.match(importPattern) || []
];
const uniqueImports = [...new Set(imports)];

const bridgeBody = bridgeSource.replace(importPattern, '').trim();
let sceneBody = sceneSource.replace(importPattern, '').trim();

if (!sceneBody.includes('window?.rootViewController = CAPBridgeViewController()')) {
  throw new Error('Expected generated Capacitor SceneDelegate root controller was not found.');
}
sceneBody = sceneBody.replace(
  'window?.rootViewController = CAPBridgeViewController()',
  'window?.rootViewController = ViewController()'
);

const output = [
  uniqueImports.join('\n'),
  '',
  bridgeBody,
  '',
  sceneBody,
  ''
].join('\n');

writeFileSync(scenePath, output);

console.log('Patched generated SceneDelegate with compiled StoreKit + reminder bridge and custom root ViewController.');
