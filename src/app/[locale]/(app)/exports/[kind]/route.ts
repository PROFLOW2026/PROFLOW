import { NextResponse } from 'next/server';
import { AppError, AuthorizationError, ValidationError } from '@/shared/errors';
import { withOrgContext } from '@/shared/auth/session';
import { buildExport } from '@/modules/exports';

export async function GET(
  request: Request,
  context: { params: Promise<{ locale: string; kind: string }> },
) {
  const { kind } = await context.params;
  const url = new URL(request.url);
  const projectId = url.searchParams.get('projectId');
  const format = url.searchParams.get('format');

  try {
    const result = await withOrgContext((org) =>
      buildExport(org, kind, { projectId, format }),
    );
    // CSV is text; XLSX is binary. Cast binary through BodyInit for DOM lib variance.
    if (typeof result.body === 'string') {
      return new NextResponse(result.body, { status: 200, headers: result.headers });
    }
    const bytes = Uint8Array.from(result.body);
    return new NextResponse(bytes, { status: 200, headers: result.headers });
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    }
    if (error instanceof ValidationError) {
      return NextResponse.json({ error: 'invalid_request', issues: error.issues }, { status: 400 });
    }
    if (error instanceof AppError) {
      return NextResponse.json({ error: error.messageKey ?? 'error' }, { status: error.status });
    }
    throw error;
  }
}
