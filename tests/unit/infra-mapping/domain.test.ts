/**
 * Infrastructure mapping - pure domain rules. No database, no SQL: these run against plain data.
 */
import { describe, expect, it } from 'vitest';
import { parseAlignmentRecord, scaleAdjustToStage } from '@/modules/infra-mapping/domain/alignment-record';
import {
  dayRange,
  decodeCursor,
  encodeCursor,
  escapeLikePattern,
  infraTypesMatchingText,
  locationIdsMatchingText,
  locationLabel,
  subtreeIds,
} from '@/modules/infra-mapping/domain/filters';
import {
  annotatedFileName,
  comparisonSidecarName,
  infraFolderNameForLocation,
  infraPhotoFileName,
  sanitizeInfraFolderName,
  uniqueFolderName,
} from '@/modules/infra-mapping/domain/folder-naming';
import { markingInputSchema, readMarkingGeometry, simplifyStroke, toUnitPoint } from '@/modules/infra-mapping/domain/markings';
import { INFRA_DB_PENDING_MESSAGE, isMissingInfraSchema } from '@/modules/infra-mapping/domain/messages';
import {
  MAX_UPLOAD_ATTEMPTS,
  approve,
  cancel,
  canApprove,
  failUpload,
  finishUpload,
  hasUnsavedWork,
  newQueueItem,
  nextUploadable,
  queueSummary,
  retry,
  startUpload,
  type QueueItem,
} from '@/modules/infra-mapping/domain/upload-queue';
import type { InfraLocationOption } from '@/modules/infra-mapping/domain/types';
import { beginCaptureSchema, beginComparisonSchema, listCapturesSchema, updateCaptureSchema } from '@/modules/infra-mapping/domain/validation';

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

describe('upload queue: nothing is uploaded before approval', () => {
  const fresh = () => newQueueItem({ clientId: uuid(1), locationId: uuid(10), source: 'camera' });

  it('a captured photo waits for approval and is never eligible for upload', () => {
    const item = fresh();
    expect(item.status).toBe('pending_approval');
    expect(nextUploadable([item])).toEqual([]);
    expect(startUpload(item).status).toBe('pending_approval');
  });

  it('only the approved state is uploadable', () => {
    const approved = approve(fresh());
    expect(approved.status).toBe('approved');
    expect(nextUploadable([approved]).map((item) => item.clientId)).toEqual([uuid(1)]);
    expect(startUpload(approved).status).toBe('uploading');
  });

  it('the location is the only mandatory field', () => {
    const noLocation = newQueueItem({ clientId: uuid(2), locationId: null, source: 'gallery' });
    expect(canApprove(noLocation)).toBe(false);
    expect(approve(noLocation).status).toBe('pending_approval');
    const located = { ...noLocation, locationId: uuid(10) };
    expect(canApprove(located)).toBe(true);
  });

  it('cancel / retake drops an unapproved photo without ever uploading it', () => {
    const cancelled = cancel(fresh());
    expect(cancelled.status).toBe('cancelled');
    expect(approve(cancelled).status).toBe('cancelled');
    expect(nextUploadable([cancelled])).toEqual([]);
  });

  it('an uploading photo cannot be cancelled into oblivion', () => {
    const uploading = startUpload(approve(fresh()));
    expect(cancel(uploading).status).toBe('uploading');
  });

  it('respects the concurrency limit so shooting never waits for uploads', () => {
    const queue: QueueItem[] = [1, 2, 3, 4].map((n) => approve(newQueueItem({ clientId: uuid(n), locationId: uuid(10), source: 'camera' })));
    expect(nextUploadable(queue)).toHaveLength(2);
    const running = [startUpload(queue[0]!), ...queue.slice(1)];
    expect(nextUploadable(running)).toHaveLength(1);
  });

  it('failure keeps the photo, allows retry and bounds the attempts', () => {
    let item = startUpload(approve(fresh()));
    item = failUpload(item, 'offline');
    expect(item.status).toBe('failed');
    expect(item.error).toBe('offline');
    expect(hasUnsavedWork([item])).toBe(true);
    item = retry(item);
    expect(item.status).toBe('approved');
    for (let attempt = item.attempts; attempt < MAX_UPLOAD_ATTEMPTS; attempt += 1) {
      item = failUpload(startUpload(item), 'again');
      item = retry(item);
    }
    expect(item.status).toBe('failed');
  });

  it('finishing an upload clears the unsaved warning', () => {
    const uploaded = finishUpload(startUpload(approve(fresh())), uuid(99));
    expect(uploaded.status).toBe('uploaded');
    expect(uploaded.captureId).toBe(uuid(99));
    expect(hasUnsavedWork([uploaded])).toBe(false);
    expect(queueSummary([uploaded, fresh()])).toMatchObject({ uploaded: 1, waiting: 1 });
  });

  it('pending approvals are not "unsaved work" (nothing was approved)', () => {
    expect(hasUnsavedWork([fresh()])).toBe(false);
  });
});

describe('gallery filters', () => {
  const nodes = [
    { id: 'a', parentId: null, name: 'בניין א', code: null },
    { id: 'f3', parentId: 'a', name: 'קומה 3', code: null },
    { id: 'ap12', parentId: 'f3', name: 'דירה 12', code: 'D12' },
    { id: 'b', parentId: null, name: 'בניין ב', code: null },
  ];

  it('subtree includes descendants only', () => {
    expect(subtreeIds(nodes, 'a').sort()).toEqual(['a', 'ap12', 'f3']);
    expect(subtreeIds(nodes, 'b')).toEqual(['b']);
  });

  it('text finds a location by name or code including its sub-locations', () => {
    expect(locationIdsMatchingText(nodes, 'קומה 3').sort()).toEqual(['ap12', 'f3']);
    expect(locationIdsMatchingText(nodes, 'd12')).toEqual(['ap12']);
    expect(locationIdsMatchingText(nodes, '  ')).toEqual([]);
  });

  it('text finds infrastructure types by Hebrew label', () => {
    expect(infraTypesMatchingText('חשמל')).toEqual(['electrical']);
    expect(infraTypesMatchingText('')).toEqual([]);
  });

  it('LIKE wildcards in user text are escaped', () => {
    expect(escapeLikePattern('50%_a\\b')).toBe('50\\%\\_a\\\\b');
  });

  it('date filters are inclusive of the last day', () => {
    const { from, toExclusive } = dayRange('2026-10-01', '2026-10-31');
    expect(from?.toISOString()).toBe('2026-10-01T00:00:00.000Z');
    expect(toExclusive?.toISOString()).toBe('2026-11-01T00:00:00.000Z');
    expect(dayRange(null, null)).toEqual({ from: null, toExclusive: null });
  });

  it('keyset cursor round-trips and rejects junk', () => {
    const date = new Date('2026-10-05T10:00:00.000Z');
    const id = uuid(5);
    expect(decodeCursor(encodeCursor(date, id))).toEqual({ capturedAt: date, id });
    expect(decodeCursor('nonsense')).toBeNull();
    expect(decodeCursor(null)).toBeNull();
  });

  it('builds a path label and survives cycles', () => {
    const options: InfraLocationOption[] = nodes.map((node, index) => ({
      ...node,
      type: 'area',
      sortOrder: index,
      isActive: true,
      archived: false,
    }));
    expect(locationLabel(options, 'ap12')).toBe('בניין א › קומה 3 › דירה 12');
    const cyclic: InfraLocationOption[] = [
      { id: 'x', parentId: 'y', name: 'X', code: null, type: 'area', sortOrder: 0, isActive: true, archived: false },
      { id: 'y', parentId: 'x', name: 'Y', code: null, type: 'area', sortOrder: 0, isActive: true, archived: false },
    ];
    expect(locationLabel(cyclic, 'x')).toBe('Y › X');
  });
});

describe('cloud folder naming', () => {
  it('removes characters the providers reject', () => {
    expect(sanitizeInfraFolderName('קומה 3/דירה: 12?')).toBe('קומה 3-דירה- 12-');
    expect(sanitizeInfraFolderName('  ...  ')).toBe('מיקום');
  });

  it('adds the code only when it is not already in the name', () => {
    expect(infraFolderNameForLocation({ name: 'דירה 12', code: 'D12' })).toBe('D12 - דירה 12');
    expect(infraFolderNameForLocation({ name: 'דירה D12', code: 'd12' })).toBe('דירה D12');
  });

  it('keeps sibling folders unique', () => {
    expect(uniqueFolderName('קומה 1', new Set())).toBe('קומה 1');
    expect(uniqueFolderName('קומה 1', new Set(['קומה 1']))).toBe('קומה 1 (2)');
    expect(uniqueFolderName('קומה 1', new Set(['קומה 1', 'קומה 1 (2)']))).toBe('קומה 1 (3)');
  });

  it('derives stable file names without personal data', () => {
    const name = infraPhotoFileName({ capturedAt: new Date('2026-10-05T10:11:12.345Z'), clientCaptureId: uuid(7), extension: '.JPG' });
    expect(name).toBe('infra-20261005T101112Z-00000000.jpg');
    expect(annotatedFileName('infra-x.heic', 2)).toBe('infra-x-marked-v2.jpg');
    expect(comparisonSidecarName(uuid(3))).toBe('comparison-00000000.json');
  });
});

describe('markings', () => {
  it('validates point counts per kind', () => {
    expect(markingInputSchema.safeParse({ kind: 'arrow', points: [[0, 0], [1, 1]] }).success).toBe(true);
    expect(markingInputSchema.safeParse({ kind: 'arrow', points: [[0, 0]] }).success).toBe(false);
    expect(markingInputSchema.safeParse({ kind: 'point', points: [[0.5, 0.5]] }).success).toBe(true);
    expect(markingInputSchema.safeParse({ kind: 'text', points: [[0.5, 0.5]] }).success).toBe(false);
    expect(markingInputSchema.safeParse({ kind: 'text', points: [[0.5, 0.5]], label: 'צינור' }).success).toBe(true);
  });

  it('rejects out-of-range coordinates and bad colors', () => {
    expect(markingInputSchema.safeParse({ kind: 'point', points: [[1.2, 0]] }).success).toBe(false);
    expect(markingInputSchema.safeParse({ kind: 'point', points: [[0, 0]], color: 'red' }).success).toBe(false);
  });

  it('normalises pointer coordinates and bounds freehand strokes', () => {
    expect(toUnitPoint(50, 25, 100, 100)).toEqual([0.5, 0.25]);
    expect(toUnitPoint(500, -5, 100, 100)).toEqual([1, 0]);
    const stroke = Array.from({ length: 1000 }, (_, i) => [i / 999, 0.5] as [number, number]);
    const simplified = simplifyStroke(stroke);
    expect(simplified.length).toBeLessThanOrEqual(240);
    expect(simplified[0]).toEqual([0, 0.5]);
    expect(simplified[simplified.length - 1]).toEqual([1, 0.5]);
  });

  it('reads stored geometry defensively', () => {
    expect(readMarkingGeometry({ points: [[0.1, 0.2], [2, -1]] })).toEqual([[0.1, 0.2], [1, 0]]);
    expect(readMarkingGeometry({ points: [[0.1]] })).toBeNull();
    expect(readMarkingGeometry(null)).toBeNull();
  });
});

describe('alignment record (reopen data)', () => {
  const pins = [[0.1, 0.1], [0.9, 0.1], [0.9, 0.9], [0.1, 0.9]];
  const record = { version: 1, kind: 'similarity', beforePins: pins, afterPins: pins, opacity: 0.5 };

  it('accepts exactly four + four pins', () => {
    expect(parseAlignmentRecord(record)).not.toBeNull();
    expect(parseAlignmentRecord({ ...record, beforePins: pins.slice(0, 3) })).toBeNull();
    expect(parseAlignmentRecord({ ...record, afterPins: [...pins, [0.5, 0.5]] })).toBeNull();
  });

  it('rejects out-of-range pins and unknown versions', () => {
    expect(parseAlignmentRecord({ ...record, beforePins: [[2, 0], ...pins.slice(1)] })).toBeNull();
    expect(parseAlignmentRecord({ ...record, version: 2 })).toBeNull();
  });

  it('scales a stored adjustment to another stage size', () => {
    const parsed = parseAlignmentRecord({ ...record, adjust: { tx: 10, ty: 20, scale: 1, rotation: 0 }, stage: { w: 100, h: 200 } })!;
    expect(scaleAdjustToStage(parsed, { w: 200, h: 400 })).toEqual({ tx: 20, ty: 40, scale: 1, rotation: 0 });
    expect(scaleAdjustToStage({ ...parsed, adjust: null }, { w: 1, h: 1 })).toBeNull();
  });
});

describe('request validation', () => {
  const base = {
    projectId: uuid(1),
    locationId: uuid(2),
    clientCaptureId: uuid(3),
    file: { fileName: 'a.jpg', mimeType: 'image/jpeg', sizeBytes: 100 },
  };

  it('a capture needs only a location (details are optional)', () => {
    const parsed = beginCaptureSchema.parse(base);
    expect(parsed.details.description).toBeNull();
    expect(parsed.details.role).toBe('documentation');
    expect(parsed.source).toBe('camera');
    expect(() => beginCaptureSchema.parse({ ...base, locationId: undefined })).toThrow();
  });

  it('empty strings become NULL, never ""', () => {
    const parsed = beginCaptureSchema.parse({ ...base, details: { description: '   ', room: '', wall: ' א ', role: 'reference' } });
    expect(parsed.details.description).toBeNull();
    expect(parsed.details.room).toBeNull();
    expect(parsed.details.wall).toBe('א');
  });

  it('rejects an unknown infrastructure type', () => {
    expect(() => beginCaptureSchema.parse({ ...base, details: { infraType: 'laser' } })).toThrow();
  });

  it('update can change details and location independently', () => {
    const parsed = updateCaptureSchema.parse({ captureId: uuid(4), details: { room: 'מטבח' } });
    expect(parsed.details.room).toBe('מטבח');
    expect(parsed.locationId).toBeUndefined();
  });

  it('list filters have bounded page size and defaults', () => {
    const parsed = listCapturesSchema.parse({ projectId: uuid(1) });
    expect(parsed.limit).toBe(30);
    expect(parsed.includeSubLocations).toBe(true);
    expect(() => listCapturesSchema.parse({ projectId: uuid(1), limit: 500 })).toThrow();
  });

  it('a comparison save must contain something the user chose to keep', () => {
    const alignment = {
      version: 1,
      kind: 'similarity',
      beforePins: [[0, 0], [1, 0], [1, 1], [0, 1]],
      afterPins: [[0, 0], [1, 0], [1, 1], [0, 1]],
    };
    const common = { projectId: uuid(1), locationId: uuid(2), clientComparisonId: uuid(6), mode: 'two_photos', alignment };
    expect(() => beginComparisonSchema.parse({ ...common, files: {} })).toThrow();
    expect(() => beginComparisonSchema.parse({ ...common, beforeCaptureId: uuid(8) })).not.toThrow();
    expect(() =>
      beginComparisonSchema.parse({ ...common, files: { result: { fileName: 'r.jpg', mimeType: 'image/jpeg', sizeBytes: 5 } } }),
    ).not.toThrow();
  });
});

describe('database-pending detection (migration 0195 not applied yet)', () => {
  it('recognises a missing infra table, also through wrapped causes', () => {
    expect(isMissingInfraSchema(new Error('relation "infra_captures" does not exist'))).toBe(true);
    expect(isMissingInfraSchema({ message: 'wrapper', cause: { message: 'relation "public.infra_comparisons" does not exist' } })).toBe(true);
    expect(isMissingInfraSchema({ code: '42P01', message: 'missing infra_markings' })).toBe(true);
  });

  it('does not mask unrelated errors', () => {
    expect(isMissingInfraSchema(new Error('relation "invoices" does not exist'))).toBe(false);
    expect(isMissingInfraSchema(null)).toBe(false);
    expect(INFRA_DB_PENDING_MESSAGE).toContain('ממתין להפעלת מסד נתונים');
  });
});
