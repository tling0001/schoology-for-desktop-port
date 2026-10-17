# Installing Schoology on an iPhone with a QR code

The main workflow can produce a QR-based over-the-air install package when Ad Hoc signing is configured. This is optional; simulator builds and desktop releases do not require these secrets.

## Apple requirements

1. Enroll in the Apple Developer Program and create an App ID with bundle identifier `com.schoology.app`.
2. Register the iPhone's UDID in the Apple Developer account. An Ad Hoc provisioning profile can install only on devices listed in that profile.
3. Create an **Ad Hoc** provisioning profile for `com.schoology.app` using an Apple Distribution certificate, and download it.
4. Export that Apple Distribution certificate and private key as a password-protected `.p12` file.

## GitHub Actions secrets

In the repository's **Settings → Secrets and variables → Actions → Repository secrets**, configure:

- `IOS_CERTIFICATE_P12_BASE64`: base64-encoded `.p12` file.
- `IOS_CERTIFICATE_PASSWORD`: the password used when exporting that `.p12`.
- `APPLE_TEAM_ID`: the 10-character Apple Developer Team ID.
- `IOS_ADHOC_PROVISIONING_PROFILE_BASE64`: base64-encoded Ad Hoc `.mobileprovision` file containing the registered iPhone UDID.

On macOS, create the base64 values with `base64 -i path/to/file | pbcopy`. Never commit certificates, private keys, provisioning profiles, or decoded contents to the repository.

## Installing

When the optional signing job succeeds, the release includes:

- `Schoology-<version>-iOS-AdHoc.ipa`
- `Schoology-<version>-iOS-AdHoc.plist` (Apple's OTA installation manifest)
- `Schoology-<version>-iOS-Install-QR.png`

Open the QR image on another screen and scan it with the iPhone camera. The release must be publicly accessible without signing into GitHub. The workflow validates that the exported IPA contains a profile with registered devices before it publishes the QR code.

## Developer Mode and trust

Apple requires Developer Mode to run apps installed from an IPA, including this Ad Hoc build. On the iPhone, open **Settings → Privacy & Security → Developer Mode**, turn it on, restart, then confirm the prompt after restart. If Developer Mode is not visible yet, pair the iPhone with Xcode or initiate device setup first. The QR code cannot enable Developer Mode, register the iPhone, or bypass signing. The device must still be listed in the Ad Hoc provisioning profile. See [Apple's distribution guide](https://developer.apple.com/documentation/xcode/distributing-your-app-to-registered-devices) and [Developer Mode instructions](https://developer.apple.com/documentation/xcode/enabling-developer-mode-on-a-device).
