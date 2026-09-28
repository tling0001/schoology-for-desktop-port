# Building the Schoology Windows port

This repository is intentionally built by GitHub Actions.

## GitHub Actions

Push the repository to GitHub, then run **Actions → Build Schoology Windows Port**.

The workflow does **not** use `setup-node` npm caching, so a `package-lock.json` is not required for the checkout. It runs `npm install --no-audit --no-fund`, then `npm run dist`.

The resulting `dist/*.exe` files are uploaded as the `SchoologyWindowsPort-Windows-x64` artifact.
