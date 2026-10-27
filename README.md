# Schoology Desktop Port

Schoology Desktop Port is a cross-platform desktop/mobile wrapper aligned with the supplied official Schoology Android 2026.10.0 source. The active GitHub Actions workflow builds and publishes versioned Tauri releases for Windows, macOS, Linux, and Android, with an optional Ad Hoc iPhone IPA and QR installation package when the required Apple signing and provisioning configuration is available.

## Releases and builds

- Pushes to `main` start the versioned Tauri build-and-release workflow. The release tag and title are sourced from `package.json`.
- The Android artifact is an optimized release APK. Its final size is printed in the Actions log.
- iPhone QR-install assets are produced only when the required signing certificate, App Store Connect API credentials, and registered-device Ad Hoc profile are configured. Separate iOS and macOS certificate-generation jobs remain available through workflow dispatch.
- Newer pushes cancel older runs of the same workflow/ref.
- Release notes are maintained in `RELEASE_NOTES.md`. A failed Actions run is not automatically labeled as a failed release in the changelog.

## Implementation notes

The active native host is Tauri v2 (`src-tauri`) with the compatibility bridge in `src/tauri-bridge.js`. The legacy Electron implementation remains in the repository as reference/compatibility code; it is not the current release runtime.

Desktop native child webviews are implemented with Tauri's native webview APIs. Tauri's current mobile targets do not support the same multiple-child-webview API, so mobile flows that depend on embedded remote pages still need a mobile-compatible native navigation implementation. Native background push on iOS also requires APNs delivery and a server-side device-token workflow; five-minute polling alone is not equivalent to background push.

Schoology-specific behavior should be verified against the supplied official Schoology Android 2026.10.0 source in this project, not unofficial web descriptions.
