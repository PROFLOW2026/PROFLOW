import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

const FIXTURE_ROOT =
  process.env.PF_CAD_FIXTURES ??
  path.join(process.cwd(), '..', '..', 'cad-xref-test-fixtures');

const SYNTHETIC_FONT_ROOT = path.join(process.cwd(), 'tests/fixtures/cad/synthetic-shx');
const SYNTHETIC_RASTER_ROOT = path.join(process.cwd(), 'tests/fixtures/cad/synthetic-raster');

const ALLOWED_BUNDLES = new Set(['3096-EL', '3621-EL']);

const CAD_SUPPORT = /\.(dwg|dxf|shx|pat|lin|ttf|otf|png|jpe?g|tif|webp)$/i;

function devOnly(): NextResponse | null {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  return null;
}

function extraFontDirs(): string[] {
  const fromEnv = (process.env.PF_CAD_FONT_DIRS ?? '')
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean);
  return [SYNTHETIC_FONT_ROOT, SYNTHETIC_RASTER_ROOT, ...fromEnv];
}

async function findFontFile(basename: string): Promise<string | null> {
  const target = basename.toLowerCase();
  for (const dir of extraFontDirs()) {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const ent of entries) {
      if (!ent.isFile()) continue;
      if (ent.name.toLowerCase() === target) {
        const resolved = path.resolve(path.join(dir, ent.name));
        if (resolved.startsWith(path.resolve(dir))) return resolved;
      }
    }
  }
  return null;
}

function contentTypeForName(name: string): string {
  const lower = name.toLowerCase();
  if (lower.endsWith('.dwg')) return 'image/vnd.dwg';
  if (lower.endsWith('.dxf')) return 'image/vnd.dxf';
  if (lower.endsWith('.shx')) return 'application/octet-stream';
  if (lower.endsWith('.ttf')) return 'font/ttf';
  if (lower.endsWith('.otf')) return 'font/otf';
  if (/\.jpe?g$/i.test(lower)) return 'image/jpeg';
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (/\.tif?f$/i.test(lower)) return 'image/tiff';
  return 'application/octet-stream';
}

const SAFE_NAME = /^[\w\s.\-+()\u0590-\u05FF]+$/u;

export async function GET(request: Request) {
  const blocked = devOnly();
  if (blocked) return blocked;

  const url = new URL(request.url);
  const bundle = url.searchParams.get('bundle') ?? '';
  const list = url.searchParams.get('list');
  const name = url.searchParams.get('name');
  const source = url.searchParams.get('source');

  if (source === 'font') {
    if (!name || !SAFE_NAME.test(name) || !CAD_SUPPORT.test(name)) {
      return NextResponse.json({ error: 'invalid_name' }, { status: 400 });
    }
    const filePath = await findFontFile(path.basename(name));
    if (!filePath) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
    const bytes = await readFile(filePath);
    return new NextResponse(bytes, {
      headers: {
        'Content-Type': contentTypeForName(name),
        'Cache-Control': 'no-store',
      },
    });
  }

  if (list === 'fonts') {
    const names = new Set<string>();
    for (const dir of extraFontDirs()) {
      let entries;
      try {
        entries = await readdir(dir, { withFileTypes: true });
      } catch {
        continue;
      }
      for (const ent of entries) {
        if (ent.isFile() && /\.(shx|ttf|otf)$/i.test(ent.name)) {
          names.add(ent.name);
        }
      }
    }
    return NextResponse.json({ fonts: [...names].sort() });
  }

  if (!ALLOWED_BUNDLES.has(bundle)) {
    return NextResponse.json({ error: 'invalid_bundle' }, { status: 400 });
  }

  const dir = path.join(FIXTURE_ROOT, bundle);

  if (list === '1' || list === 'cad') {
    const entries = await readdir(dir, { withFileTypes: true });
    const files = entries
      .filter((e) => e.isFile() && (list === 'cad' ? CAD_SUPPORT.test(e.name) : /\.dwg$/i.test(e.name)))
      .map((e) => e.name);
    return NextResponse.json({ bundle, files });
  }

  if (!name || !SAFE_NAME.test(name)) {
    return NextResponse.json({ error: 'invalid_name' }, { status: 400 });
  }

  if (!CAD_SUPPORT.test(name)) {
    return NextResponse.json({ error: 'invalid_name' }, { status: 400 });
  }

  let filePath = path.join(dir, name);
  let resolved = path.resolve(filePath);
  if (!resolved.startsWith(path.resolve(dir))) {
    return NextResponse.json({ error: 'invalid_path' }, { status: 400 });
  }

  let bytes: Buffer;
  try {
    bytes = await readFile(resolved);
  } catch {
    const alt = await findFontFile(path.basename(name));
    if (!alt) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
    bytes = await readFile(alt);
  }

  return new NextResponse(bytes, {
    headers: {
      'Content-Type': contentTypeForName(name),
      'Cache-Control': 'no-store',
    },
  });
}
