#!/bin/sh
# Release a new version for production: ./scripts/release.sh 0.7.0
#
# Bumps the version in package.json, commits and tags it on main, pushes, and publishes a GitHub
# release (with notes from the commits). Publishing the release makes the GitHub workflow build
# ghcr.io/<owner>/tidyquest:0.7.0 and :latest. See RELEASING.md for the whole routine.
set -eu

VERSION="${1:-}"
case "$VERSION" in
  [0-9]*.[0-9]*.[0-9]*) ;;
  *) echo "Usage: $0 X.Y.Z   (e.g. $0 0.7.0)"; exit 1 ;;
esac

cd "$(dirname "$0")/.."
[ "$(git rev-parse --abbrev-ref HEAD)" = "main" ] || { echo "Switch to main first."; exit 1; }
[ -z "$(git status --porcelain)" ] || { echo "Commit or stash your changes first."; exit 1; }
git fetch -q origin main
[ "$(git rev-parse HEAD)" = "$(git rev-parse origin/main)" ] || { echo "main isn't the same as origin/main: pull or push first."; exit 1; }
git rev-parse -q --verify "refs/tags/v$VERSION" >/dev/null && { echo "v$VERSION already exists."; exit 1; }

node -e "const fs=require('fs');const p=JSON.parse(fs.readFileSync('package.json','utf8'));p.version='$VERSION';fs.writeFileSync('package.json',JSON.stringify(p,null,2)+'\n')"
git commit -q -m "chore: release v$VERSION" package.json
git tag -a "v$VERSION" -m "v$VERSION"
git push -q origin main "v$VERSION"

if command -v gh >/dev/null 2>&1; then
  gh release create "v$VERSION" --title "v$VERSION" --generate-notes
  echo "Published v$VERSION. The image ghcr.io/<owner>/tidyquest:$VERSION is building (GitHub -> Actions)."
else
  echo "Pushed tag v$VERSION. Now publish a release for it on GitHub (Releases -> Draft a new release)."
fi
