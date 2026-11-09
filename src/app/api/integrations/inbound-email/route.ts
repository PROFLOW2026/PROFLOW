import { NextResponse } from 'next/server';

/** Local foundation only — no purchased inbound mailbox is wired. */
export async function POST(): Promise<Response> {
  return NextResponse.json({ ok: false, reason: 'no_mailbox' }, { status: 503 });
}

export async function GET(): Promise<Response> {
  return NextResponse.json({ ok: false, reason: 'no_mailbox' }, { status: 503 });
}
