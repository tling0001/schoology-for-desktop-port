import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const manifest = path.join(root, 'src-tauri', 'gen', 'android', 'app', 'src', 'main', 'AndroidManifest.xml');
if (!fs.existsSync(manifest)) throw new Error('Generated AndroidManifest.xml is missing; run tauri android init first.');
let xml = fs.readFileSync(manifest, 'utf8');
if (!xml.includes('android.permission.CAMERA')) {
  const appIndex = xml.indexOf('<application');
  if (appIndex < 0) throw new Error('AndroidManifest.xml has no application element.');
  xml = xml.slice(0, appIndex) + '    <uses-permission android:name="android.permission.CAMERA" />\n' + xml.slice(appIndex);
}
if (!xml.includes('android.hardware.camera')) {
  const appIndex = xml.indexOf('<application');
  xml = xml.slice(0, appIndex) + '    <uses-feature android:name="android.hardware.camera" android:required="false" />\n' + xml.slice(appIndex);
}
fs.writeFileSync(manifest, xml);

const valuesDir = path.join(root, 'src-tauri', 'gen', 'android', 'app', 'src', 'main', 'res', 'values');
if (fs.existsSync(valuesDir)) {
  for (const file of fs.readdirSync(valuesDir).filter(name => name.endsWith('.xml'))) {
    const full = path.join(valuesDir, file);
    let text = fs.readFileSync(full, 'utf8');
    const stylePattern = /<style\b([^>]*\bname="[^"]*(?:AppTheme|TauriTheme|Theme)[^"]*"[^>]*)>([\s\S]*?)<\/style>/g;
    let changed = false;
    text = text.replace(stylePattern, (whole, opening, body) => {
      let next = body;
      if (!/name="android:statusBarColor"/.test(next)) next += '\n        <item name="android:statusBarColor">#002137</item>';
      if (!/name="android:windowLightStatusBar"/.test(next)) next += '\n        <item name="android:windowLightStatusBar">false</item>';
      if (next !== body) changed = true;
      return '<style' + opening + '>' + next + '</style>';
    });
    if (changed) fs.writeFileSync(full, text);
  }
}
console.log('Prepared Android camera permission and Schoology-blue status-bar theme.');
