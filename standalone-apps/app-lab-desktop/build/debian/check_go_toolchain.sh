#!/usr/bin/env bash
#
# Fail if the debian Dockerfile's golang base image is older than the `go` directive in
# app-lab-desktop's go.mod.
#
# The two drift silently: the only workflow that builds this Dockerfile runs on al-* tags, so a
# go.mod bump can merge and sit broken for weeks before a release attempt discovers it. And it
# breaks hard rather than degrading — the official golang images set GOTOOLCHAIN=local, so an
# older image refuses to fetch the newer toolchain:
#
#   go.mod requires go >= 1.26.3 (running go 1.26.1; GOTOOLCHAIN=local)
#
# Runs in CI on every PR (pr-test-and-build.yml) and locally before every .deb build, so the
# mismatch costs seconds, not a failed release.
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
gomod="$here/../../go.mod"
dockerfile="$here/Dockerfile"

required=$(sed -n 's/^go \([0-9][0-9.]*\).*/\1/p' "$gomod" | head -1)
image=$(sed -n 's/^FROM[[:space:]]\{1,\}golang:\([0-9][0-9.]*\).*/\1/p' "$dockerfile" | head -1)

if [ -z "$required" ]; then
  echo "check_go_toolchain: could not read a 'go' directive from $gomod" >&2
  exit 1
fi
if [ -z "$image" ]; then
  echo "check_go_toolchain: could not read a numeric golang tag from the FROM line of $dockerfile" >&2
  echo "Pin the builder stage as 'FROM golang:<x.y.z>' so it can be checked against go.mod." >&2
  exit 1
fi

# image >= required, i.e. the smallest of the two version-sorted must be the requirement.
lowest=$(printf '%s\n%s\n' "$required" "$image" | sort -V | head -1)
if [ "$lowest" != "$required" ]; then
  echo "check_go_toolchain: the .deb build is broken — golang:$image cannot build a module requiring go >= $required" >&2
  echo "  go.mod:     standalone-apps/app-lab-desktop/go.mod (go $required)" >&2
  echo "  Dockerfile: standalone-apps/app-lab-desktop/build/debian/Dockerfile (FROM golang:$image)" >&2
  echo "Bump the FROM line to golang:$required or newer." >&2
  exit 1
fi

echo "check_go_toolchain: OK — golang:$image satisfies go.mod's go >= $required"
