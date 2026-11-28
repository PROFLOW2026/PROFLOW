import { describe, expect, it } from 'vitest';
import { manualChoiceKey, normalizeSavedPath, xrefIdentitiesCollide } from '@/modules/external-tools/domain/identity';
import { holdsOrgTool, orgToolCapabilities } from '@/modules/external-tools/domain/permissions';
import { SESSION_TTL_MS, objectsReadyToDelete, sessionReadable, statusAfterEdit } from '@/modules/external-tools/domain/session-rules';
import { dispatchExternalTools, type ToolActor } from '@/modules/external-tools/application/dispatch';
import { ExternalSessionService } from '@/modules/external-tools/domain/session-service';
import { zipWithinCaps } from '@/modules/external-tools/domain/zip-policy';
import { workerJobRequestSchema } from '@/modules/electrical-takeoff/domain/contracts';

describe('external tool identity', () => {
  it('keeps two blocks with the same saved path distinct', () => {
    const a = { parentLogicalId: 'host', blockName: 'A', savedPath: 'shared.dwg' };
    const b = { parentLogicalId: 'host', blockName: 'B', savedPath: 'shared.dwg' };
    expect(xrefIdentitiesCollide(a, b)).toBe(false);
    expect(manualChoiceKey(a)).not.toBe(manualChoiceKey(b));
  });

  it('does not replace an empty saved path with the block name', () => {
    expect(normalizeSavedPath('')).toBe('');
    expect(normalizeSavedPath(null)).toBe('');
    expect(manualChoiceKey({ parentLogicalId: 'host', blockName: 'A', savedPath: '' })).toContain('\u0000A\u0000');
  });
});

describe('external tool session', () => {
  it('returns the same worker job when analyze is repeated', () => {
    const service = new ExternalSessionService();
    const { session } = service.create({ organizationId: 'org', userId: 'user' });
    const first = service.analyze(session.id, 'req-1', 'job-1');
    const second = service.analyze(session.id, 'req-1', 'job-2');
    expect(first.created).toBe(true);
    expect(second).toEqual({ workerJobId: 'job-1', created: false });
  });

  it('clears a temporary review when the user edits', () => {
    const service = new ExternalSessionService();
    const { session } = service.create({ organizationId: 'org', userId: 'user' });
    service.review(session.id);
    expect(session.status).toBe('reviewed');
    service.edit(session.id, 1, { op: 'exclude' });
    expect(session.reviewedAt).toBeNull();
    expect(statusAfterEdit('reviewed')).toBe('ready');
    service.edit(session.id, 1, { op: 'again' });
    expect(session.edits).toHaveLength(1);
  });

  it('extends the worker lease from the progress token and refuses a changed locked part', () => {
    const service = new ExternalSessionService();
    const { session, tokens } = service.create({ organizationId: 'org', userId: 'user', actorKind: 'member' });
    service.addFile(session.id, { logicalId: 'file-1', relativePath: 'a.dwg', role: 'host', size: 10 });
    service.lockPart(session.id, 'file-1', 0, 'abc');
    expect(() => service.lockPart(session.id, 'file-1', 0, 'def')).toThrow('part_immutable');
    const now = new Date('2026-11-27T12:00:00Z');
    const progress = tokens.progress;
    if (!progress) throw new Error('missing progress token');
    service.progress(session.id, progress, 'extract', 40, 'xref', now);
    expect(session.stage).toBe('extract');
    expect(session.percent).toBe(40);
    expect(session.lastHeartbeatAt?.toISOString()).toBe(now.toISOString());
    expect(session.workerLeaseUntil?.getTime()).toBe(now.getTime() + 120_000);
    expect(session.actorKind).toBe('member');
  });

  it('ends access at six hours and does not move that time when the worker reports progress', () => {
    const start = new Date('2026-11-27T00:00:00Z');
    const service = new ExternalSessionService();
    const created = service.create({ organizationId: 'org-1', userId: 'user-1', now: start });
    const expiresAt = created.session.expiresAt.getTime();
    expect(expiresAt - start.getTime()).toBe(SESSION_TTL_MS);
    const progress = created.tokens.progress;
    if (!progress) throw new Error('missing progress token');
    const during = new Date(start.getTime() + 5 * 60 * 60 * 1000);
    service.progress(created.session.id, progress, 'extract', 40, null, during);
    expect(created.session.expiresAt.getTime()).toBe(expiresAt);
    expect(created.session.closedAt).toBeNull();
    const actor: ToolActor = {
      organizationId: 'org-1',
      userId: 'user-1',
      principalId: null,
      actorKind: 'member',
      canTakeoff: true,
      demo: false,
    };
    const open = dispatchExternalTools(
      service,
      { method: 'GET', segments: ['sessions', created.session.id], actor },
      new Date(expiresAt - 1),
    );
    const closed = dispatchExternalTools(
      service,
      { method: 'GET', segments: ['sessions', created.session.id], actor },
      new Date(expiresAt),
    );
    expect(open.status).toBe(200);
    expect(closed.status).toBe(410);
    expect(sessionReadable({
      status: 'ready',
      expiresAt: created.session.expiresAt,
      closedAt: null,
      now: new Date(expiresAt),
    })).toBe(false);
  });

  it('does not delete objects while a stream lease is open or the upload window remains', () => {
    const now = new Date('2026-11-27T12:00:00Z');
    expect(
      objectsReadyToDelete({
        status: 'cancelled',
        closedAt: now,
        expiresAt: now,
        uploadWindowEndsAt: new Date(now.getTime() + 1000),
        newestStreamLeaseUntil: null,
        now,
      }),
    ).toBe(false);
    expect(
      objectsReadyToDelete({
        status: 'expired',
        closedAt: null,
        expiresAt: now,
        uploadWindowEndsAt: new Date(now.getTime() - 1000),
        newestStreamLeaseUntil: new Date(now.getTime() + 1000),
        now,
      }),
    ).toBe(false);
    const start = new Date('2026-11-27T00:00:00Z');
    const sixHours = new Date(start.getTime() + SESSION_TTL_MS);
    expect(
      objectsReadyToDelete({
        status: 'ready',
        closedAt: null,
        expiresAt: sixHours,
        uploadWindowEndsAt: new Date(start.getTime() + 2 * 60 * 60 * 1000),
        newestStreamLeaseUntil: null,
        now: sixHours,
      }),
    ).toBe(true);
    expect(
      objectsReadyToDelete({
        status: 'cancelled',
        closedAt: start,
        expiresAt: sixHours,
        uploadWindowEndsAt: new Date(start.getTime() + 2 * 60 * 60 * 1000),
        newestStreamLeaseUntil: null,
        now: new Date(start.getTime() + 2 * 60 * 60 * 1000),
      }),
    ).toBe(true);
  });
});

describe('external tool permissions and zip', () => {
  it('ignores a project grant for the org tool', () => {
    const grants = [
      { projectId: 'project-1', capabilities: new Set(['ext.tools.viewer']) },
      { projectId: null, capabilities: new Set(['ext.tools.takeoff']) },
    ];
    expect(holdsOrgTool(grants, 'ext.tools.viewer')).toBe(false);
    expect(holdsOrgTool(grants, 'ext.tools.takeoff')).toBe(true);
    expect(orgToolCapabilities(['ext.tools.viewer'])).toEqual(['ext.tools.viewer']);
    expect(() => orgToolCapabilities(['ext.project.view'])).toThrow('org_tool_capability_only');
  });

  it('rejects a zip that is too large for the stated ratio', () => {
    expect(zipWithinCaps([{ name: '../secret.dwg', compressedSize: 10, uncompressedSize: 10 }]).ok).toBe(false);
    expect(zipWithinCaps([{ name: 'a.dwg', compressedSize: 10, uncompressedSize: 5000 }]).ok).toBe(false);
  });
});

describe('project worker payload', () => {
  it('does not add the external xref flag when the field is omitted', () => {
    const parsed = workerJobRequestSchema.parse({
      contractVersion: 2,
      jobId: 'job',
      files: [{ fileId: 'f', name: 'a.dwg', kind: 'dwg', sizeBytes: 1, downloadUrl: 'https://example.test/a' }],
      catalog: [],
      callback: { progressUrl: 'https://example.test/p', resultUrl: 'https://example.test/r', artifactUrl: 'https://example.test/a', token: 't' },
    });
    expect(parsed.options.resolveXrefByAnchor).toBeUndefined();
    expect(parsed.callback.terminalUrl).toBeUndefined();
  });
});
