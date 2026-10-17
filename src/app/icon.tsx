import { readFileSync } from 'node:fs';
import path from 'node:path';

/** Serves the existing brand PNG. Does not draw a new mark. */
export const size = { width: 192, height: 192 };
export const contentType = 'image/png';

export default function Icon() {
  const bytes = readFileSync(path.join(process.cwd(), 'public', 'icons', 'icon-192.png'));
  return new Response(bytes, {
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
}
