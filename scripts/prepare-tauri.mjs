import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'tauri-dist');
const copy = (from, to) => fs.cpSync(from, to, { recursive: true, force: true });
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
copy(path.join(root, 'src'), path.join(out, 'src'));
copy(path.join(root, 'assets'), path.join(out, 'assets'));
const jsqr = path.join(root, 'node_modules', 'jsqr', 'dist', 'jsQR.js');
if (fs.existsSync(jsqr)) {
  const target = path.join(out, 'node_modules', 'jsqr', 'dist');
  fs.mkdirSync(target, { recursive: true });
  fs.copyFileSync(jsqr, path.join(target, 'jsQR.js'));
}
const html = path.join(out, 'src', 'app.html');
let page = fs.readFileSync(html, 'utf8');
if (!page.includes('tauri-bridge.js')) page = page.replace('<script src="appboot.js"></script>', '<script src="tauri-bridge.js"></script>\n<script src="appboot.js"></script>');
fs.writeFileSync(html, page);
// Custom Element names must contain a hyphen; Electron's built-in <webview>
// element cannot be registered as a custom element in Tauri/WebView2/WKWebView.
const renderer = path.join(out, 'src', 'renderer.js');
let rendererSource = fs.readFileSync(renderer, 'utf8');
rendererSource = rendererSource.replace(/<\/?webview\b/gi, tag => tag.replace(/webview/i, 'schoology-webview'));
fs.writeFileSync(renderer, rendererSource);
const styles = path.join(out, 'src', 'styles.css');
let css = fs.readFileSync(styles, 'utf8');
css = css.replace(/\bwebview\b/g, 'schoology-webview');
fs.writeFileSync(styles, css);
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
// SemVer rejects leading zeroes in numeric identifiers; retain the user-facing version separately.
const version = String(packageJson.version).replace(/^([0-9]+)\.0*([0-9]+)\.0*([0-9]+)/, '$1.$2.$3');
const confPath = path.join(root, 'src-tauri', 'tauri.conf.json');
const conf = JSON.parse(fs.readFileSync(confPath, 'utf8'));
conf.version = version;
fs.writeFileSync(confPath, JSON.stringify(conf, null, 2) + '\n');
fs.writeFileSync(path.join(out, 'src', 'tauri-version.json'), JSON.stringify({ version: packageJson.version }));
console.log(`Prepared Tauri frontend at ${path.relative(root, out)}`);
