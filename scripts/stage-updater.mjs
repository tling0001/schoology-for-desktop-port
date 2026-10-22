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

if (process.platform === 'win32') {
  const targetRoot = path.join(root, 'updater-tauri', 'target');
  const findLoader = directory => {
    if (!fs.existsSync(directory)) return null;
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const candidate = path.join(directory, entry.name);
      if (entry.isFile() && entry.name.toLowerCase() === 'webview2loader.dll') return candidate;
      if (entry.isDirectory()) {
        const found = findLoader(candidate);
        if (found) return found;
      }
    }
    return null;
  };
  const loader = findLoader(targetRoot);
  if (!loader) throw new Error('WebView2Loader.dll was not produced by the standalone updater build; refusing to package a broken updater.');
  const resource = path.join(root, 'src-tauri', 'resources', 'WebView2Loader.dll');
  fs.mkdirSync(path.dirname(resource), { recursive: true });
  fs.copyFileSync(loader, resource);
  console.log('Staged WebView2 loader for the app bundle at ' + path.relative(root, resource));
}
