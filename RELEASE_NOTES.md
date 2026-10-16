# Schoology Desktop Port release history

GitHub Actions extracts only the section matching `package.json`'s version for each GitHub Release.

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
