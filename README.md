# Schoology Windows Port v6

This is a cross-platform Electron implementation based on the supplied Schoology Android APK/decompiled source. The Android app is itself hybrid: native login/navigation/data flows plus WebView/hybrid surfaces. This project reproduces those boundaries rather than treating Schoology as one generic web page.

## GitHub Actions

Push the repository and run `.github/workflows/build-windows.yml`. The workflow produces NSIS and portable Windows x64 artifacts.

## Login implementation

The implementation follows the supplied Android sources:
- `ServerConfig` live host: `api.schoology.com` / `app.schoology.com`
- Android client consumer credentials recovered from `ServerConfig`
- `OAuthAuthenticator` request-token/access-token sequence
- `EmailAuthorizer` / `UsernameAuthorizer` automatic authorization
- `QRCodeAuthorizer` QR automatic authorization with HMAC signing
- Android client User-Agent `Schoology Android v2025.04.0`
- School search endpoint `login/school_search`

Camera QR scanning uses the desktop camera permission and jsQR, then follows the Android QR authorization flow.

Do not publish modified client credentials or claim official affiliation with PowerSchool/Schoology.
