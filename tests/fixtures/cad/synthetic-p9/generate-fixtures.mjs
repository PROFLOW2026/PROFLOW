/**
 * P9 isolated raster fixture (legal synthetic PNG + scene JSON).
 * Run: node tests/fixtures/cad/synthetic-p9/generate-fixtures.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));

/** 2×2 RGBA PNG — same bytes as synthetic-raster tile. */
const TILE_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAEklEQVR42mP8z8BQz0AEYBxVSF+FABJ0' +
    'A8X9H0oAAAAASUVORK5CYII=',
  'base64',
);

const scene = {
  schemaVersion: 1,
  space: '*Model_Space',
  origin: [100, 200],
  contentExtent: [108, 198, 132, 222],
  robustExtent: [108, 198, 132, 222],
  fullExtent: [108, 198, 132, 222],
  segmentCount: 0,
  segmentStride: 8,
  texts: [],
  layers: [{ i: 0, name: 'RASTER_REF', off: false, frozen: false }],
  spaces: ['*Model_Space'],
  report: {
    rendered: { Image: 1 },
    skipped: {},
    missingBlocks: {},
    xrefs: {},
    depthCut: 0,
    parserErrors: 0,
  },
  images: [
    {
      path: 'p9-raster-tile.png',
      layer: 0,
      c: 0xffffffff,
      corners: [
        [110, 200],
        [130, 200],
        [130, 220],
        [110, 220],
      ],
      clip: [
        [112, 202],
        [128, 202],
        [128, 218],
        [112, 218],
      ],
    },
  ],
};

fs.writeFileSync(path.join(dir, 'p9-raster-tile.png'), TILE_PNG);
fs.writeFileSync(path.join(dir, 'scene.json'), `${JSON.stringify(scene, null, 2)}\n`);
console.log('wrote p9-raster-tile.png, scene.json');
