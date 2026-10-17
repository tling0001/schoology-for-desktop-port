import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.join(root, 'updater-tauri', 'target', 'release', process.platform === 'win32' ? 'SchoologyUpdater.exe' : 'SchoologyUpdater');
const destination = path.join(root, 'updater-tauri', 'dist', 'SchoologyUpdater.exe');
if (!fs.existsSync(source)) throw new Error('The Tauri updater executable was not built: ' + source);
fs.mkdirSync(path.dirname(destination), { recursive: true });
fs.copyFileSync(source, destination);
console.log('Staged Tauri updater at ' + path.relative(root, destination));
