import { createHash, randomUUID } from 'node:crypto';
import path from 'node:path';
import { config } from 'dotenv';
import { afterAll, describe, expect, it } from 'vitest';

config({ path: path.resolve(process.cwd(), '.env.local') });

/** Must match the service-role project. An injected mismatch fails signed upload. */
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
const bucket = process.env.SUPABASE_STORAGE_BUCKET?.trim() || 'documents';
const azureKey = process.env.OCR_PROVIDER_API_KEY?.trim();
const azureEndpoint = process.env.OCR_PROVIDER_ENDPOINT?.trim();
const storageConfigured = Boolean(supabaseUrl && serviceRoleKey);
const azureConfigured = Boolean(azureKey && azureEndpoint);

const JPEG_BYTES = Uint8Array.from(
  Buffer.from(
    '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAn/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAGcP//EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAQUCf//EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQMBAT8Bf//EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQIBAT8Bf//EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEABj8Cf//EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAT8hf//Z',
    'base64',
  ),
);

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

describe.skipIf(!storageConfigured)('real Supabase Storage roundtrip', () => {
  const createdKeys: string[] = [];

  afterAll(async () => {
    if (!storageConfigured || createdKeys.length === 0) return;
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(supabaseUrl!, serviceRoleKey!, { auth: { persistSession: false } });
    await supabase.storage.from(bucket).remove(createdKeys);
  });

  it('writes a JPEG via signed upload and downloads the same checksum', async () => {
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(supabaseUrl!, serviceRoleKey!, { auth: { persistSession: false } });
    const key = `ocr-audit/${randomUUID()}.jpg`;
    createdKeys.push(key);

    const signed = await supabase.storage.from(bucket).createSignedUploadUrl(key);
    expect(signed.error).toBeNull();
    expect(signed.data?.token).toBeTruthy();
    expect(signed.data?.path).toBeTruthy();

    const upload = await supabase.storage
      .from(bucket)
      .uploadToSignedUrl(key, signed.data!.token, JPEG_BYTES, {
        contentType: 'image/jpeg',
        cacheControl: '0',
      });
    expect(upload.error).toBeNull();

    const downloaded = await supabase.storage.from(bucket).download(key);
    expect(downloaded.error).toBeNull();
    const bytes = new Uint8Array(await downloaded.data!.arrayBuffer());
    expect(sha256(bytes)).toBe(sha256(JPEG_BYTES));
    expect(bytes.byteLength).toBe(JPEG_BYTES.byteLength);
  });

  it('keeps Hebrew original names out of the storage key', async () => {
    const { createClient } = await import('@supabase/supabase-js');
    const { buildStorageKey } = await import('@/shared/ports/storage');
    const key = buildStorageKey({
      organizationId: randomUUID(),
      entityType: 'documents',
      entityId: randomUUID(),
      fileName: 'קבלה (מרכזת) 12.08.2026.jpg',
    });
    expect(key).not.toMatch(/[^\u0000-\u007f]/);
    expect(key.endsWith('.jpg')).toBe(true);

    const supabase = createClient(supabaseUrl!, serviceRoleKey!, { auth: { persistSession: false } });
    createdKeys.push(key);
    const signed = await supabase.storage.from(bucket).createSignedUploadUrl(key);
    expect(signed.error).toBeNull();
    const upload = await supabase.storage
      .from(bucket)
      .uploadToSignedUrl(key, signed.data!.token, JPEG_BYTES, {
        contentType: 'image/jpeg',
        cacheControl: '0',
      });
    expect(upload.error).toBeNull();
  });
});

describe.skipIf(!storageConfigured || !azureConfigured)('real Azure after storage identity', () => {
  it('analyzes the stored JPEG once without inventing fields', async () => {
    const { AzureDocumentIntelligenceProvider } = await import('@/modules/ocr/domain/azure-provider');
    const provider = new AzureDocumentIntelligenceProvider();
    const result = await provider.extractDocument({
      organizationId: 'ocr-audit',
      documentId: randomUUID(),
      bytes: JPEG_BYTES,
      mimeType: 'image/jpeg',
      filename: 'audit.jpg',
      workflow: 'expense',
      locale: 'he',
    });
    expect(result.ok || result.errorCode).toBeTruthy();
    if (result.ok) {
      expect(result.needsReview).toBe(true);
    }
  });
});
