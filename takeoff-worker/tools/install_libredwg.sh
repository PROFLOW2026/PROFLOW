#!/usr/sh
# Build LibreDWG dwg2dxf from source (Docker/Linux worker image). GPLv3 CLI only.
set -eu
TAG="${LIBREDWG_TAG:-0.14.0}"
PREFIX="${PREFIX:-/usr/local}"
WORKDIR="${TMPDIR:-/tmp}/libredwg-build"
mkdir -p "$WORKDIR"
cd "$WORKDIR"
if [ ! -d "libredwg-$TAG" ]; then
  curl -sL "https://github.com/LibreDWG/libredwg/releases/download/$TAG/libredwg-$TAG.tar.gz" | tar xz
fi
cd "libredwg-$TAG"
./configure --prefix="$PREFIX" --disable-bindings --disable-python
make -j"$(nproc 2>/dev/null || echo 2)"
make install
command -v dwg2dxf
dwg2dxf --version || true