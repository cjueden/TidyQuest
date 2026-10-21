# Releasing

Two images come out of this repo (`.github/workflows/docker-publish.yml`):

| When | Image tags | Used by |
|---|---|---|
| Every merge to `main` | `:main`, `:sha-<short>` | **Staging**: `docker compose pull && docker compose up -d` |
| A published GitHub release `vX.Y.Z` | `:X.Y.Z`, `:X.Y`, `:X`, `:latest` | **Production**, pinned to `:X.Y.Z` |

Settings → Version shows which one is running: `v0.7.0` on a release, `v0.6.3 · main · 7e18930` on a
build from `main`. Without logging in: `curl http://<server>:<port>/api/version`.

## Putting a new version on production

1. Merge the work into `main` and try it on staging (`:main`). Each pull request adds its lines to
   [CHANGELOG.md](CHANGELOG.md) under **Unreleased** (Added, Changed or Fixed), in plain language.
2. Release it from an up-to-date `main` checkout:

   ```sh
   ./scripts/release.sh 0.7.0
   ```

   This moves CHANGELOG.md's Unreleased lines under `## v0.7.0 (date)`, bumps `package.json`, commits
   `chore: release v0.7.0`, tags `v0.7.0`, pushes both and publishes the GitHub release with that
   changelog section as its notes, followed by GitHub's list of merged pull requests (with `gh`; without
   it, publish the release for the tag on GitHub yourself). It stops if Unreleased is empty.
   Pick the number by what changed: `0.7.1` for fixes only, `0.8.0` for new features.
3. Wait for the "Build and Push Docker Image" run to finish (GitHub → Actions).
4. On the production server, pin the new version in `docker-compose.yml` and pull it:

   ```yaml
   image: ghcr.io/<your-github-user>/tidyquest:0.7.0
   ```

   ```sh
   docker compose pull && docker compose up -d
   ```

## Rolling back

Set the image back to the previous version (e.g. `:0.6.3`) and run `docker compose up -d` again.
The database migrates forward only (new columns and tables are added on start and ignored by older
versions), so take a backup first (Settings → Data → Download, or copy the `data` folder) before a
big release.
