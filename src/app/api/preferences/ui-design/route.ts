import { NextResponse } from 'next/server';
import { createSupabaseServerClient, getSupabaseUser } from '@/shared/supabase/server';
import { DESIGN_AUTH_METADATA_KEY, isEnabledDesign } from '@/shared/theme/design/config';

export const dynamic = 'force-dynamic';

/** Writes design metadata only. The browser owns the cookie, so this does not refresh the page. */
export async function POST(request: Request): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  const raw =
    body && typeof body === 'object' && 'design' in body
      ? (body as { design?: unknown }).design
      : null;
  if (!isEnabledDesign(raw)) return NextResponse.json({ ok: false }, { status: 400 });

  const authUser = await getSupabaseUser();
  if (!authUser?.id) return NextResponse.json({ ok: true, persisted: 'cookie-only' });

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.updateUser({
    data: { [DESIGN_AUTH_METADATA_KEY]: raw },
  });
  if (error) return NextResponse.json({ ok: true, persisted: 'cookie-only' });
  return NextResponse.json({ ok: true, persisted: 'metadata' });
}
