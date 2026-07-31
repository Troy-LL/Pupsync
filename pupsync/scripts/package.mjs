/**
 * Build a Chrome Web Store zip of shippable extension files only.
 * Run: cd pupsync && npm run package
 */
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pupsyncRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(pupsyncRoot, '..');
const distDir = path.join(repoRoot, 'dist');
const stageDir = path.join(distDir, 'pupsync');
const zipPath = path.join(distDir, 'pupsync.zip');

const INCLUDE_DIRS = ['background', 'content', 'popup', 'shared', 'icons', 'config'];
const INCLUDE_FILES = ['manifest.json'];
const CONFIG_SKIP = new Set(['README.md', 'bsit-academic-calendar.json']);

function rmrf(p) {
  fs.rmSync(p, { recursive: true, force: true });
}

function copyFile(src, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}

function copyDirFiltered(src, dest, filterFn) {
  fs.mkdirSync(dest, { recursive: true });
  for (const name of fs.readdirSync(src)) {
    const from = path.join(src, name);
    const to = path.join(dest, name);
    const st = fs.statSync(from);
    if (st.isDirectory()) {
      copyDirFiltered(from, to, filterFn);
    } else if (!filterFn || filterFn(name, from)) {
      copyFile(from, to);
    }
  }
}

rmrf(stageDir);
fs.mkdirSync(stageDir, { recursive: true });

for (const file of INCLUDE_FILES) {
  copyFile(path.join(pupsyncRoot, file), path.join(stageDir, file));
}

for (const dir of INCLUDE_DIRS) {
  const src = path.join(pupsyncRoot, dir);
  if (!fs.existsSync(src)) continue;
  if (dir === 'config') {
    copyDirFiltered(src, path.join(stageDir, dir), (name) => !CONFIG_SKIP.has(name));
  } else {
    copyDirFiltered(src, path.join(stageDir, dir));
  }
}

if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);

const isWin = process.platform === 'win32';
if (isWin) {
  execFileSync(
    'powershell.exe',
    [
      '-NoProfile',
      '-Command',
      `Compress-Archive -Path '${stageDir}\\*' -DestinationPath '${zipPath}' -Force`
    ],
    { stdio: 'inherit' }
  );
} else {
  execFileSync('zip', ['-r', zipPath, '.'], { cwd: stageDir, stdio: 'inherit' });
}

const manifest = JSON.parse(
  fs.readFileSync(path.join(stageDir, 'manifest.json'), 'utf8')
);
console.log(`Packaged PUPSync v${manifest.version}`);
console.log(`  staged: ${stageDir}`);
console.log(`  zip:    ${zipPath}`);
