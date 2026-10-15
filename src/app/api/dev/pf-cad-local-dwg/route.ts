import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

const ALLOWED = new Set(['3031-SW.dwg', '3096-EL.dwg']);

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
  const name = url.searchParams.get('name') ?? '';
  const list = url.searchParams.get('list');

  if (list === '1') {
    const files: string[] = [];
    for (const file of ALLOWED) {
      try {
        await readFile(path.join(process.cwd(), file));
        files.push(file);
      } catch {
        /* skip */
      }
    }
    return NextResponse.json({ files });
  }

  if (!ALLOWED.has(name)) {
    return NextResponse.json({ error: 'invalid_name' }, { status: 400 });
  }

  const filePath = path.join(process.cwd(), name);
  const bytes = await readFile(filePath);
  return new NextResponse(bytes, {
    headers: {
      'Content-Type': 'application/octet-stream',
      'Cache-Control': 'no-store',
    },
  });
}

export async function HEAD(request: Request) {
  return GET(request);
}

/** List sibling CAD support files next to allowed DWGs (fonts, xref) for dev preview index. */
export async function POST(request: Request) {
  const blocked = devOnly();
  if (blocked) return blocked;

  const body = (await request.json()) as { host?: string };
  const host = body.host ?? '';
  if (!ALLOWED.has(host)) {
    return NextResponse.json({ error: 'invalid_host' }, { status: 400 });
  }

  const dir = process.cwd();
  const entries = await readdir(dir, { withFileTypes: true });
  const siblings = entries
    .filter((e) => e.isFile() && /\.(dwg|shx|ttf|otf|pat|lin)$/i.test(e.name))
    .map((e) => e.name)
    .filter((n) => n !== host);

  return NextResponse.json({ host, siblings });
}
