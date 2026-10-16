# Schoology Desktop Port release history

GitHub Actions includes the current release notes plus the previous two failed release sections in each release description.

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
