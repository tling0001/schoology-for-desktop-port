# Schoology Desktop Port

Desktop port aligned with the supplied Schoology Android 2026.06.0 source.

## Version
The release version is defined by `package.json`.

## Release
The GitHub Actions workflow reads the package version and publishes platform builds under the corresponding `v<package.json version>` tag.

## Testing
Do not run npm installs in the sandbox; release builds install dependencies in GitHub Actions.
