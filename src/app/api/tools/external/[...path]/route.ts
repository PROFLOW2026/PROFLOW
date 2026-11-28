import { NextResponse } from 'next/server';
import type { ToolActor } from '@/modules/external-tools/application/dispatch';
import { exportExternalSessionXlsx } from '@/modules/external-tools/application/export-session';
import { externalSchemaAvailable } from '@/modules/external-tools/infrastructure/schema-gate';
import { purgeExternalSessions, runPersistedExternalCommand } from '@/modules/external-tools/infrastructure/postgres-session';
import { getAdminDb } from '@/shared/db/client';
import { assertNotDemoOrganization } from '@/modules/demo/application/guards';
import { requireSession, runInOrgContext } from '@/shared/auth/session';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { hasPermission } from '@/shared/permissions/assert';
import { requireExternalContext } from '@/modules/contractor-access';
import { holdsOrgTool, ORG_TOOL_TAKEOFF, ORG_TOOL_VIEWER } from '@/modules/external-tools/domain/permissions';

export const runtime = 'nodejs';

const MIGRATION = 'drizzle/migrations/0217_external_professional_tools.sql';

function unavailable(): Response {
  return NextResponse.json({ error: 'migration_required', file: MIGRATION }, { status: 503 });
}

async function contractorActor(): Promise<ToolActor | Response> {
  try {
    const context = await requireExternalContext();
    const grant = context.grants.find(
      (item) =>
        item.projectId === null &&
        (item.capabilities.has(ORG_TOOL_VIEWER) || item.capabilities.has(ORG_TOOL_TAKEOFF)),
    );
    if (!grant) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    let demo = false;
    try {
      await assertNotDemoOrganization(getAdminDb(), grant.organizationId);
    } catch {
      demo = true;
    }
    return {
      organizationId: grant.organizationId,
      userId: context.authUserId,
      principalId: context.principalId,
      actorKind: 'contractor',
      canTakeoff: holdsOrgTool(context.grants, ORG_TOOL_TAKEOFF),
      demo,
    };
  } catch {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
}

async function actorForRequest(): Promise<ToolActor | Response> {
  const session = await requireSession();
  if (!session.activeOrganizationId) return contractorActor();
  return runInOrgContext(session.user.id, session.activeOrganizationId, async (org) => {
    let demo = false;
    try {
      await assertNotDemoOrganization(org.db, org.organizationId);
    } catch {
      demo = true;
    }
    return {
      organizationId: org.organizationId,
      userId: org.userId,
      principalId: null,
      actorKind: 'member' as const,
      canTakeoff: hasPermission(org, PERMISSIONS.TOOLS_EXTERNAL_TAKEOFF),
      demo,
    };
  });
}

async function handle(request: Request, segments: readonly string[]): Promise<Response> {
  if (!(await externalSchemaAvailable())) return unavailable();
  const worker = segments[0] === 'worker';
  const actor = worker ? undefined : await actorForRequest();
  if (actor instanceof Response) return actor;
  const url = new URL(request.url);
  const uploadingPart = request.method === 'PUT';
  const body = request.method === 'GET' || uploadingPart ? null : ((await request.json().catch(() => null)) as Record<string, unknown> | null);
  const bytes = uploadingPart ? new Uint8Array(await request.arrayBuffer()) : null;
  const isolatedClock =
    (process.env.EXLFY_EXTERNAL_OBJECT_ROOT ?? '').includes('exlfy-external-tools-objects') &&
    (process.env.APP_URL ?? '').startsWith('http://127.0.0.1:');
  if (request.method === 'POST' && segments[0] === 'maintenance' && segments[1] === 'sweep') {
    if (!isolatedClock || !actor || !actor.canTakeoff) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    const clock = typeof body?.now === 'string' ? new Date(body.now) : new Date();
    if (Number.isNaN(clock.getTime())) return NextResponse.json({ error: 'clock' }, { status: 422 });
    const onlySessionId = typeof body?.sessionId === 'string' ? body.sessionId : undefined;
    if (onlySessionId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(onlySessionId)) {
      return NextResponse.json({ error: 'session' }, { status: 422 });
    }
    return NextResponse.json(await purgeExternalSessions(getAdminDb(), actor.organizationId, clock, onlySessionId));
  }
  const result = await runPersistedExternalCommand({
    method: uploadingPart ? 'PUT' : request.method === 'GET' ? 'GET' : 'POST',
    segments,
    body,
    bytes,
    actor,
    token: request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? null,
    query: Object.fromEntries(url.searchParams.entries()),
    workerSupportsExternal: true,
    origin: url.origin,
  });
  if (result.bytes) {
    const providerFileId = typeof result.body.providerFileId === 'string' ? result.body.providerFileId : '';
    return new NextResponse(Buffer.from(result.bytes), {
      status: result.status,
      headers: {
        'content-type': result.contentType ?? 'application/octet-stream',
        ...(providerFileId ? { 'x-provider-file-id': providerFileId } : {}),
      },
    });
  }
  if (result.status === 204) {
    return new NextResponse(null, { status: 204, headers: { 'X-Takeoff-Export-Status': 'ready' } });
  }
  if (result.exportCall && process.env.TAKEOFF_WORKER_URL && process.env.TAKEOFF_WORKER_SECRET) {
    const exported = await fetch(`${process.env.TAKEOFF_WORKER_URL}${result.exportCall.path}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-takeoff-secret': process.env.TAKEOFF_WORKER_SECRET,
      },
      body: JSON.stringify({ ...result.exportCall.body, ...(result.exportCall.token ? { jobBearer: result.exportCall.token } : {}) }),
    });
    if (!exported.ok) {
      return NextResponse.json({ error: 'export_failed' }, { status: 502 });
    }
    return new NextResponse(Buffer.from(await exported.arrayBuffer()), {
      status: 200,
      headers: {
        'content-type': result.exportCall.mime,
        'content-disposition': `attachment; filename="${result.exportCall.fileName}"`,
      },
    });
  }
  if (result.workerJob && process.env.TAKEOFF_WORKER_URL && process.env.TAKEOFF_WORKER_SECRET) {
    await fetch(`${process.env.TAKEOFF_WORKER_URL}/v1/jobs`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-takeoff-secret': process.env.TAKEOFF_WORKER_SECRET,
      },
      body: JSON.stringify(result.workerJob),
    });
  }
  if (result.body.boq && url.searchParams.get('format') === 'xlsx') {
    const workbook = await exportExternalSessionXlsx({
      reviewedAt: typeof result.body.reviewedAt === 'string' ? new Date(result.body.reviewedAt) : null,
      boq: result.body.boq as never,
    });
    return new NextResponse(Buffer.from(workbook), {
      status: 200,
      headers: {
        'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'content-disposition': 'attachment; filename="external-boq.xlsx"',
      },
    });
  }
  return NextResponse.json(result.body, { status: result.status });
}

export async function POST(request: Request, context: { params: Promise<{ path?: string[] }> }): Promise<Response> {
  const params = await context.params;
  return handle(request, params.path ?? []);
}

export async function GET(request: Request, context: { params: Promise<{ path?: string[] }> }): Promise<Response> {
  const params = await context.params;
  return handle(request, params.path ?? []);
}

export async function PUT(request: Request, context: { params: Promise<{ path?: string[] }> }): Promise<Response> {
  const params = await context.params;
  return handle(request, params.path ?? []);
}
