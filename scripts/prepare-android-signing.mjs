import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const root = process.cwd();
const required = ['ANDROID_KEYSTORE_BASE64', 'ANDROID_KEYSTORE_PASSWORD', 'ANDROID_KEY_ALIAS', 'ANDROID_KEY_PASSWORD'];
const missing = required.filter(name => !String(process.env[name] || '').trim());
if (missing.length) {
  throw new Error('Android release APKs must use a persistent keystore to support in-place updates. Configure these GitHub Actions secrets: ' + missing.join(', ') + '. Do not generate a new keystore for each workflow run.');
}

const appDir = path.join(root, 'src-tauri', 'gen', 'android', 'app');
const gradleFile = ['build.gradle.kts', 'build.gradle'].map(name => path.join(appDir, name)).find(file => fs.existsSync(file));
if (!gradleFile) throw new Error('Generated Android app Gradle file was not found. Run tauri android init first.');

const keystorePath = path.join(process.env.RUNNER_TEMP || os.tmpdir(), 'schoology-android-release.jks');
const keystore = Buffer.from(process.env.ANDROID_KEYSTORE_BASE64.replace(/\s+/g, ''), 'base64');
if (keystore.length < 512) throw new Error('ANDROID_KEYSTORE_BASE64 does not decode to a valid Android keystore.');
fs.writeFileSync(keystorePath, keystore, { mode: 0o600 });
if (process.env.GITHUB_ENV) fs.appendFileSync(process.env.GITHUB_ENV, `ANDROID_KEYSTORE_PATH=${keystorePath}\n`);

let source = fs.readFileSync(gradleFile, 'utf8');
if (source.includes('schoologyRelease')) throw new Error('Android Gradle signing configuration was already inserted; refusing to duplicate it.');
function findBlock(text, regex, from = 0) {
  regex.lastIndex = from;
  const match = regex.exec(text);
  if (!match) return null;
  const open = text.indexOf('{', match.index);
  if (open < 0) return null;
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    if (text[i] === '{') depth++;
    else if (text[i] === '}' && --depth === 0) return { start: match.index, open, close: i };
  }
  return null;
}
const android = findBlock(source, /\bandroid\s*\{/);
const buildTypes = android && findBlock(source, /\bbuildTypes\s*\{/g, android.open);
if (!android || !buildTypes || buildTypes.close > android.close) throw new Error('Could not safely locate the Android buildTypes block for release signing.');

const isKotlin = gradleFile.endsWith('.kts');
const signingBlock = isKotlin
  ? `    signingConfigs {
        create("schoologyRelease") {
            storeFile = file(System.getenv("ANDROID_KEYSTORE_PATH") ?: error("ANDROID_KEYSTORE_PATH is required"))
            storePassword = System.getenv("ANDROID_KEYSTORE_PASSWORD") ?: error("ANDROID_KEYSTORE_PASSWORD is required")
            keyAlias = System.getenv("ANDROID_KEY_ALIAS") ?: error("ANDROID_KEY_ALIAS is required")
            keyPassword = System.getenv("ANDROID_KEY_PASSWORD") ?: error("ANDROID_KEY_PASSWORD is required")
        }
    }

`
  : `    signingConfigs {
        schoologyRelease {
            storeFile file(System.getenv("ANDROID_KEYSTORE_PATH"))
            storePassword System.getenv("ANDROID_KEYSTORE_PASSWORD")
            keyAlias System.getenv("ANDROID_KEY_ALIAS")
            keyPassword System.getenv("ANDROID_KEY_PASSWORD")
        }
    }

`;
source = source.slice(0, buildTypes.start) + signingBlock + source.slice(buildTypes.start);
const updatedBuildTypes = findBlock(source, /\bbuildTypes\s*\{/g, android.open);
const release = updatedBuildTypes && findBlock(source, /\brelease\s*\{/g, updatedBuildTypes.open);
if (!release || release.close > updatedBuildTypes.close) throw new Error('Could not safely locate the Android release build type for signing.');
source = source.slice(0, release.close) + (isKotlin
  ? '\n            signingConfig = signingConfigs.getByName("schoologyRelease")\n'
  : '\n            signingConfig signingConfigs.schoologyRelease\n') + source.slice(release.close);
fs.writeFileSync(gradleFile, source);
console.log('Configured Android release signing with the persistent Schoology keystore.');
