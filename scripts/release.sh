#!/bin/sh
# Publish a GitHub Release for an existing tag, with the repo archive as its asset.
# Usage: scripts/release.sh vX.Y.Z   (the tag must already be pushed)
set -eu

TAG=${1:?usage: scripts/release.sh vX.Y.Z}
REPO=juancho391/claude-crew-statusline
command -v gh >/dev/null 2>&1 || { echo 'error: gh is required' >&2; exit 1; }
git rev-parse -q --verify "refs/tags/$TAG" >/dev/null || { echo "error: tag $TAG does not exist locally" >&2; exit 1; }
git ls-remote --exit-code --tags origin "$TAG" >/dev/null || { echo "error: tag $TAG is not pushed to origin" >&2; exit 1; }

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT INT TERM
ASSET_TGZ="$TMP/claude-crew-statusline-$TAG.tar.gz"   # install.sh (macOS, Linux, WSL)
ASSET_ZIP="$TMP/claude-crew-statusline-$TAG.zip"      # install.ps1 (Windows)
git archive --format=tar.gz --prefix=claude-crew-statusline/ -o "$ASSET_TGZ" "$TAG"
git archive --format=zip --prefix=claude-crew-statusline/ -o "$ASSET_ZIP" "$TAG"

if gh release view "$TAG" --repo "$REPO" >/dev/null 2>&1; then
  gh release upload "$TAG" "$ASSET_TGZ" "$ASSET_ZIP" --repo "$REPO" --clobber
else
  gh release create "$TAG" "$ASSET_TGZ" "$ASSET_ZIP" --repo "$REPO" --title "$TAG" --generate-notes
fi

# A new asset can answer 404 for up to a minute or two; wait so the installers never fall back right after a release.
BASE="https://github.com/$REPO/releases/download/$TAG/claude-crew-statusline-$TAG"
for URL in "$BASE.tar.gz" "$BASE.zip"; do
  i=0
  until [ "$(curl -s -o /dev/null -w '%{http_code}' -L "$URL")" = 200 ]; do
    i=$((i + 1))
    if [ "$i" -ge 12 ]; then echo "warning: asset not reachable after 2 minutes ($URL); installers fall back to the source archive until it is." >&2; break; fi
    sleep 10
  done
  [ "$i" -lt 12 ] && echo "asset is live: $URL"
done
exit 0
