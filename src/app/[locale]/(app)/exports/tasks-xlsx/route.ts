import { NextResponse } from 'next/server';
import { AuthorizationError } from '@/shared/errors';
import { withOrgContext } from '@/shared/auth/session';
import { buildTasksXlsxExport } from '@/modules/exports/application/build-tasks-xlsx';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const params = Object.fromEntries(url.searchParams.entries());

  try {
    const result = await withOrgContext((context) => buildTasksXlsxExport(context, params));
    return new NextResponse(new Uint8Array(result.body), {
      status: 200,
      headers: {
        'Content-Type': result.contentType,
        'Content-Disposition': `attachment; filename="${result.fileName}"`,
      },
    });
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    }
    throw error;
  }
}
