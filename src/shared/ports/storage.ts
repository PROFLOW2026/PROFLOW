import 'server-only';
import { publicEnv } from '@/shared/env/public';
import { serverEnv } from '@/shared/env/server';

/**
 * File storage boundary (docs 71 §9, 74 §7).
 *
 * Object keys are always `{organizationId}/{entityType}/{entityId}/{uuid}-{filename}`.
 * The tenant prefix is not cosmetic: it is what makes a storage policy able to
 * enforce isolation, and it means a leaked key cannot be walked sideways into
 * another organization's files.
 */

export interface StoredObject {
  key: string;
  size: number;
  contentType: string;
}

export interface SignedUrl {
  url: string;
  expiresAt: Date;
}

export interface DownloadedObject {
  bytes: Uint8Array;
  contentType: string;
  size: number;
}

export interface StoragePort {
  readonly configured: boolean;
  buildKey(input: {
    organizationId: string;
    entityType: string;
    entityId: string;
    fileName: string;
  }): string;
  createUploadUrl(key: string, contentType: string): Promise<SignedUrl>;
  createDownloadUrl(key: string, expiresInSeconds?: number): Promise<SignedUrl>;
  /** Server-side byte fetch for OCR and other private processing. */
  downloadBytes(key: string): Promise<DownloadedObject>;
  remove(key: string): Promise<void>;
}

const DEFAULT_DOWNLOAD_TTL_SECONDS = 60 * 5;

/** Strips path separators and control characters so a filename cannot escape its prefix. */
export function sanitizeFileName(fileName: string): string {
  return (
    fileName
      .replace(/[\\/]/g, '-')
       
      .replace(/[\u0000-\u001f\u007f]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 180) || 'file'
  );
}

export function buildStorageKey(input: {
  organizationId: string;
  entityType: string;
  entityId: string;
  fileName: string;
}): string {
  const unique = crypto.randomUUID();
  return `${input.organizationId}/${input.entityType}/${input.entityId}/${unique}-${sanitizeFileName(input.fileName)}`;
}

class UnconfiguredStorageAdapter implements StoragePort {
  readonly configured = false;
  buildKey = buildStorageKey;

  async createUploadUrl(): Promise<SignedUrl> {
    throw new StorageNotConfiguredError();
  }

  async createDownloadUrl(): Promise<SignedUrl> {
    throw new StorageNotConfiguredError();
  }

  async downloadBytes(): Promise<DownloadedObject> {
    throw new StorageNotConfiguredError();
  }

  async remove(): Promise<void> {
    throw new StorageNotConfiguredError();
  }
}

export class StorageNotConfiguredError extends Error {
  constructor() {
    super('File storage is not configured in this environment.');
    this.name = 'StorageNotConfiguredError';
  }
}

class SupabaseStorageAdapter implements StoragePort {
  readonly configured = true;
  buildKey = buildStorageKey;

  constructor(
    private readonly url: string,
    private readonly serviceRoleKey: string,
    private readonly bucket: string,
  ) {}

  private async client() {
    const { createClient } = await import('@supabase/supabase-js');
    return createClient(this.url, this.serviceRoleKey, { auth: { persistSession: false } });
  }

  async createUploadUrl(key: string): Promise<SignedUrl> {
    const supabase = await this.client();
    const { data, error } = await supabase.storage.from(this.bucket).createSignedUploadUrl(key);
    if (error || !data) throw new Error(`Could not create an upload URL: ${error?.message}`);
    return { url: data.signedUrl, expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000) };
  }

  async createDownloadUrl(key: string, expiresInSeconds = DEFAULT_DOWNLOAD_TTL_SECONDS): Promise<SignedUrl> {
    const supabase = await this.client();
    const { data, error } = await supabase.storage
      .from(this.bucket)
      .createSignedUrl(key, expiresInSeconds);
    if (error || !data) throw new Error(`Could not create a download URL: ${error?.message}`);
    return { url: data.signedUrl, expiresAt: new Date(Date.now() + expiresInSeconds * 1000) };
  }

  async downloadBytes(key: string): Promise<DownloadedObject> {
    const supabase = await this.client();
    const { data, error } = await supabase.storage.from(this.bucket).download(key);
    if (error || !data) throw new Error(`Could not download the file: ${error?.message}`);
    const buffer = new Uint8Array(await data.arrayBuffer());
    return {
      bytes: buffer,
      contentType: data.type || 'application/octet-stream',
      size: buffer.length,
    };
  }

  async remove(key: string): Promise<void> {
    const supabase = await this.client();
    const { error } = await supabase.storage.from(this.bucket).remove([key]);
    if (error) throw new Error(`Could not remove the file: ${error.message}`);
  }
}

class E2eHarnessStorageAdapter implements StoragePort {
  readonly configured = true;
  buildKey = buildStorageKey;

  constructor(private readonly baseUrl: string) {}

  private objectUrl(key: string): string {
    return `${this.baseUrl.replace(/\/+$/, '')}/e2e-storage/${encodeURIComponent(key)}`;
  }

  async createUploadUrl(key: string): Promise<SignedUrl> {
    return {
      url: this.objectUrl(key),
      expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000),
    };
  }

  async createDownloadUrl(key: string, expiresInSeconds = DEFAULT_DOWNLOAD_TTL_SECONDS): Promise<SignedUrl> {
    return {
      url: this.objectUrl(key),
      expiresAt: new Date(Date.now() + expiresInSeconds * 1000),
    };
  }

  async downloadBytes(key: string): Promise<DownloadedObject> {
    const response = await fetch(this.objectUrl(key));
    if (!response.ok) throw new Error(`Could not download the file: ${response.status}`);
    const buffer = new Uint8Array(await response.arrayBuffer());
    return {
      bytes: buffer,
      contentType: response.headers.get('content-type') || 'application/octet-stream',
      size: buffer.length,
    };
  }

  async remove(key: string): Promise<void> {
    await fetch(this.objectUrl(key), { method: 'DELETE' });
  }
}

function envTruthy(value: string | undefined): boolean {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return normalized === 'true' || normalized === '1' || normalized === 'yes';
}

let instance: StoragePort | undefined;

export function getStoragePort(): StoragePort {
  if (instance) return instance;

  if (envTruthy(process.env.E2E_INMEMORY_STORAGE)) {
    const baseUrl = publicEnv.NEXT_PUBLIC_SUPABASE_URL;
    if (!baseUrl) {
      throw new Error('E2E_INMEMORY_STORAGE requires NEXT_PUBLIC_SUPABASE_URL (auth harness URL)');
    }
    instance = new E2eHarnessStorageAdapter(baseUrl);
    return instance;
  }

  const env = serverEnv();
  const url = publicEnv.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;
  const bucket = env.SUPABASE_STORAGE_BUCKET;

  instance =
    url && serviceRoleKey
      ? new SupabaseStorageAdapter(url, serviceRoleKey, bucket)
      : new UnconfiguredStorageAdapter();
  return instance;
}

export function setStoragePort(port: StoragePort | undefined): void {
  instance = port;
}
