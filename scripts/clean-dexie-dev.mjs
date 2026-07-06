import { cp, mkdir, rm, stat, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

const APP_IDENTIFIER = 'com.asepimamnawawi-imam76.frayukti-app';
const DEV_ORIGIN_ID = 'http_localhost_1420';

const home = homedir();

const timestamp = new Date()
  .toISOString()
  .replace(/[-:]/g, '')
  .replace(/\.\d{3}Z$/, '');

const backupDir = path.join(
  home,
  '.local',
  'share',
  'kasirku-dexie-clean-backups',
  timestamp,
);

const candidates = [
  path.join(home, '.local', 'share', APP_IDENTIFIER),
  path.join(home, '.config', 'BraveSoftware', 'Brave-Browser', 'Default', 'IndexedDB', `${DEV_ORIGIN_ID}.indexeddb.leveldb`),
  path.join(home, '.config', 'BraveSoftware', 'Brave-Browser', 'Default', 'IndexedDB', `${DEV_ORIGIN_ID}.indexeddb.blob`),
  path.join(home, '.config', 'Code', 'Partitions', 'vscode-browser', 'IndexedDB', `${DEV_ORIGIN_ID}.indexeddb.leveldb`),
  path.join(home, '.config', 'Code', 'Partitions', 'vscode-browser', 'IndexedDB', `${DEV_ORIGIN_ID}.indexeddb.blob`),
];

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
