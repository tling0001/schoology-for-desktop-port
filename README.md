# Schoology

Desktop port aligned with the supplied Schoology Android 2026.06.0 source.

## Version
The release version is defined by `package.json`.

## Release
The GitHub Actions workflow reads the package version and publishes platform builds under the corresponding `v<package.json version>` tag.

## Testing
Do not run npm installs in the sandbox; release builds install dependencies in GitHub Actions.


### Open Schoology links from Chrome (optional companion extension)

Windows/macOS cannot route only `https://lms.lausd.net/...` or `https://app.schoology.com/...` to a desktop app using an app preference alone; HTTPS links are dispatched to the browser's configured handler. To enable this behavior in Chrome, use **Set up Chrome link handling** in Schoology settings to open the bundled `chrome-link-handler` folder, then open `chrome://extensions`, enable Developer mode, choose **Load unpacked**, and select that folder. The extension hands supported Schoology URLs to the registered `schoology://` app protocol; the app's **Open Schoology links in this app** setting determines whether the destination is handled inside Schoology or opened externally.

## Experimental Tauri v2 migration

The `src-tauri` Rust host and `src/tauri-bridge.js` compatibility layer are an in-progress migration experiment. The Electron app remains the supported runtime and the existing Electron release workflow must not be replaced until feature parity is complete.

The native host now contains initial OAuth credential/QR authentication, default-browser school OAuth login with a `schoology://external_login_callback` request-token check, a native HttpOnly district-SSO cookie adapter, authenticated API calls, text/resource/file assignment submission paths, authenticated downloads, image data-URI retrieval, course-app launch, basic settings persistence, native file picker/open actions, GitHub release lookup/download with progress and optional SHA-256 verification, and an initial five-minute native-notification polling loop that establishes a per-account baseline before displaying newly received notifications.

District SSO now reads the HttpOnly `SESS*` cookie from Tauri's native WebView cookie store without exposing the cookie to JavaScript. Embedded views are created through Rust `WebviewBuilder` hooks for trusted-host navigation, popup routing, camera/microphone permissions, and native downloads; explicit download links use the authenticated downloader. These changes have not been runtime-validated on Windows, macOS, or Linux. Electron Node-preload/context-menu parity, some notification behavior, and complete cross-platform updater replacement/relaunch verification remain outstanding. Do not publish Tauri artifacts as releases yet.


## Tauri migration workflow

The experimental Tauri host can be built with `npm run tauri:build`. The `Tauri migration builds (no release)` GitHub Actions workflow runs on manual dispatch or pushes to the `tauri-migration` branch and uploads platform artifacts for review. It intentionally does not publish a GitHub Release and does not replace the Electron release workflow. The native District SSO cookie-store adapter and embedded-webview permission/download handlers are implemented but still require GitHub Actions and platform runtime confirmation; Electron preload/context-menu parity and complete updater verification remain release blockers. See `TAURI-MIGRATION.md`.
