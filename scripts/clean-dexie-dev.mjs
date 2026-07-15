import { cp, mkdir, rm, stat, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { homedir, platform } from 'node:os';
import path from 'node:path';

const APP_IDENTIFIER = 'com.asepimamnawawi-imam76.frayukti-app';
const DEV_ORIGIN_ID = 'http_localhost_1420';

const home = homedir();
const currentPlatform = platform();

const linuxDataHome = process.env.XDG_DATA_HOME
  || path.join(home, '.local', 'share');
const linuxConfigHome = process.env.XDG_CONFIG_HOME
  || path.join(home, '.config');
const macApplicationSupport = path.join(home, 'Library', 'Application Support');
const windowsRoamingAppData = process.env.APPDATA
  || path.join(home, 'AppData', 'Roaming');
const windowsLocalAppData = process.env.LOCALAPPDATA
  || path.join(home, 'AppData', 'Local');

const timestamp = new Date()
  .toISOString()
  .replace(/[-:]/g, '')
  .replace(/\.\d{3}Z$/, '');

const backupDir = path.join(
  currentPlatform === 'darwin'
    ? macApplicationSupport
    : currentPlatform === 'win32'
      ? windowsLocalAppData
      : linuxDataHome,
  'kasirku-dexie-clean-backups',
  timestamp,
);

const indexedDbPaths = (basePath) => [
  path.join(basePath, `${DEV_ORIGIN_ID}.indexeddb.leveldb`),
  path.join(basePath, `${DEV_ORIGIN_ID}.indexeddb.blob`),
];

const platformCandidates = {
  linux: [
    path.join(linuxDataHome, APP_IDENTIFIER),
    ...indexedDbPaths(path.join(linuxConfigHome, 'BraveSoftware', 'Brave-Browser', 'Default', 'IndexedDB')),
    ...indexedDbPaths(path.join(linuxConfigHome, 'google-chrome', 'Default', 'IndexedDB')),
    ...indexedDbPaths(path.join(linuxConfigHome, 'Code', 'Partitions', 'vscode-browser', 'IndexedDB')),
  ],
  darwin: [
    path.join(macApplicationSupport, APP_IDENTIFIER),
    path.join(home, 'Library', 'WebKit', APP_IDENTIFIER),
    ...indexedDbPaths(path.join(macApplicationSupport, 'BraveSoftware', 'Brave-Browser', 'Default', 'IndexedDB')),
    ...indexedDbPaths(path.join(macApplicationSupport, 'Google', 'Chrome', 'Default', 'IndexedDB')),
    ...indexedDbPaths(path.join(macApplicationSupport, 'Code', 'Partitions', 'vscode-browser', 'IndexedDB')),
  ],
  win32: [
    path.join(windowsRoamingAppData, APP_IDENTIFIER),
    path.join(windowsLocalAppData, APP_IDENTIFIER),
    ...indexedDbPaths(path.join(windowsLocalAppData, 'BraveSoftware', 'Brave-Browser', 'User Data', 'Default', 'IndexedDB')),
    ...indexedDbPaths(path.join(windowsLocalAppData, 'Google', 'Chrome', 'User Data', 'Default', 'IndexedDB')),
    ...indexedDbPaths(path.join(windowsRoamingAppData, 'Code', 'Partitions', 'vscode-browser', 'IndexedDB')),
  ],
};

const candidates = [...new Set(platformCandidates[currentPlatform] || [])];

if (candidates.length === 0) {
  throw new Error(`Unsupported operating system: ${currentPlatform}`);
}

const sanitizePathForBackup = (targetPath) => targetPath
  .replace(home, 'home')
  .replace(/[^a-zA-Z0-9._-]+/g, '_')
  .replace(/^_+|_+$/g, '');

const cleaned = [];
const missing = [];

await mkdir(backupDir, { recursive: true });

for (const targetPath of candidates) {
  if (!existsSync(targetPath)) {
    missing.push(targetPath);
    continue;
  }

  const targetStat = await stat(targetPath);
  const backupPath = path.join(backupDir, sanitizePathForBackup(targetPath));

  await cp(targetPath, backupPath, {
    recursive: targetStat.isDirectory(),
    force: true,
    errorOnExist: false,
  });
  await rm(targetPath, { recursive: true, force: true });
  cleaned.push({ path: targetPath, backup: backupPath });
}

const manifest = {
  createdAt: new Date().toISOString(),
  platform: currentPlatform,
  note: 'Dexie/IndexedDB dev storage backup before local clean.',
  cleaned,
  missing,
};

await writeFile(
  path.join(backupDir, 'manifest.json'),
  `${JSON.stringify(manifest, null, 2)}\n`,
  'utf-8',
);

if (cleaned.length === 0) {
  console.log('No Dexie/WebView dev storage found to clean.');
  console.log(`Backup manifest: ${backupDir}`);
  process.exit(0);
}

for (const item of cleaned) {
  console.log(`cleaned ${item.path}`);
  console.log(`backup  ${item.backup}`);
}

console.log(`backup manifest: ${path.join(backupDir, 'manifest.json')}`);
