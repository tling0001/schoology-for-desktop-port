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
