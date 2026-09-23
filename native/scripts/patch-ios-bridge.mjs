import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(process.cwd());
const bridgeSourcePath = resolve(root, 'ios-sources/ViewController.swift');
const scenePath = resolve(root, 'ios/App/App/SceneDelegate.swift');
const projectPath = resolve(root, 'ios/App/App.xcodeproj/project.pbxproj');
const privacySourcePath = resolve(root, 'ios-sources/PrivacyInfo.xcprivacy');
const privacyTargetPath = resolve(root, 'ios/App/App/PrivacyInfo.xcprivacy');

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

const privacyManifest = readFileSync(privacySourcePath, 'utf8');
writeFileSync(privacyTargetPath, privacyManifest);

let project = readFileSync(projectPath, 'utf8');
const privacyBuildId = 'A15100000000000000000001';
const privacyFileId = 'A15100000000000000000002';

if (!project.includes('PrivacyInfo.xcprivacy in Resources')) {
  project = project.replace(
    '/* End PBXBuildFile section */',
    `\t\t${privacyBuildId} /* PrivacyInfo.xcprivacy in Resources */ = {isa = PBXBuildFile; fileRef = ${privacyFileId} /* PrivacyInfo.xcprivacy */; };\n/* End PBXBuildFile section */`
  );
  project = project.replace(
    '/* End PBXFileReference section */',
    `\t\t${privacyFileId} /* PrivacyInfo.xcprivacy */ = {isa = PBXFileReference; lastKnownFileType = text.xml; path = PrivacyInfo.xcprivacy; sourceTree = "<group>"; };\n/* End PBXFileReference section */`
  );

  const infoLine = project.match(/^\s+[0-9A-F]+ \/\* Info\.plist \*\/,\s*$/m);
  if (!infoLine) throw new Error('Unable to locate App group Info.plist anchor in Xcode project.');
  project = project.replace(
    infoLine[0],
    `\t\t\t\t${privacyFileId} /* PrivacyInfo.xcprivacy */,\n${infoLine[0]}`
  );

  const resourcesStart = project.indexOf('/* Begin PBXResourcesBuildPhase section */');
  const resourcesEnd = project.indexOf('/* End PBXResourcesBuildPhase section */');
  if (resourcesStart < 0 || resourcesEnd < 0) throw new Error('Unable to locate Resources build phase.');
  let resourcesBlock = project.slice(resourcesStart, resourcesEnd);
  resourcesBlock = resourcesBlock.replace(
    'files = (\n',
    `files = (\n\t\t\t\t${privacyBuildId} /* PrivacyInfo.xcprivacy in Resources */,\n`
  );
  project = project.slice(0, resourcesStart) + resourcesBlock + project.slice(resourcesEnd);
}
writeFileSync(projectPath, project);

console.log('Patched generated SceneDelegate, native bridges, and app PrivacyInfo.xcprivacy.');
