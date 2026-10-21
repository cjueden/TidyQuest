#!/bin/sh
# Release a new version for production: ./scripts/release.sh 0.7.0
#
# Moves CHANGELOG.md's Unreleased lines under the new version, bumps the version in package.json,
# commits and tags it on main, pushes, and publishes a GitHub release (notes: that CHANGELOG section,
# then GitHub's list of merged pull requests). Publishing the release makes the GitHub workflow build
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

# CHANGELOG.md: the Unreleased lines become this version's section and the release notes
NOTES="$(mktemp)"
trap 'rm -f "$NOTES"' EXIT
node -e '
const fs = require("fs");
const [version, day, notesPath] = process.argv.slice(1);
const text = fs.readFileSync("CHANGELOG.md", "utf8");
const start = text.search(/^## Unreleased[ \t]*$/m);
if (start < 0) { console.error("CHANGELOG.md has no \"## Unreleased\" section."); process.exit(1); }
const bodyStart = text.indexOf("\n", start) + 1;
const next = text.slice(bodyStart).search(/^## /m);
const bodyEnd = next < 0 ? text.length : bodyStart + next;
const body = text.slice(bodyStart, bodyEnd).trim();
if (!body) { console.error("Nothing under \"## Unreleased\" in CHANGELOG.md: add this release'"'"'s changes there first."); process.exit(1); }
fs.writeFileSync(notesPath, body + "\n");
fs.writeFileSync("CHANGELOG.md", text.slice(0, bodyStart) + "\n## v" + version + " (" + day + ")\n\n" + body + "\n\n" + text.slice(bodyEnd));
' "$VERSION" "$(date +%F)" "$NOTES"

node -e "const fs=require('fs');const p=JSON.parse(fs.readFileSync('package.json','utf8'));p.version='$VERSION';fs.writeFileSync('package.json',JSON.stringify(p,null,2)+'\n')"
git commit -q -m "chore: release v$VERSION" package.json CHANGELOG.md
git tag -a "v$VERSION" -m "v$VERSION"
git push -q origin main "v$VERSION"

if command -v gh >/dev/null 2>&1; then
  gh release create "v$VERSION" --title "v$VERSION" --notes "$(cat "$NOTES")" --generate-notes
  echo "Published v$VERSION. The image ghcr.io/<owner>/tidyquest:$VERSION is building (GitHub -> Actions)."
else
  echo "Pushed tag v$VERSION. Now publish a release for it on GitHub (Releases -> Draft a new release),"
  echo "with the v$VERSION section of CHANGELOG.md as its notes."
fi
