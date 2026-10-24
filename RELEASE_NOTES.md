# Schoology Desktop Port release history

## [2026.06.0-port.221]

### Fixed
- Embed the exact official Android `ic_speech_bubble_spacefront` and `ic_like_spacefront` assets in the renderer so post counter icons no longer depend on broken relative paths.
- Route post comment actions into a shared composer; the comments-view plus button opens that same composer.
- Bring person-profile updates into the shared post-action presentation and normalize homepage preferences from the official mobile/me response.
- Add close transitions to app and shared-comment dialogs, respecting reduced motion and iOS safe areas.

### Requires device validation
- Verify comment posting, homepage preference, mobile dialog layout/animations, and native embedded-webview behavior on Windows and iOS.


## [2026.06.0-port.220]

### Fixed
- Fix the renderer syntax error that prevented iOS startup by restoring the asynchronous course-updates loader declaration and making the shared post-action renderer synchronous.
- Replace obsolete Electron preload-bridge wording with Tauri-specific startup diagnostics.

### Requires device validation
- Verify a clean iOS launch and confirm startup diagnostics no longer mention Electron. No local platform builds were run.

## [2026.06.0-port.219]

### Fixed
- Reuse one shared post-action renderer across Recent Activity, course updates, group updates, and school profile updates, keeping reaction icons beside like counts instead of Like text and joining each count to its corresponding action.
- Use the official Schoology back and add icons in the shared update-comments app bar.
- Correct the narrow-screen update-comments dialog to use the full viewport without a bottom gap and preserve safe-area-aware scrolling.
- Apply dark-mode surfaces and text to polls, post action buttons, comment rows, and comment dialogs.
- Match Inbox/Sent split headings to the Home Upcoming pane's 48px Schoology-blue header style.

### Requires device validation
- Verify post counts, comment actions, dark mode, and dialog scrolling on iPhone and Windows. No local platform builds were run.

## [2026.06.0-port.218]

### Fixed
- Avoid duplicate reaction icons beside update like counts by reusing the shared official-icon styling.


## [2026.06.0-port.217]

### Fixed
- Keep the custom window-control overlay visible on Windows/Linux when the drawer opens; only apply drawer-specific hiding/offset behavior on macOS when the overlay is enabled.


## [2026.06.0-port.216]

### Fixed
- Show the official Schoology reaction icon beside update like counts and add a speech-bubble icon beside comment counts.


## [2026.06.0-port.215]

### Fixed
- Restore full-size pointer-interactive styling for the Tauri shared webview custom element, which differs from Electron's native `webview` tag.

### Requires device validation
- Confirm taps/clicks work in embedded Quiz, Account Info, and other shared-webview pages across supported platforms.


## [2026.06.0-port.214]

### Fixed
- Resolve group discussion Post To labels using the active group name rather than its numeric ID.
- Read additional Schoology poll vote-count and selected-state fields so poll results can render before the current user votes.
- Resolve update-comment author names and avatar URLs from nested author/profile records, and improve comments-panel scrolling and action-button visibility.
- Improve the visual separation and sizing of Inbox/Sent split headings without changing the homepage Upcoming split.

### Requires device validation
- Verify comment avatars/replies and live poll counts with Schoology accounts, and confirm shared-webview interaction behavior on desktop and mobile.


## [2026.06.0-port.213]

### Fixed
- Add Android universal APK discovery to the update checker and hand the downloaded APK to Android Package Installer with the correct package MIME type.
- Route launch-time update notifications through the same install-confirmation dialog as Settings, deferring the prompt until startup has dismissed the splash instead of auto-installing.
- Render poll options and vote state on activity/update cards, add the comment-composer action to update comment dialogs, and align like-count dialog titles with the official Android wording.
- Match the course update composer to the official Android post layout with file/resource attachments only, center the splash spinner directly beneath the responsive logo, fix wide-screen drawer sizing, include upcoming events in selected calendar-day lists, and improve touch targets for post/comment actions.
- Use the official Schoology Android smiley-like asset and admin badge styling.

### Requires device validation
- Verify Android APK download/progress and Package Installer handoff on a physical Android device; validate poll voting, comment interactions, and admin badge placement against live Schoology accounts.


## [2026.06.0-port.212]

### Fixed
- Strengthen iOS runtime detection using both the native bridge and iPhone/iPad user-agent signals so iOS updates use the native installation flow instead of a desktop download-progress dialog.
- Keep the existing install confirmation and show the post-handoff message explaining that installation starts after closing Schoology or returning to the Home Screen.
- Fix the safe-area variable used by shared embedded pages on iOS and make the Android top inset safe-area-aware.
- Remove the duplicate Course Updates comment-count handler that replaced the interactive Reply/Like dialog.
- Include the package version in the Android APK filename and release artifact.

### Requires device validation
- Validate the iOS installation handoff and shared-webview insets on physical iOS and Samsung Android devices.


## [2026.06.0-port.211]

### Fixed
- Use the Android-style post action bar, destination label, body field, and attachment actions for Group Updates.
- Refresh the app-bar action when switching Group tabs so Update and Discussion composers appear only on their matching tabs and only when API permissions allow them.
- Detect iOS updates reliably and explain that installation begins after leaving or closing the app instead of showing a download-progress dialog.
- Apply native status-bar insets to Android layouts and keep shared embedded webviews below the status bar and app bar on Android and iOS.

### Requires device validation
- Android edge-to-edge/status-bar insets, iOS embedded webview placement, and Group update attachment posting require runtime verification.


## [2026.06.0-port.210]

### Fixed
- Add the missing group Updates composer using group update permissions and the official Schoology update-post API path.
- Open Course, Groups, and School Profile update comments in an interactive dialog with reply and like actions.
- Normalize additional School Profile update response shapes.
- Remove the loading overlay from embedded Schoology webviews and tighten native-view teardown checks.
- Preview PDF zoom smoothly during gestures, rerender at full resolution after release, fit pages to width initially, and support Ctrl/Cmd + and -.
- Use the published macOS DMG asset for update detection and restore native macOS traffic lights in window-control overlay mode.
- Support an iOS-only enrollment build path that republishes the current release's iOS assets.

### Requires device validation
- Shared webview layering and click recovery, macOS traffic lights, PDF gesture behavior, and iOS enrollment publishing require runtime verification.


## [2026.06.0-port.209]

### Fixed
- Preserve the configured Tauri builder after setup so desktop, Android, and iOS compile the same plugin/setup chain before platform-specific handlers are attached.
- Keep the course name/section title stable when switching course tabs instead of letting the identity card overwrite the app bar.
- Replace the Calendar landscape Upcoming pane with events, assignments, quizzes, and other calendar items for the selected date; keep the selected-date agenda synchronized in portrait and landscape.
- Use real native macOS titlebar controls and hide them only while the navigation drawer is open; other desktop platforms keep their existing overlay controls.
- Prevent a detached native Schoology webview from being re-shown by an in-flight bounds update, avoiding stale surfaces that steal clicks after leaving an embedded page.
- Keep the startup logo centered and position its spinner directly below the rendered logo.

### Requires device validation
- Confirm native macOS traffic-light visibility during drawer transitions and verify embedded-webview pointer/context-menu behavior on desktop and mobile.

## [2026.06.0-port.208]

### Fixed
- Center the Schoology logo independently on both splash screens and place the loading spinner below it; match the native window background to the splash.
- Make the New Event dialog fullscreen on narrow/short displays and apply iOS safe-area insets.
- Rerender PDF pages at the requested zoom and device-pixel ratio instead of stretching the original bitmap; support horizontal scrolling and trackpad pinch gestures.
- Fix comment author ID resolution so comment IDs are not mistaken for user IDs; accept additional nested profile response shapes.
- Hydrate commenter and assignment-submission student names/profile photos from Schoology user records; apply dark-theme surfaces to people/comment dialogs and assignment submission panes.
- Save downloaded files in Downloads, with an app Documents/Downloads location on iOS, Files-app sharing enabled, and collision-safe filenames.
- Keep Office downloads on original file URLs (never converted previews) and reject HTML or invalid ZIP-based DOCX/PPTX/XLSX payloads rather than saving corrupted documents.
- Show one updater progress stage at a time and omit 7-Zip stages when an extractor is already installed.
- Clip native child webview bounds to the visible viewport and CSS overflow/scroll ancestors, preventing the separate native surface from painting or intercepting input outside its host.
- Route embedded-webview right-clicks to a native Tauri menu for navigation, reload, copy, select-all, and open-link actions, retaining a page-local fallback if the Tauri bridge is unavailable.

### Requires device validation
- Verify DOCX/PPTX downloads against real Schoology files and confirm iOS Files visibility and embedded-webview behavior.

## [2026.06.0-port.207]

### Fixed
- Route QR login through Schoology's signed API authorization endpoint, matching the official Android QRCodeAuthorizer flow.
- Fix shared embedded webview height rules: the renderer switches to `embeddedContentActive`, while the old full-height rules targeted only `webContentHost`.
- Keep native embedded webview bounds synchronized while CSS transitions and animations move their HTML host.
- Apply iOS safe-area padding to fullscreen dialogs and the PDF viewer; make the PDF page surroundings follow app dark mode.
- Normalize school profile update response shapes and broaden comment-author profile hydration.
- Prefer original Office file download URLs over converted preview URLs.
- Add trackpad/mouse pinch zoom to the built-in PDF viewer and restore the requested iOS updater copy and Install update action.

### Changed
- Bump the port version to 2026.06.0-port.207.

## [2026.06.0-port.206]

### Fixed
- Remove the obsolete macOS 28px shell spacer in both titlebar-overlay and normal-titlebar modes, preventing the white strip above the Schoology toolbar.

### Changed
- Bump the port version to 2026.06.0-port.206.

## [2026.06.0-port.205]

### Fixed
- Resolve comment authors and profile pictures in the shared post-comments dialog using the official comment creator ID and tolerate nested user/profile response shapes.
- Apply explicit dark-theme surfaces, borders, text, and scrim to the shared Comments/Liked by dialog.
- Locate Android Gradle release build types in both Groovy and Kotlin DSL generated files, while ignoring braces inside quoted strings and comments during block matching.
- Preserve the original filename and extension in View/Download dialogs for office files opened through converted PDFs; label the PDF viewer's opening state with the original extension.
- Add touch-based pinch zoom to the built-in PDF viewer without re-enabling pinch zoom across the rest of the iOS app.

### Changed
- Bump the port version to 2026.06.0-port.205.

## [2026.06.0-port.204]

### Fixed
- Keep the homepage Create Event dialog full-screen on narrow displays instead of overriding it with a smaller centered modal.
- Extend the iOS app viewport into the device safe area and add a Schoology-blue status-bar inset above app bars and the navigation drawer, sized from the system-reported top safe-area inset. Splash and login screens remain unchanged.

### Changed
- Bump the port version to 2026.06.0-port.204.


## [2026.06.0-port.203]

### Fixed
- Grant the standalone updater the event-listener permission required to receive update progress events.
- Keep macOS window controls visible over splash/login content, remove the artificial top offset, and synchronize controls with pushed-drawer layouts while hiding them over an overlay drawer.
- Quit Schoology before replacing the installed macOS application bundle during DMG updates.
- Preserve course names in the app bar while switching course tabs and show the course-update action when posting permission is available.
- Resolve PDF.js worker and auxiliary assets from the local renderer script rather than Schoology's remote document base URL, and show the standard loading spinner while opening a PDF.
- Use the shared people dialog for like/comment counts and hydrate profile photos through the authenticated media loader.
- Preserve original Office-file URLs for downloads and use converted PDF URLs for viewing course materials.
- Serialize shared native-webview bounds updates and limit layout observation to the app surface to avoid overlapping position/visibility operations.
- Use the 1500px pushed-drawer breakpoint and calculate toolbar spacing from the measured native window-control width.

### Changed
- Bump the port version to 2026.06.0-port.203.


## [2026.06.0-port.202]

### Fixed
- Serialize native embedded-webview teardown through Rust before falling back to the JavaScript close API, avoiding a race that could leave a blank native surface intercepting clicks after leaving a shared page.
- Move hidden native webviews off-screen and shrink them before hiding, and check hidden ancestors before synchronizing native bounds.
- Detach a failed native embedded webview instead of leaving an empty surface above the renderer, and log the underlying native error for diagnosis.
- Follow bounded Schoology annotation-file redirect chains through trusted Schoology/LAUSD hosts and signed object-storage URLs without forwarding OAuth credentials beyond the initial API request.

### Changed
- Bump the port version to 2026.06.0-port.202.


## [2026.06.0-port.201]

### Fixed
- Move the standalone updater executable and WebView2Loader.dll into a Windows-only Tauri config so iOS, macOS, and Linux do not try to bundle Windows binaries.
- Gate the student submission Annotate PDF action on Schoology v2 assignment start/restore annotation actions instead of showing it for every PDF.
- Rework the annotation editor into a full-screen page with a Schoology-style app bar, back button, icon-based tool row, better touch targets, and theme-aware colors.
- Make native embedded webviews opaque, hide failed surfaces, and always invoke the Rust teardown fallback to prevent stale child surfaces from intercepting clicks after navigation.


## [2026.06.0-port.200]

### Fixed
- Accept signed regional and path-style AWS S3 URLs used by Schoology's PDF annotation-file redirects, without forwarding OAuth credentials to storage hosts.
- Show the Download/View chooser for PDF files opened from assignment-info attachments, and detect PDFs from converted MIME metadata or the URL path.
- Animate the shared PDF viewer's opening and closing, respecting the reduced-motion setting.
- Bundle WebView2Loader.dll as an explicit app resource and stage it beside the standalone updater so the built-in Windows updater can launch reliably.
- Add a desktop notification test action and surface native delivery or Schoology polling errors instead of silently losing them.
- Keep the optimized Android release APK installable when signing secrets are missing by generating a temporary CI signing key; persistent keystore secrets remain required for seamless in-place upgrades.

## [2026.06.0-port.199]

### Fixed
- Correct the Tauri custom embedded-webview element sizing: the native adapter uses `schoology-webview`, so it now receives the same full-size, content-anchored layout as the legacy Electron webview. This prevents zero-height blank surfaces and toolbar overlap.
- Synchronize native child-webview bounds before navigating and report native position/size failures instead of silently swallowing them.
- Log and emit native notification delivery errors instead of silently discarding them, so Windows notification failures can be diagnosed.

## [2026.06.0-port.198]

### Fixed
- Add a PDF attachment chooser with Download, View, and close actions; View opens a shared fullscreen PDF.js screen with a back app bar, while Download retains the existing file-download/open path.
- Render likes and comments with author names and profile pictures, and resolve group-discussion creator IDs to names.
- Use fullscreen composer layouts on compact screens for discussion/event posts, comments, assignment submissions, and course updates.

## [2026.06.0-port.197]

### Fixed
- Keep course app-bar titles in the official `Course : Section` format after tab/permission loading and prevent the Tauri bridge from overwriting them with the plain course name.
- Gate course update and group discussion/event create buttons on API-reported POST permissions.
- Resolve school-profile update authors using additional creator-ID fields returned by Schoology.
- Require a persistent Android release keystore and validate APK signature/package identity before distributing the APK.
- Copy generated iOS icon PNGs into the Xcode AppIcon asset catalog and validate its referenced image files.

## [2026.06.0-port.196]

### Fixed
- Remove the unnecessary macOS direct-distribution provisioning-profile download from the Developer ID signing workflow; keep provisioning profiles for iOS Ad Hoc installation.
- Display course titles in the app bar using the official Android format, including the section/period after a colon when available.
- Show course-material folder descriptions from the API body when a separate description field is absent, matching the official Android folder-row behavior.

### Changed
- Remove the obsolete “verified” label from the Android APK staging and upload steps.
- Bump the port version to 2026.06.0-port.196.

## [2026.06.0-port.195]

### Fixed
- Keep the selected course name in the app bar during initial loading and when switching course tabs.
- Show the resolved user's name in the app bar and include the user's school in the profile header; in portrait, place profile tabs before the identity header to match the official Android profile layout.
- Remove the extra fixed 200px window-control overlay spacing. The app bar now reserves the measured control overlay width, and the overlay setting is hidden on Android and iOS.
- Hide native child webviews when their host element is hidden or outside the viewport, preventing stale invisible surfaces from intercepting clicks.
- Correct QR OAuth signing to pass raw scanned QR data into the normalized parameter string, matching the official Schoology Android 2026.06.0 signer.
- Build an optimized Android release APK instead of a debug APK to substantially reduce the download size.
- Add the Android camera permission and configure the generated app theme to use the Schoology-blue status bar with light status-bar icons.

### Changed
- Remove automatic failed-build labels from release notes and stop the workflow from marking builds failed on the user's behalf. Prior release history is retained.
- Update the documentation to describe the active Tauri release workflow while retaining Electron as legacy reference code.
- Bump the port version to 2026.06.0-port.195.
## [2026.06.0-port.194]

### Fixed
- Register the `schoology://` custom URL scheme in iOS builds so Schoology links can open the app, preserving the existing desktop scheme registration and deep-link event bridge.
- Add iOS camera and photo-library usage descriptions so iOS can present privacy prompts when those features are used.
- Fix iOS icon workflow validation by checking the individual PNGs generated by `tauri icon` and validating the Xcode AppIcon catalog after `tauri ios init`.
- Fix the iPhone Ad Hoc QR workflow to accept and validate the selected provisioning-profile UUID and stage the IPA where the QR manifest step expects it.

### Changed
- Regenerate iOS platform icons from the canonical 1024px Schoology launcher image during the iOS build.
- Preserve the optional one-day iOS distribution-certificate setup artifact and Ad Hoc iPhone QR installation workflow; TestFlight builds remain disabled.
- Cancel older Actions runs when a newer build starts and download the required Apple provisioning profiles.
- Bump the port version to 2026.06.0-port.194.

## [2026.06.0-port.193]

### Fixed
- Implemented student PDF annotation using the official Schoology Android v2 annotation lifecycle: start or restore a draft, retrieve signed annotation URLs, render the submitted PDF, save XFDF ink/highlighter strokes, autosave, undo/redo, and submit through the assignment finish action.
- Send message recipients as numeric JSON IDs and mark inbox messages read when opened.
- Avoid duplicate folder-history entries when refreshing the current materials folder.
- Correct the off-screen drawer's persistent edge shadow and add dialog-opening motion that respects the reduced-motion setting.
- Keep window-control overlay color aligned with the startup splash/loading surface.
- Verify Android APK signing, package ID, and icon metadata in CI; produce an installable debug APK with the Schoology launcher icon.
- Fix the release workflow's stale reference to the removed iOS build job so successful builds can consume failed-release notes correctly.

### Changed
- Add PDF.js and stage its worker, CMaps, standard fonts, and WASM assets for Tauri builds.
- Add an optional one-day iOS distribution-certificate setup artifact, retain the Ad Hoc iPhone QR install workflow, and omit TestFlight builds.
- Cancel older builds when a newer run starts and download the required Apple provisioning profiles.
- Bump the port version to 2026.06.0-port.193.

## [2026.06.0-port.192]

### Fixed
- Use the consistent `com.schoologytauri.app` bundle identifier in desktop package metadata, Tauri configuration, and the iPhone QR installation workflow.
- Make opening a message thread request attachments without explicitly preserving its unread state, matching the official Android request behavior.
- Handle Schoology's duplicate-like-action response as an already-applied state and avoid displaying `undefined` when message sending fails.
- Add a persistent, opt-in Reduced motion setting and dialog entry animation; reduced motion is disabled by default.

### Changed
- Remove the iOS simulator and TestFlight build/upload job. The workflow now produces only the optional Ad Hoc iPhone QR installation package for iOS.
- Bump the port version to 2026.06.0-port.192.


Historical sections preserve prior changes; a build failure is not recorded as a release status unless explicitly requested.

## [2026.06.0-port.191]

### Fixed
- Corrected assignment comment like requests to send the documented string value and update the visible like state/count from the API response; errors now display the actual failure instead of `undefined`.

### Changed
- Added Apple provisioning-profile downloads for iOS App Store, iOS Ad Hoc, and macOS Developer ID builds using the configured App Store Connect API credentials.
- Bumped the port version to 2026.06.0-port.191.

## [2026.06.0-port.190]

### Fixed
- Registered the Tauri `HostState` with the application builder so native commands can access their shared state. This restores school search, Canadian Schoology instance switching, and initialization of the window-controls overlay and drag region.

### Changed
- Bumped the port version to 2026.06.0-port.190.

## [2026.06.0-port.189]

### Fixed
- Corrected the Windows updater's crate-level `cfg_attr` syntax so Rust can compile the updater executable.

### Changed
- Bumped the port version to 2026.06.0-port.189.

## [2026.06.0-port.188]

### Fixed
- Made macOS signing conditional: CI uses Developer ID signing/notarization only when all required secrets are configured, and explicitly unsets Apple signing variables for unsigned builds.
- Reused the main application's existing icons in the Tauri updater configuration so Windows Rust resource generation no longer looks for a missing updater-specific `icons/icon.ico`.
- Updated the Windows updater to validate, copy, and relaunch `schoology-desktop-port.exe`, the executable actually produced by the Tauri application bundle.

### Changed
- Bumped the port version to 2026.06.0-port.188.

## [2026.06.0-port.187]

### Fixed
- Added Tauri's required mobile entry-point annotation and pinned the Android NDK version used by CI.
- Migrated existing Electron-stored OAuth credentials into Tauri's app-data location so updating does not unnecessarily sign users out.
- Routed school search through the shared Schoology API request path, validates the expected response shape, and reports API errors instead of silently showing an empty list.
- Restored the previous separate Upload Submission / Create Text Submission interface.
- Matched Window Controls Overlay button backgrounds to the login screen and made the top strip draggable while the overlay is enabled.
- Vertically centered the login logo in the available space above the first sign-in button.
- Replaced the Electron-based Windows updater helper with a lightweight Tauri updater that stages itself outside the installed resources folder, verifies downloads, preserves the direct installer-root layout, and relaunches Schoology after copying.
- Added optional macOS Developer ID signing and notarization to the GitHub Actions build when all Apple signing secrets are configured.
- Changed release descriptions to include only the released version and failed-release sections, not the notes from successful older releases.

### Changed
- Bumped the port version to 2026.06.0-port.187.

## [2026.06.0-port.186]

### Fixed
- Removed the obsolete macOS .app.zip packaging step; macOS installation and in-app updates use the DMG package.
- Switched reqwest to Rustls TLS so Android cross-compilation no longer requires a host OpenSSL installation.
- Guarded desktop-only minimize/maximize/dragging/decorations APIs out of Android and iOS builds.
- Consolidated assignment file/resource and text submissions into an Android-style composer with a shared action bar, submission-type tabs, file/resource selection, and draft support.
- Made unused app-bar space draggable while Window Controls Overlay is enabled and improved Windows caption glyphs using installed system icon fonts.
- Merged Android and iOS build jobs into the main cross-platform workflow to avoid duplicate workflow runs.
- Changed release publishing to run even when platform builds fail, publish cumulative release notes, and attach only artifacts that were successfully produced.
- Added optional Ad Hoc iPhone IPA, OTA manifest, and QR installation assets when Apple signing and a device-registered Ad Hoc provisioning profile are configured.
- Pinned macOS/iOS CI to the stable macos-26 runner instead of the Xcode 27 preview image.

### Investigated
- Commit b2df9ef added the standalone Electron updater executable to the Windows Tauri bundle. That is the direct reason for the Windows size increase; it is retained because the current update flow uses its separate progress UI and installer handoff.

### Changed
- Bumped the port version to 2026.06.0-port.186.

## [2026.06.0-port.185]

- macOS failed because the workflow attempted to package `Schoology.app` as an `.app.zip` after the updater had moved to DMG-based installation and updating.
- Android failed because `reqwest` default TLS features attempted to find host OpenSSL during the Android cross-compile.
- iOS failed because desktop-only Tauri window methods were compiled into the iOS target.
- The Windows application bundle grew after the standalone Electron-based `SchoologyUpdater.exe` was added as a bundled resource in commit `b2df9ef`.

### Changes included in the attempted release

### Fixed
- Changed the internal Tauri version to numeric components so Windows packaging no longer warns about nonnumeric port build metadata.
- Restored the standalone Schoology Windows updater helper in Windows Tauri bundles and routed in-app Windows updates through its progress UI.
- Simplified shared child-webview startup to load the destination URL directly and reduced duplicate close paths that could leave native surfaces intercepting clicks.
- Changed course navigation to start with only Materials and Updates, then reveal API-permitted tabs after permission discovery finishes.
- Improved portrait Calendar Upcoming event normalization and merged cached event data to avoid falsely showing an empty list.
- Reduced the minimum desktop window width and corrected overlay toolbar spacing; added platform-native-style window control glyphs for Windows, macOS, and Linux.
- Added Android and iOS GitHub Actions builds and optional TestFlight upload when Apple signing and App Store Connect secrets are configured.
- Added the macOS .app.zip updater asset to releases.

### Changed
- Bumped the port version to 2026.06.0-port.185.



Release descriptions are generated from the current version's release notes. Historical change details remain in this file.

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
