import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'tauri-dist');
const copy = (from, to) => fs.cpSync(from, to, { recursive: true, force: true });
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
const source = path.join(root, 'src');
// Tauri requires index.html at the frontendDist root. Flatten src/ into the
// staged root so renderer scripts resolve correctly, with assets alongside it.
for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
  copy(path.join(source, entry.name), path.join(out, entry.name));
}
copy(path.join(root, 'assets'), path.join(out, 'assets'));
// Resolve the renderer's former ../assets paths against the flattened frontend root.
for (const entry of fs.readdirSync(out, { withFileTypes: true })) {
  if (!entry.isFile() || !['.html', '.js', '.css'].some(extension => entry.name.toLowerCase().endsWith(extension))) continue;
  const file = path.join(out, entry.name);
  const text = fs.readFileSync(file, 'utf8').split('../assets/').join('assets/');
  fs.writeFileSync(file, text);
}
const jsqr = path.join(root, 'node_modules', 'jsqr', 'dist', 'jsQR.js');
if (fs.existsSync(jsqr)) {
  // Keep the staged frontend free of node_modules, which Tauri rejects.
  fs.copyFileSync(jsqr, path.join(out, 'jsQR.js'));
}
const pdfjsRoot = path.join(root, 'node_modules', 'pdfjs-dist');
const pdfjsBuild = path.join(pdfjsRoot, 'build');
const pdfjsOut = path.join(out, 'pdfjs');
fs.mkdirSync(pdfjsOut, { recursive: true });
for (const name of ['pdf.mjs', 'pdf.worker.mjs']) {
  const sourceFile = path.join(pdfjsBuild, name);
  if (!fs.existsSync(sourceFile)) throw new Error(`PDF.js build asset is missing: ${sourceFile}`);
  fs.copyFileSync(sourceFile, path.join(pdfjsOut, name));
}
for (const directory of ['cmaps', 'standard_fonts', 'wasm']) {
  const sourceDirectory = path.join(pdfjsRoot, directory);
  if (fs.existsSync(sourceDirectory)) copy(sourceDirectory, path.join(pdfjsOut, directory));
}
const html = path.join(out, 'app.html');
let page = fs.readFileSync(html, 'utf8');
page = page.replace(/\.\.\/assets\//g, 'assets/');
page = page.replace('../node_modules/jsqr/dist/jsQR.js', 'jsQR.js');
if (!page.includes('tauri-bridge.js')) page = page.replace('<script src="appboot.js"></script>', '<script src="tauri-bridge.js"></script>\n<script src="appboot.js"></script>');
fs.writeFileSync(html, page);
fs.writeFileSync(path.join(out, 'index.html'), page);
// Custom Element names must contain a hyphen; Electron's built-in <webview>
// element cannot be registered as a custom element in Tauri/WebView2/WKWebView.
const renderer = path.join(out, 'renderer.js');
let rendererSource = fs.readFileSync(renderer, 'utf8');
// Generate the first-launch "What's new" dialog from the release-notes section
// matching package.json, so it cannot silently lag behind the shipped version.
const packageJsonForNotes = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const releaseNotesPath = path.join(root, 'RELEASE_NOTES.md');
const releaseNotesSource = fs.readFileSync(releaseNotesPath, 'utf8');
const releaseSections = releaseNotesSource.split(/(?=^## \[)/m);
const currentReleaseSection = releaseSections.find(section => {
  const match = section.match(/^## \[([^\]]+)\]/m);
  return match && match[1] === packageJsonForNotes.version;
});
if (!currentReleaseSection) throw new Error(`No release notes found for ${packageJsonForNotes.version}`);
const releaseLines = currentReleaseSection.split(/\r?\n/).slice(1);
const releaseText = ["What’s new", "", ...releaseLines.flatMap(line => {
  if (line.startsWith('### ')) return [line.slice(4) + ":"];
  if (line.startsWith('- ')) return ["• " + line.slice(2)];
  return [];
})].join("\\n");
rendererSource = rendererSource.replace(
  /const CURRENT_RELEASE_NOTES_VERSION=.*;\\r?\\nconst CURRENT_RELEASE_NOTES_TEXT=.*;/,
  `const CURRENT_RELEASE_NOTES_VERSION=${JSON.stringify(packageJsonForNotes.version)};\\nconst CURRENT_RELEASE_NOTES_TEXT=${JSON.stringify(releaseText)};`
);
rendererSource = rendererSource.replace(/<\/?webview\b/gi, tag => tag.replace(/webview/i, 'schoology-webview'));
fs.writeFileSync(renderer, rendererSource);
const styles = path.join(out, 'styles.css');
let css = fs.readFileSync(styles, 'utf8');
css = css.replace(/\bwebview\b/g, 'schoology-webview');
fs.writeFileSync(styles, css);
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
// SemVer rejects leading zeroes in numeric identifiers; retain the user-facing version separately.
const version = String(packageJson.version).replace(/^([0-9]+)\.0*([0-9]+)\.0*([0-9]+)(?:-port\.([0-9]+))?$/, (_, major, minor, patch, port) => port ? `${major}.${minor}.${port}` : `${major}.${minor}.${patch}`);
const confPath = path.join(root, 'src-tauri', 'tauri.conf.json');
const conf = JSON.parse(fs.readFileSync(confPath, 'utf8'));
conf.version = version;
// The standalone Tauri updater is included only in Windows Tauri packages.
conf.bundle = conf.bundle || {};
conf.bundle.resources = conf.bundle.resources || {};
const updaterResource = '../updater-tauri/dist/SchoologyUpdater.exe';
if (process.platform === 'win32' && fs.existsSync(path.join(root, 'updater-tauri', 'dist', 'SchoologyUpdater.exe'))) {
  conf.bundle.resources[updaterResource] = 'SchoologyUpdater.exe';
} else {
  delete conf.bundle.resources[updaterResource];
}
fs.writeFileSync(confPath, JSON.stringify(conf, null, 2) + '\n');
fs.writeFileSync(path.join(out, 'tauri-version.json'), JSON.stringify({ version: packageJson.version }));
console.log(`Prepared Tauri frontend at ${path.relative(root, out)}`);
