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
const xmlDir = path.join(root, 'src-tauri', 'gen', 'android', 'app', 'src', 'main', 'res', 'xml');
fs.mkdirSync(xmlDir, { recursive: true });
const providerPaths = path.join(xmlDir, 'schoology_file_paths.xml');
fs.writeFileSync(providerPaths, `<?xml version="1.0" encoding="utf-8"?>
<paths xmlns:android="http://schemas.android.com/apk/res/android">
    <cache-path name="schoology_updates" path="Schoology/updates/" />
</paths>
`);

if (!xml.includes('android.permission.REQUEST_INSTALL_PACKAGES')) {
  const applicationStart = xml.indexOf('<application');
  if (applicationStart < 0) throw new Error('AndroidManifest.xml has no application element.');
  xml = xml.slice(0, applicationStart) + '    <uses-permission android:name="android.permission.REQUEST_INSTALL_PACKAGES" />\n' + xml.slice(applicationStart);
}

if (!xml.includes('androidx.core.content.FileProvider')) {
  const applicationClose = xml.lastIndexOf('</application>');
  if (applicationClose < 0) throw new Error('AndroidManifest.xml has no closing application element.');
  const provider = `        <provider
            android:name="androidx.core.content.FileProvider"
            android:authorities="\${applicationId}.fileprovider"
            android:exported="false"
            android:grantUriPermissions="true">
            <meta-data
                android:name="android.support.FILE_PROVIDER_PATHS"
                android:resource="@xml/schoology_file_paths" />
        </provider>
`;
  xml = xml.slice(0, applicationClose) + provider + xml.slice(applicationClose);
}
fs.writeFileSync(manifest, xml);

const nativePluginDir = path.join(root, 'src-tauri', 'gen', 'android', 'app', 'src', 'main', 'java', 'com', 'schoologytauri', 'app');
fs.mkdirSync(nativePluginDir, { recursive: true });
fs.writeFileSync(path.join(nativePluginDir, 'SchoologyInstallerPlugin.kt'), `package com.schoologytauri.app

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.Plugin

@InvokeArg
class InstallApkArgs {
    lateinit var uri: String
}

@TauriPlugin
class SchoologyInstallerPlugin(private val activity: Activity) : Plugin(activity) {
    @Command
    fun installApk(invoke: Invoke) {
        try {
            val args = invoke.parseArgs(InstallApkArgs::class.java)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && !activity.packageManager.canRequestPackageInstalls()) {
                val settingsIntent = Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:\${activity.packageName}"))
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                activity.applicationContext.startActivity(settingsIntent)
                invoke.reject("Allow Schoology to install apps from this source in Android settings, then choose Install update again.")
                return
            }
            val intent = Intent(Intent.ACTION_INSTALL_PACKAGE)
                .setData(Uri.parse(args.uri))
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            activity.applicationContext.startActivity(intent)
            invoke.resolve()
        } catch (error: Exception) {
            invoke.reject(error.message)
        }
    }
}
`);

const appGradle = path.join(root, 'src-tauri', 'gen', 'android', 'app', 'build.gradle.kts');
if (fs.existsSync(appGradle)) {
  let gradle = fs.readFileSync(appGradle, 'utf8');
  if (!gradle.includes('androidx.core:core:')) {
    const dependencyBlock = gradle.indexOf('dependencies {');
    if (dependencyBlock < 0) throw new Error('Android app Gradle file has no dependencies block.');
    const insertion = dependencyBlock + 'dependencies {'.length;
    gradle = gradle.slice(0, insertion) + '\n    implementation("androidx.core:core:1.15.0")' + gradle.slice(insertion);
    fs.writeFileSync(appGradle, gradle);
  }
}

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
