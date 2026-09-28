# Build

Push this folder to GitHub and run **Actions → Build Schoology for Windows**.

Optional repository secrets:
- `SCHOOLOGY_CONSUMER_KEY`
- `SCHOOLOGY_CONSUMER_SECRET`

The supplied APK's live OAuth values are included as defaults for development. For redistribution, use repository secrets and replace them in a private deployment as appropriate.

The workflow produces both an NSIS installer and a portable x64 EXE.
