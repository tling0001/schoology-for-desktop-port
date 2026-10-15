# Tauri v2 migration status

This migration is in progress. Electron remains the supported release runtime and is intentionally preserved as the reference implementation. Do not publish Tauri installers until the native backend and embedded webview behavior have feature parity.

## In this checkpoint

- Tauri v2 project/configuration and npm scripts.
- A staged frontend copy so Tauri-specific startup code does not alter the Electron renderer entry point.
- A renderer bridge exposing the existing `window.schoology` API shape, including native teacher-grade update requests and cancelable navigation events for child webviews.
- An initial Rust backend for local settings, credentials/QR authentication, school search, authenticated API requests, assignment file upload/download helpers, and course-app launch.
- A GitHub release checker/downloader with SHA-256 verification, progress events, and interactive installer launching.
- A native child-webview builder that installs navigation, popup, media-permission, and download handlers at creation time; an adapter keeps the existing renderer-facing element and event shape.

## Not yet at parity

- Ordinary Schoology session cookies are installed by a host-restricted initialization script. District SSO now reads the HttpOnly `SESS*` cookie through Tauri/Wry's native `cookies_for_url` API (WebView2, WKHTTPCookieStore, or WebKitGTK), then performs `/oauth/authorize_auto` and exchanges the request token. This needs cross-platform runtime confirmation in GitHub Actions before being considered release-verified.
- Complete assignment submission parity, including runtime verification of teacher grade updates.
- Native notification delivery and sound, native window chrome, and exact file-picker/open/reveal parity.
- Update package opening is implemented through the operating system's normal interactive file association; automatic replacement/relaunch behavior is not yet equivalent to the Electron updater.
- Electron Node-preload parity and context-menu parity. Native child views now have allowlisted navigation and popup routing, camera/microphone permissions limited to Schoology/LAUSD origins (matching the existing Electron permission policy), and a native download handler that saves Schoology/LAUSD downloads to the user's Downloads folder. Explicit `<a download>` links use the authenticated downloader and open the downloaded file. Cross-platform runtime confirmation is still required, and native child views remain separate surfaces with layout/overlay differences from Electron.
- Cross-platform CI packaging and runtime verification.

The Tauri workflow must not replace the Electron release workflow until the remaining preload/context-menu/update gaps are resolved and GitHub Actions confirms successful native builds and runtime coverage.


## Stage 8: native shell compatibility work

This stage adds the Tauri `unstable` feature and explicit child-webview capabilities required by the existing custom-element adapter; implements an optional frameless title-bar overlay with native minimize/maximize/close commands; plays the platform system notification sound when the notification-sound setting is enabled; and adds interactive installer handoff. Windows launches the normal (non-silent) NSIS installer and exits so the installer can replace the app; macOS uses a detached replacement helper that waits for the app to exit, stages the downloaded `.app`, swaps with a rollback backup, and reopens it; Linux opens the package through the system handler because package installation may require privilege elevation. A separate Tauri CI workflow builds artifacts without publishing a release, leaving the existing Electron release workflow untouched until parity is complete.

### District SSO native cookie-store adapter

The district SSO path now creates a dedicated native Tauri webview window, waits for a qualifying HTTPS navigation to finish, and asks the Rust host to read that window's cookies for the exact destination URL. Tauri's `cookies_for_url` API includes HttpOnly and Secure cookies and uses the platform webview's native cookie store (WebView2 on Windows, WKHTTPCookieStore on macOS, and WebKitGTK on Linux). The Rust host selects the first cookie whose name starts with `SESS`, posts the request token to `/oauth/authorize_auto` using that cookie, exchanges the token, validates the Schoology user profile, and persists the resulting auth state. The cookie value never passes through JavaScript. Runtime confirmation across all three platforms is still required.

### Embedded webview compatibility limits

Embedded views are now created by the Rust `WebviewBuilder`, so native download, navigation, popup, and permission handlers are attached before the page begins loading. Schoology and LAUSD hosts remain embedded; other HTTP(S) navigation is routed through the system browser. Camera and microphone requests are allowed only for Schoology/LAUSD origins, matching the existing Electron permission policy; other permission types and origins are denied. Native downloads from those trusted origins are saved in the user's Downloads folder, while explicit download links use the authenticated file downloader. The adapter continues to provide bounds synchronization and a document-start theme bootstrap. Arbitrary Electron Node preloads and context-menu parity remain unsupported, and all native behavior still needs runtime coverage. The embedded remote page is intentionally not granted broad Tauri IPC access.

## Stage 9: native SSO cookies and embedded download/permission handling

District SSO now uses Tauri's native `cookies_for_url` API against the dedicated login webview after a qualifying HTTPS page finishes loading. The `SESS*` value stays in Rust and is used for the `/oauth/authorize_auto` request before the normal OAuth exchange and user-profile validation. This avoids JavaScript cookie access and supports HttpOnly cookies through the platform's WebView2, WKWebView, and WebKitGTK cookie stores.

Embedded child webviews are now created through Rust `WebviewBuilder` so navigation, popup, permission, and native download handlers are attached before the remote page loads. Camera/microphone permissions are restricted to Schoology/LAUSD in embedded pages; the app shell retains its existing Electron-compatible camera/microphone behavior for QR scanning. Native browser downloads from Schoology/LAUSD are saved into the user's Downloads folder, and explicit download links are sent through the authenticated native downloader using cookies from the originating webview. Native download completion is emitted to the renderer.

No local build, installer test, or validation was run. GitHub Actions must compile and exercise these paths before they can be called verified. The Electron release workflow remains unchanged; this migration branch must not publish Tauri releases yet.

### Release policy

The Tauri workflow is build-only and does not publish GitHub releases. The existing Electron release workflow remains the production workflow until the SSO cookie adapter and embedded webview permission/download paths are exercised by GitHub Actions, remaining preload/context-menu gaps are addressed, and cross-platform update installation is fully verified.


## Stage 10: event and interaction compatibility

- Native embedded child webviews are created on `about:blank` first, then navigated only after the renderer has attached load and navigation listeners. This avoids losing the first page's completion event on fast responses.
- The native child-view permission callback now requires HTTPS as well as a Schoology/LAUSD host before granting camera or microphone access. Other permission kinds are denied.
- Embedded pages receive a lightweight context menu for navigation, reload, copy/select, link opening, and trusted Schoology downloads. Theme changes are propagated to active child views.
- The workflow remains build-only and branch-scoped; it does not publish a release or replace the Electron workflow.

This stage has not been built or runtime-tested locally. GitHub Actions should be used for the first compile/package attempt, and District SSO must be tested manually against a real district account on each target platform before replacing Electron.
