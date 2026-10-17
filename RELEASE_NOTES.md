# Schoology Desktop Port release history

Release descriptions include the current version and the previous four release-note sections so fixes from failed release attempts remain documented.

## [2026.06.0-port.184]

### Fixed
- Fixed the Windows, macOS, and Linux Rust build failure by passing LogicalSize::new(1.0, 1.0) directly to Tauri's set_size, avoiding ambiguous type inference.
- Preserved the previous failed-build/release notes in the release history and included the complete history in future GitHub release descriptions.

### Changed
- Bumped the port version to 2026.06.0-port.184.

## [2026.06.0-port.183]

### Fixed
- Attempted to fix a cross-platform Rust type inference error in child-webview cleanup, but the release build still failed because set_size used an unnecessary .into() with an ambiguous target type. The correction is included in 2026.06.0-port.184.
- Scoped the Windows-only force-dark flag to Windows builds, removing unused-variable warnings on macOS and Linux.
- Updated release notes to include versions 2026.06.0-port.183, .182, .181, .180, and .179 so the next release preserves the full history of failed release attempts.

### Changed
- Bumped the port version to 2026.06.0-port.183.

## [2026.06.0-port.182]

### Fixed
- Switched the macOS in-app updater to the standard Tauri DMG: mount it with hdiutil, replace the installed Schoology.app while Schoology is closed, and relaunch without a custom ZIP packaging step.
- Kept shared native webviews visible through redirects and added a fallback for missing or variant page-load events so Account Info and assessment pages do not remain blank.
- Allowed HTTPS provider navigation inside LTI assignment webviews while keeping ordinary external links in the system browser.
- Closed child webviews that finish creating after their host page is removed, preventing native views from covering the app and intercepting clicks.
- Fixed Windows window-controls-overlay relaunch so it uses a hidden PowerShell process instead of a fragile cmd command.
- Fixed toolbar action spacing beside the Windows window controls by sizing the action group to its actual number of buttons.
- Restored API-driven course tab permissions when multioptions response bodies are JSON objects.
- Corrected the Windows updater delete wildcard so it targets the installed application's root files with a single backslash.
- Changed release asset staging to upload only installer packages through one guaranteed-matching glob, preventing failures caused by optional file patterns.

### Changed
- Bumped the port version to 2026.06.0-port.182.
- Release descriptions include notes for versions 2026.06.0-port.182, .181, .180, and .179, including the previous failed releases.

## [2026.06.0-port.181]

### Fixed
- Restored API-driven course tab discovery by sending Schoology multioptions requests as JSON and correctly matching documented permissions.
- Fixed shared native webview loading events, Canadian session-cookie handling, and cleanup when leaving an embedded page so child webviews cannot keep intercepting app clicks.
- Updated the Windows updater to extract the installer only once and copy the extracted root application layout directly into the installed Schoology folder.
- Added a macOS in-app updater package that downloads a .app.zip, extracts it, replaces the installed Schoology.app after the app exits, and relaunches Schoology.
- Fixed release publishing to include only actual installer assets and avoid failures from absent package patterns.
- Updated the Window Controls Overlay with native Windows glyphs and a macOS left-side layout that stays below the navigation drawer.

### Changed
- Bumped the port version to 2026.06.0-port.181.
- Included the notes for failed releases 2026.06.0-port.180 and 2026.06.0-port.179 in the next release description.

## [2026.06.0-port.180]

### Fixed
- Prevented release publication from uploading unpacked package internals and colliding duplicate asset names.
- Corrected the in-app US/Canada sign-in instance switch to update the Schoology API and web host configuration, matching the Android login flow.
- Kept LTI plugin assignment redirects embedded and limited the desktop deep-link router to internal navigation within LTI assignments.
- Cleared stale top-level files in the Windows install directory before copying the staged application payload.

### Changed
- Recognized Canadian Schoology hosts in the embedded webview and session bootstrap.

## [2026.06.0-port.179]

### Fixed
- Reworked login layout, Schoology account icon, official button colors, back-button margins, and logo alignment on secondary sign-in screens.
- Kept native embedded Schoology webviews hidden during navigation so the parent loading overlay is visible, and retained loading feedback until the native page finishes.
- Added portrait Upcoming loading feedback and loading feedback when returning to Assignment Info.
- Made course tabs horizontally scrollable and kept Grades, Upcoming, and Course App available in the course tab strip.
- Fixed message-author visibility in message details.
- Corrected success handling for external resource links.
- Improved notification target selection for multi-item assessment/assignment notifications.
- Allowed internal navigation required by embedded legacy assessments so submission actions are not intercepted by desktop deep-link routing.
- Delayed window-controls relaunch until the previous single-instance process exits.

### Changed
- Standardized the course tab indicator to a thinner 2px line without thickening other app tabs.
- Reduced the reserved window-controls overlay width so it does not cover right-side toolbar actions.
- Added GitHub Actions release publishing with Windows, macOS, and Linux Tauri packages and per-version release descriptions from this file.

## [2026.06.0-port.178]

### Baseline
- Tauri migration baseline with native authentication/API bridge, embedded Schoology webviews, assignment submission APIs, updater integration, and cross-platform package workflow.
- Earlier source-level fixes are retained in the repository history.
