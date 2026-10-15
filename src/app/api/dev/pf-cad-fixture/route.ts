import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

const FIXTURE_ROOT =
  process.env.PF_CAD_FIXTURES ??
  path.join(process.cwd(), '..', '..', 'cad-xref-test-fixtures');

const ALLOWED = new Set(['3096-EL', '3621-EL']);

function devOnly(): NextResponse | null {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  return null;
}

export async function GET(request: Request) {
  const blocked = devOnly();
  if (blocked) return blocked;

  const url = new URL(request.url);
  const bundle = url.searchParams.get('bundle') ?? '';
  const list = url.searchParams.get('list');
  const name = url.searchParams.get('name');

  if (!ALLOWED.has(bundle)) {
    return NextResponse.json({ error: 'invalid_bundle' }, { status: 400 });
  }

  const dir = path.join(FIXTURE_ROOT, bundle);

  if (list === '1') {
    const entries = await readdir(dir, { withFileTypes: true });
    const files = entries
      .filter((e) => e.isFile() && /\.dwg$/i.test(e.name))
      .map((e) => e.name);
    return NextResponse.json({ bundle, files });
  }

  if (!name || !/^[\w\s.\-+()\u0590-\u05FF]+$/u.test(name) || !name.toLowerCase().endsWith('.dwg')) {
    return NextResponse.json({ error: 'invalid_name' }, { status: 400 });
  }

  const filePath = path.join(dir, name);
  const resolved = path.resolve(filePath);
  if (!resolved.startsWith(path.resolve(dir))) {
    return NextResponse.json({ error: 'invalid_path' }, { status: 400 });
  }

  const bytes = await readFile(resolved);
  return new NextResponse(bytes, {
    headers: {
      'Content-Type': 'image/vnd.dwg',
      'Cache-Control': 'no-store',
    },
  });
}
