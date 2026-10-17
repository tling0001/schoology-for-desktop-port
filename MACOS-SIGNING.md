# macOS signing and notarization

The macOS workflow signs and notarizes Schoology only when all of the following GitHub Actions repository secrets are configured:

- `MACOS_CERTIFICATE_P12_BASE64`: base64-encoded **Developer ID Application** certificate exported as a password-protected `.p12` file. An Apple Distribution certificate used for iOS is not a substitute.
- `MACOS_CERTIFICATE_PASSWORD`: password used to export that `.p12`.
- `MACOS_SIGNING_IDENTITY`: exact Developer ID Application identity name, for example `Developer ID Application: Your Name (TEAMID)`.
- `APPLE_ID`: Apple ID account used for notarization.
- `APPLE_APP_SPECIFIC_PASSWORD`: app-specific password for that Apple ID.
- `APPLE_TEAM_ID`: Apple Developer Team ID.

Export the Developer ID Application certificate and private key from Keychain Access on a Mac, save them as a password-protected `.p12`, then base64-encode the file before saving its contents as the secret. On macOS or Linux, the value can be generated with `base64 -i DeveloperID.p12 | tr -d '\n'`; on PowerShell, use `[Convert]::ToBase64String([IO.File]::ReadAllBytes('DeveloperID.p12'))`.

When the secrets are incomplete, CI deliberately continues with an unsigned build and prints a warning rather than failing the entire cross-platform release. A signed and notarized build is what prevents Gatekeeper from showing the unidentified-developer warning; ad-hoc signing alone is not sufficient.
