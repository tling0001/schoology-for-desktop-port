# Schoology Windows / Cross-Platform Port

A cross-platform Schoology client port based on the supplied **Schoology Android 2026.06.0** source. The goal is to reproduce the Android app's navigation, API behavior, layouts, app-bar actions, icons, login flow, and hybrid WebView surfaces as closely as practical on desktop.

## Current version

**2026.06.0-port.44**

## Source alignment

This project uses the supplied Android 2026.06.0 source as the reference for:
- Native login and Schoology OAuth behavior
- Drawer navigation and official Android vector/PNG assets
- Course profile tabs and course Materials actions
- Course-specific Upcoming events
- Assignment `Info / Comments / Grade Submissions` pager
- `CommentsResourceV2` comment behavior and attachment handling
- Dropbox/Grade Submissions data model and revision history
- Schoology document/file download metadata
- Android-style Schoology WebView identity where the official app requires it

## Platforms

The application is built with Electron and is intended to run on Windows, macOS, and Linux.

### Windows CI outputs

GitHub Actions deliberately produces only:
1. **Windows NSIS installer**
2. **Windows unpacked (`win-unpacked`) build**

No portable Windows target is generated.

## Building

```bash
npm install
npm start
```

For Windows packaging:

```bash
npm run dist:win
```

The GitHub Actions workflow in `.github/workflows/build-windows.yml` builds the supported release artifacts.

## Important implementation notes

- The desktop shell uses native Electron UI for the navigation and API-backed Schoology screens.
- Schoology hybrid pages and Course Dashboard use embedded WebViews.
- Course-app and ordinary web links use the normal desktop Chromium user agent rather than spoofing Android, while the main Schoology shell/login behavior retains the Android client identity where required.
- The official Android course Materials download/offline toolbar icon is included. Full Android offline synchronization is not yet implemented by the desktop port.
- Downloaded Schoology files preserve the extension supplied by Schoology when that metadata is available.

## Source reference

The authoritative reference used for this port is the supplied `schoology-android-2026-06-0.zip`.


## 2026.06.0 fidelity baseline

This port uses the supplied Schoology Android 2026.06.0 source as the authoritative behavioral and visual reference. Unless a change is explicitly requested for Windows/desktop, screens, navigation, toolbar actions, icons, resources, assignment views, course views, and API behavior should match that source.

### Intentional desktop behavior
- On displays at or wider than a 4:3 aspect ratio, Home uses a split layout: Upcoming occupies the left one-third, while the right two-thirds contains Recent Activity and Course Dashboard tabs.
- Course Dashboard remains the official Schoology hybrid dashboard WebView.

### Windows build outputs
The Windows GitHub Actions build produces only the NSIS installer and the unpacked Windows application.

### Official assets
Android vector/raster assets used by the source app are extracted into `assets/icons/` where practical, including navigation, Resources, course, assignment, discussion, and toolbar icons.
