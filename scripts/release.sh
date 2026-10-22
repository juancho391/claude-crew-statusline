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
ASSET="$TMP/claude-crew-statusline-$TAG.tar.gz"
git archive --format=tar.gz --prefix=claude-crew-statusline/ -o "$ASSET" "$TAG"

if gh release view "$TAG" --repo "$REPO" >/dev/null 2>&1; then
  gh release upload "$TAG" "$ASSET" --repo "$REPO" --clobber
else
  gh release create "$TAG" "$ASSET" --repo "$REPO" --title "$TAG" --generate-notes
fi
