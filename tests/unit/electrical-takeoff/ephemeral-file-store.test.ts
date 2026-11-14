import { createHash } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';

import {
  createEphemeralDiskTakeoffFileStore,
  purgeEphemeralTakeoffBytes,
  resetEphemeralTakeoffStoreForTests,
} from '@/modules/electrical-takeoff/application/takeoff-ephemeral-file-store';

describe('ephemeral disk takeoff file store', () => {
  afterAll(async () => {
    await resetEphemeralTakeoffStoreForTests();
  });

  it('writes chunks and reads back bytes', async () => {
    const store = createEphemeralDiskTakeoffFileStore();
    const orgId = '11111111-1111-4111-8111-111111111111';
    const fileId = '22222222-2222-4222-8222-222222222222';
    const bytes = Buffer.from('%PDF-1.4 ephemeral test');
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    await store.putChunk({
      organizationId: orgId,
      projectId: '33333333-3333-4333-8333-333333333333',
      fileId,
      offset: 0,
      totalBytes: bytes.length,
      bytes: new Uint8Array(bytes),
      session: null,
    });
    await store.finalize({
      organizationId: orgId,
      projectId: '33333333-3333-4333-8333-333333333333',
      fileId,
      fileName: 't.pdf',
      mimeType: 'application/pdf',
      sha256,
      bytes: new Uint8Array(bytes),
    });
    const stream = await store.openReadStream({ organizationId: orgId, fileId, rangeHeader: null });
    const buf = Buffer.from(await new Response(stream.body).arrayBuffer());
    expect(buf.toString('utf8')).toContain('%PDF');
    await purgeEphemeralTakeoffBytes(orgId, [fileId]);
    await expect(store.openReadStream({ organizationId: orgId, fileId, rangeHeader: null })).rejects.toThrow();
  });
});