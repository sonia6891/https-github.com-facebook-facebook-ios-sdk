import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(process.cwd());
const bridgeSourcePath = resolve(root, 'ios-sources/ViewController.swift');
const scenePath = resolve(root, 'ios/App/App/SceneDelegate.swift');
const projectPath = resolve(root, 'ios/App/App.xcodeproj/project.pbxproj');
const privacySourcePath = resolve(root, 'ios-sources/PrivacyInfo.xcprivacy');
const privacyTargetPath = resolve(root, 'ios/App/App/PrivacyInfo.xcprivacy');
const entitlementsSourcePath = resolve(root, 'ios-sources/App.entitlements');
const entitlementsTargetPath = resolve(root, 'ios/App/App/App.entitlements');

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

const entitlements = readFileSync(entitlementsSourcePath, 'utf8');
writeFileSync(entitlementsTargetPath, entitlements);

let project = readFileSync(projectPath, 'utf8');
let deviceFamilyMatches = project.match(/TARGETED_DEVICE_FAMILY = "1,2";/g) || [];
if (deviceFamilyMatches.length < 2) {
  throw new Error('Unable to locate iPhone+iPad target settings before narrowing v1 to iPhone.');
}
project = project.replace(/TARGETED_DEVICE_FAMILY = "1,2";/g, 'TARGETED_DEVICE_FAMILY = 1;');

const privacyBuildId = 'A15100000000000000000001';
const privacyFileId = 'A15100000000000000000002';

if (!project.includes('CODE_SIGN_ENTITLEMENTS = App/App.entitlements;')) {
  const signStylePattern = /\t\t\t\tCODE_SIGN_STYLE = Automatic;/g;
  const matches = project.match(signStylePattern) || [];
  if (matches.length < 2) {
    throw new Error('Unable to locate target signing build settings for App.entitlements.');
  }
  project = project.replace(
    signStylePattern,
    '\t\t\t\tCODE_SIGN_ENTITLEMENTS = App/App.entitlements;\n\t\t\t\tCODE_SIGN_STYLE = Automatic;'
  );
}

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

console.log('Patched generated SceneDelegate, native bridges, app PrivacyInfo.xcprivacy, and Sign in with Apple entitlements.');
