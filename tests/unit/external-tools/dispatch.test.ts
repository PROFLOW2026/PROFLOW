import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { BOQ_XLSX_DRAFT_BANNER } from '@/modules/electrical-takeoff/domain/boq-warnings';
import type { Boq } from '@/modules/electrical-takeoff/domain/contracts';
import { dispatchExternalTools, externalExportBanner, type ToolActor } from '@/modules/external-tools/application/dispatch';
import { exportExternalSessionXlsx } from '@/modules/external-tools/application/export-session';
import { externalAnnotatedPdfFromSession, externalWorkerRequest } from '@/modules/external-tools/application/worker-request';
import { ExternalSessionService } from '@/modules/external-tools/domain/session-service';

const sampleBoq: Boq = {
  lines: [{
    key: 'device_count|socket|1|a|r',
    typeKey: 'socket',
    label: 'שקע',
    category: 'power',
    lineKind: 'device_count',
    unit: 'יח',
    quantity: 2,
    floor: '1',
    areaId: 'a',
    ruleId: 'r',
    detectionIds: ['d1'],
    breakdown: { high: 2, medium: 0, low: 0, unclassified: 0, userAdded: 0, userConfirmed: 0 },
    verified: false,
    excluded: false,
  }],
  unclassifiedCount: 0,
  needsReviewCount: 0,
  completeness: { sheetsTotal: 1, sheetsFullyAnalyzed: 1, partialSheets: [], skippedSheets: [], xrefsMissing: [], scaleUnverifiedSheets: [] },
  warnings: ['חסר רקע'],
  state: 'draft',
};

const actor: ToolActor = {
  organizationId: 'org-1',
  userId: 'user-1',
  principalId: null,
  actorKind: 'member',
  canTakeoff: true,
  demo: false,
};

function openSession(): { service: ExternalSessionService; sessionId: string; tokens: Record<string, string> } {
  const service = new ExternalSessionService();
  const created = service.create({ organizationId: actor.organizationId, userId: actor.userId, actorKind: 'member' });
  return { service, sessionId: created.session.id, tokens: created.tokens };
}

describe('external tools commands', () => {
  it('rejects a demo organization and a foreign session', () => {
    const service = new ExternalSessionService();
    expect(dispatchExternalTools(service, { method: 'POST', segments: ['sessions'], actor: { ...actor, demo: true } }).status).toBe(403);
    const opened = openSession();
    const foreign = dispatchExternalTools(opened.service, {
      method: 'GET',
      segments: ['sessions', opened.sessionId],
      actor: { ...actor, userId: 'other' },
    });
    expect(foreign.status).toBe(404);
  });

  it('locks parts without a gap and refuses a second analyze', () => {
    const opened = openSession();
    const file = dispatchExternalTools(opened.service, {
      method: 'POST',
      segments: ['sessions', opened.sessionId, 'files'],
      actor,
      body: { logicalId: '11111111-1111-1111-1111-111111111111', relativePath: 'a.dwg', role: 'host', size: 8 },
    });
    expect(file.status).toBe(201);
    opened.service.lockPart(opened.sessionId, '11111111-1111-1111-1111-111111111111', 0, 'abc');
    const complete = dispatchExternalTools(opened.service, {
      method: 'POST',
      segments: ['sessions', opened.sessionId, 'files', '11111111-1111-1111-1111-111111111111', 'complete'],
      actor,
      body: { sha256: 'abc' },
    });
    expect(complete.status).toBe(200);
    const first = dispatchExternalTools(opened.service, {
      method: 'POST',
      segments: ['sessions', opened.sessionId, 'analyze'],
      actor,
      body: { requestId: 'req-1' },
      workerSupportsExternal: true,
    });
    const second = dispatchExternalTools(opened.service, {
      method: 'POST',
      segments: ['sessions', opened.sessionId, 'analyze'],
      actor,
      body: { requestId: 'req-1' },
      workerSupportsExternal: true,
    });
    expect(first.status).toBe(202);
    expect(second.status).toBe(200);
    expect(second.body.workerJobId).toBe(first.body.workerJobId);
  });

  it('does not mark ready before the result is stored, then exports without the draft banner', () => {
    const opened = openSession();
    const early = dispatchExternalTools(opened.service, {
      method: 'POST',
      segments: ['worker', 'terminal', opened.sessionId],
      token: opened.tokens.terminal,
      body: { outcome: 'ready' },
    });
    expect(early.status).toBe(422);
    dispatchExternalTools(opened.service, {
      method: 'POST',
      segments: ['worker', 'result', opened.sessionId],
      token: opened.tokens.result,
      body: { sha256: 'result-hash' },
    });
    const done = dispatchExternalTools(opened.service, {
      method: 'POST',
      segments: ['worker', 'terminal', opened.sessionId],
      token: opened.tokens.terminal,
      body: { outcome: 'ready' },
    });
    expect(done.body.status).toBe('ready');
    const session = opened.service.sessions.get(opened.sessionId)!;
    session.status = 'ready';
    const before = dispatchExternalTools(opened.service, {
      method: 'GET',
      segments: ['sessions', opened.sessionId, 'export'],
      actor,
      body: { warnings: ['חסר רקע'] },
    });
    expect(before.body.banner).toContain(BOQ_XLSX_DRAFT_BANNER);
    dispatchExternalTools(opened.service, { method: 'POST', segments: ['sessions', opened.sessionId, 'review'], actor });
    const after = dispatchExternalTools(opened.service, {
      method: 'GET',
      segments: ['sessions', opened.sessionId, 'export'],
      actor,
      body: { warnings: ['חסר רקע'] },
    });
    expect(after.body.banner).toEqual(['חסר רקע']);
    expect(externalExportBanner(new Date(), ['חסר רקע'])).not.toContain(BOQ_XLSX_DRAFT_BANNER);
  });

  it('keeps a live stream from being purged and ignores progress after cancel', () => {
    const opened = openSession();
    opened.service.openStream(opened.sessionId, new Date('2026-11-27T12:00:00Z'));
    dispatchExternalTools(opened.service, {
      method: 'POST',
      segments: ['sessions', opened.sessionId, 'cancel'],
      actor,
    });
    expect(opened.service.readyToPurge(opened.sessionId, new Date('2026-11-27T12:00:30Z'))).toBe(false);
    const progress = dispatchExternalTools(opened.service, {
      method: 'POST',
      segments: ['worker', 'progress', opened.sessionId],
      token: opened.tokens.progress,
      body: { stage: 'extract', percent: 10, message: 'xref' },
    });
    expect(progress.status).toBe(200);
    expect(opened.service.sessions.get(opened.sessionId)?.status).toBe('cancelled');
  });

  it('stores a manual choice by the full triple and refuses a file from another session', () => {
    const opened = openSession();
    opened.service.addFile(opened.sessionId, { logicalId: 'file-a', relativePath: 'a.dwg', role: 'host', size: 4 });
    opened.service.addFile(opened.sessionId, { logicalId: 'file-b', relativePath: 'nested/a.dwg', role: 'xref', size: 4 });
    const choice = dispatchExternalTools(opened.service, {
      method: 'POST',
      segments: ['sessions', opened.sessionId, 'xrefs'],
      actor,
      body: { parentLogicalId: 'file-a', blockName: 'TITLE', savedPath: 'a.dwg', logicalId: 'file-b' },
    });
    expect(choice.status).toBe(200);
    expect(String(choice.body.key)).toContain('TITLE');
    const missing = dispatchExternalTools(opened.service, {
      method: 'POST',
      segments: ['sessions', opened.sessionId, 'xrefs'],
      actor,
      body: { parentLogicalId: 'file-a', blockName: 'TITLE', savedPath: '', logicalId: 'other-session-file' },
    });
    expect(missing.status).toBe(422);
  });

  it('serves one matching background and does not guess an empty or colliding path', () => {
    const opened = openSession();
    const host = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const background = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    const other = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
    opened.service.addFile(opened.sessionId, { logicalId: host, relativePath: 'host.dwg', role: 'host', size: 4 });
    opened.service.addFile(opened.sessionId, { logicalId: background, relativePath: 'plans/6396.dwg', role: 'xref', size: 4 });
    opened.service.addFile(opened.sessionId, { logicalId: other, relativePath: 'copy/6396.dwg', role: 'xref', size: 4 });
    for (const id of [host, background, other]) {
      opened.service.lockPart(opened.sessionId, id, 0, 'hash', new Uint8Array([1, 2, 3, 4]));
      opened.service.completeFile(opened.sessionId, id, '9f64a747e1b97f131fabb6b447296c9b6f0201e79fb3c5356e6c77e89b6a806a');
    }
    const saved = dispatchExternalTools(opened.service, {
      method: 'POST',
      segments: ['sessions', opened.sessionId, 'xrefs'],
      actor,
      body: { parentLogicalId: host, blockName: '6396', savedPath: '6396.dwg', logicalId: background },
    });
    expect(saved.status).toBe(200);
    dispatchExternalTools(opened.service, {
      method: 'POST',
      segments: ['sessions', opened.sessionId, 'analyze'],
      actor,
      body: { requestId: 'req-xref' },
      workerSupportsExternal: true,
      origin: 'http://127.0.0.1:3410',
    });
    const unique = dispatchExternalTools(opened.service, {
      method: 'GET',
      segments: ['worker', 'xref', opened.sessionId],
      token: opened.tokens.source,
      query: { fileId: host, path: 'C:\\drawings\\host.dwg', block: 'HOST', anchor: '' },
    });
    expect(unique.status).toBe(200);
    expect(unique.body.providerFileId).toBe(host);
    const chosen = dispatchExternalTools(opened.service, {
      method: 'GET',
      segments: ['worker', 'xref', opened.sessionId],
      token: opened.tokens.source,
      query: { fileId: host, path: '6396.dwg', block: '6396', anchor: '' },
    });
    expect(chosen.status).toBe(200);
    expect(chosen.body.providerFileId).toBe(background);
    const empty = dispatchExternalTools(opened.service, {
      method: 'GET',
      segments: ['worker', 'xref', opened.sessionId],
      token: opened.tokens.source,
      query: { fileId: host, path: '', block: '6396', anchor: '' },
    });
    expect(empty.status).toBe(404);
    const unchosen = dispatchExternalTools(opened.service, {
      method: 'GET',
      segments: ['worker', 'xref', opened.sessionId],
      token: opened.tokens.source,
      query: { fileId: host, path: '6396.dwg', block: 'OTHER', anchor: '' },
    });
    expect(unchosen.status).toBe(404);
  });

  it('issues an upload key, refuses a locked part, and leases a locked download', () => {
    const opened = openSession();
    const id = '22222222-2222-2222-2222-222222222222';
    opened.service.addFile(opened.sessionId, { logicalId: id, relativePath: 'a.dwg', role: 'host', size: 4 });
    const issued = dispatchExternalTools(opened.service, {
      method: 'POST',
      segments: ['sessions', opened.sessionId, 'files', id, 'upload-url'],
      actor,
      body: { partIndex: 0 },
    });
    expect(issued.status).toBe(200);
    expect(String(issued.body.uploadKey)).toContain('/upload');
    opened.service.lockPart(opened.sessionId, id, 0, 'part-hash', new Uint8Array([1, 2, 3, 4]));
    const again = dispatchExternalTools(opened.service, {
      method: 'POST',
      segments: ['sessions', opened.sessionId, 'files', id, 'upload-url'],
      actor,
      body: { partIndex: 0 },
    });
    expect(again.status).toBe(409);
    const bytes = dispatchExternalTools(opened.service, {
      method: 'GET',
      segments: ['sessions', opened.sessionId, 'files', id, 'bytes'],
      actor,
      query: { partIndex: '0' },
    });
    expect(bytes.status).toBe(200);
    expect(bytes.body.providerFileId).toBe(id);
    expect(opened.service.readyToPurge(opened.sessionId, new Date())).toBe(false);
  });

  it('writes the existing workbook and omits the draft banner after temporary approval', async () => {
    const draft = await exportExternalSessionXlsx({ reviewedAt: null, boq: sampleBoq });
    const approved = await exportExternalSessionXlsx({ reviewedAt: new Date('2026-11-27T12:00:00Z'), boq: sampleBoq });
    const draftBook = new ExcelJS.Workbook();
    const approvedBook = new ExcelJS.Workbook();
    await draftBook.xlsx.load(draft as unknown as ArrayBuffer);
    await approvedBook.xlsx.load(approved as unknown as ArrayBuffer);
    const draftItems = draftBook.getWorksheet('אזהרות ומגבלות')?.getColumn(1).values.join('\n') ?? '';
    const approvedItems = approvedBook.getWorksheet('אזהרות ומגבלות')?.getColumn(1).values.join('\n') ?? '';
    expect(draftItems).toContain(BOQ_XLSX_DRAFT_BANNER);
    expect(approvedItems).not.toContain(BOQ_XLSX_DRAFT_BANNER);
    expect(approvedItems).toContain('חסר רקע');
    const request = externalWorkerRequest({
      sessionId: 'session-1',
      jobId: 'job-1',
      origin: 'http://127.0.0.1:9',
      files: [{ logicalId: 'file-1', name: 'a.dwg', size: 4, sha256: 'abc' }],
      tokens: { source: 's', result: 'r', progress: 'p', terminal: 't' },
    });
    expect(request.options.resolveXrefByAnchor).toBe(true);
    expect(request.pairing).toEqual([]);
    expect(JSON.stringify(request)).not.toContain('projectId');
    const paired = externalWorkerRequest({
      sessionId: 'session-1',
      jobId: 'job-1',
      origin: 'http://127.0.0.1:9',
      files: [
        { logicalId: 'pdf-1', name: 'plan.pdf', size: 4, sha256: 'a' },
        { logicalId: 'dwg-1', name: 'plan.dwg', size: 4, sha256: 'b' },
        { logicalId: 'legend-1', name: 'מקרא.pdf', size: 4, sha256: 'c' },
      ],
      tokens: { source: 's', result: 'r', progress: 'p', terminal: 't' },
    });
    expect(paired.pairing).toEqual([{ pdfFileId: 'pdf-1', dwgFileId: 'dwg-1' }]);
    const pdf = externalAnnotatedPdfFromSession({
      session: {
        id: 'session-1',
        files: new Map([
          ['file-1', { logicalId: 'file-1', relativePath: 'a.pdf', role: 'host', size: 4, sha256: 'abc', partSize: 4, parts: new Map() }],
        ]),
        resultPayload: {
          sheets: [{
            sheetKey: 'p1',
            fileId: 'file-1',
            name: 'a.pdf',
            kind: 'pdf_page',
            index: 0,
            widthPx: 100,
            heightPx: 100,
            previewArtifact: null,
            scale: { ratio: null, metersPerPreviewPx: null, verified: false, source: 'none' },
            analyzed: 'full',
          }],
          detections: [],
        },
      } as never,
      origin: 'http://127.0.0.1:9',
      token: 'result',
    });
    expect(pdf).not.toBeNull();
    expect(JSON.stringify(pdf)).not.toContain('projectId');
  });

  it('rejects overlapping parts', () => {
    const opened = openSession();
    opened.service.addFile(opened.sessionId, {
      logicalId: 'file-a',
      relativePath: 'a.dwg',
      role: 'host',
      size: 8,
      partSize: 4,
    });
    opened.service.lockPart(opened.sessionId, 'file-a', 0, 'one');
    expect(() => opened.service.completeFile(opened.sessionId, 'file-a', 'all')).toThrow('part_missing');
    opened.service.lockPart(opened.sessionId, 'file-a', 1, 'two');
    expect(() => opened.service.completeFile(opened.sessionId, 'file-a', 'all')).not.toThrow();
  });
});
