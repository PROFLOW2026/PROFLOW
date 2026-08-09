import { NextResponse } from 'next/server';

/** Lightweight health probe for the versioned API surface. No auth required. */
export async function GET() {
  return NextResponse.json({ ok: true, apiVersion: 'v1' });
}
