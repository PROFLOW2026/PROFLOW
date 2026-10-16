/**
 * Tiny PNG fixtures for P9 raster WebGL / dev pf-cad-fixture serving.
 * Run: node tests/fixtures/cad/synthetic-raster/generate-fixtures.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));

/** 2×2 RGBA PNG (red + blue corners) — valid PNG, no external deps. */
const TILE_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAEklEQVR42mP8z8BQz0AEYBxVSF+FABJ0' +
    'A8X9H0oAAAAASUVORK5CYII=',
  'base64',
);

/** 1×1 opaque green pixel. */
const DOT_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

fs.writeFileSync(path.join(dir, 'synthetic-tile.png'), TILE_PNG);
fs.writeFileSync(path.join(dir, 'synthetic-dot.png'), DOT_PNG);
console.log('wrote synthetic-tile.png, synthetic-dot.png');
