import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const source = path.join(root, 'assets', 'ic_launcher.png');
if (!fs.existsSync(source)) throw new Error('Official Schoology launcher icon is missing: assets/ic_launcher.png');
const signature = fs.readFileSync(source).subarray(0, 8).toString('hex');
if (signature !== '89504e470d0a1a0a') throw new Error('Schoology launcher icon is not a valid PNG.');
const androidRes = path.join(root, 'src-tauri', 'gen', 'android', 'app', 'src', 'main', 'res');
if (!fs.existsSync(androidRes)) throw new Error('Tauri Android resources are missing; run tauri android init before preparing the icon.');
for (const density of ['mdpi', 'hdpi', 'xhdpi', 'xxhdpi', 'xxxhdpi']) {
  const folder = path.join(androidRes, `mipmap-${density}`);
  fs.mkdirSync(folder, { recursive: true });
  fs.copyFileSync(source, path.join(folder, 'ic_launcher.png'));
  fs.copyFileSync(source, path.join(folder, 'ic_launcher_round.png'));
}
const adaptive = path.join(androidRes, 'mipmap-anydpi-v26');
if (fs.existsSync(adaptive)) {
  for (const name of ['ic_launcher.xml', 'ic_launcher_round.xml']) {
    const file = path.join(adaptive, name);
    if (fs.existsSync(file)) fs.rmSync(file);
  }
}
console.log('Prepared the Schoology launcher icon in all Android density buckets.');
