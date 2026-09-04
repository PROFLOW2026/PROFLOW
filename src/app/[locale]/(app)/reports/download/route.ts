import { NextResponse } from 'next/server';
import { isReportKind, reportPreviewPath } from '@/modules/reports';

/** PDF file download is retired. Old bookmarks go to print preview. */
export async function GET(
  request: Request,
  context: { params: Promise<{ locale: string }> },
) {
  const { locale } = await context.params;
  const url = new URL(request.url);
  const kind = url.searchParams.get('kind') ?? '';
  const id = url.searchParams.get('id') ?? '';
  if (!isReportKind(kind) || !id) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  const preview = new URL(`/${locale}${reportPreviewPath(kind, id)}`, url.origin);
  return NextResponse.redirect(preview, 303);
}
