#!/usr/bin/env bash
# Build LibreDWG dwg2dxf from source (Docker/Linux worker image). GPLv3 CLI only.
set -eu
TAG="${LIBREDWG_TAG:-0.14}"
PREFIX="${PREFIX:-/usr/local}"
WORKDIR="${TMPDIR:-/tmp}/libredwg-build"
mkdir -p "$WORKDIR"
cd "$WORKDIR"
if [ ! -d "libredwg-$TAG" ]; then
  ARCHIVE="$WORKDIR/libredwg-$TAG.tar.gz"
  for attempt in 1 2 3; do
    rm -f "$ARCHIVE"
  curl -fL --retry 5 --retry-delay 3 \
    "https://github.com/LibreDWG/libredwg/releases/download/$TAG/libredwg-$TAG.tar.gz" \
    -o "$ARCHIVE" && break
    sleep "$attempt"
  done
  test -s "$ARCHIVE"
  tar xzf "$ARCHIVE"
fi
cd "libredwg-$TAG"
./configure --prefix="$PREFIX" --disable-bindings --disable-python
make -j"$(nproc 2>/dev/null || echo 2)"
make install
command -v dwg2dxf
dwg2dxf --version || true