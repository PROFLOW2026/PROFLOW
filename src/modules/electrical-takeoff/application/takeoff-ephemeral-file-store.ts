import 'server-only';

import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream, promises as fs } from 'node:fs';
import { mkdir, rm, stat, open, readFile } from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';

import { takeoffNotFound } from '../domain/errors';
import type { TakeoffFileStore } from '../ports';

function rootDir(): string {
  const base = process.env.TAKEOFF_EPHEMERAL_DIR?.trim() || path.join(process.env.TEMP ?? '/tmp', 'projectflow-takeoff');
  return base;
}

function orgDir(organizationId: string): string {
  return path.join(rootDir(), organizationId);
}

function filePath(organizationId: string, fileId: string): string {
  return path.join(orgDir(organizationId), `${fileId}.bin`);
}

function metaPath(organizationId: string, fileId: string): string {
  return path.join(orgDir(organizationId), `${fileId}.meta.json`);
}

type FileMeta = {
  mimeType: string;
  fileName: string;
  projectId: string;
  totalBytes: number;
  sha256: string;
};

async function writeMeta(organizationId: string, fileId: string, meta: FileMeta): Promise<void> {
  await fs.writeFile(metaPath(organizationId, fileId), JSON.stringify(meta), 'utf8');
}

async function readMeta(organizationId: string, fileId: string): Promise<FileMeta> {
  const raw = await readFile(metaPath(organizationId, fileId), 'utf8');
  return JSON.parse(raw) as FileMeta;
}

export async function purgeEphemeralTakeoffBytes(organizationId: string, fileIds: readonly string[]): Promise<void> {
  await Promise.all(
    fileIds.map(async (fileId) => {
      await rm(filePath(organizationId, fileId), { force: true });
      await rm(metaPath(organizationId, fileId), { force: true });
    }),
  );
}

/** Disk-backed store for orgs without connected cloud; bytes never go to provider APIs. */
export function createEphemeralDiskTakeoffFileStore(): TakeoffFileStore {
  return {
    async putChunk(input) {
      const dir = orgDir(input.organizationId);
      await mkdir(dir, { recursive: true });
      const target = filePath(input.organizationId, input.fileId);
      const handle = await open(target, input.offset === 0 ? 'w' : 'r+');
      try {
        await handle.write(input.bytes, 0, input.bytes.length, input.offset);
      } finally {
        await handle.close();
      }
      const nextOffset = input.offset + input.bytes.length;
      return { done: nextOffset >= input.totalBytes, nextOffset, session: `${input.fileId}:${nextOffset}` };
    },

    async finalize(input) {
      const target = filePath(input.organizationId, input.fileId);
      const st = await stat(target);
      const onDisk = await readFile(target);
      const sha256 = createHash('sha256').update(onDisk).digest('hex');
      if (sha256 !== input.sha256) throw new Error('sha mismatch');
      await writeMeta(input.organizationId, input.fileId, {
        mimeType: input.mimeType,
        fileName: input.fileName,
        projectId: input.projectId,
        totalBytes: onDisk.byteLength,
        sha256,
      });
      return {};
    },

    async openReadStream(input) {
      const meta = await readMeta(input.organizationId, input.fileId).catch(() => null);
      const target = filePath(input.organizationId, input.fileId);
      try {
        await stat(target);
      } catch {
        takeoffNotFound();
      }
      const mimeType = meta?.mimeType ?? 'application/octet-stream';
      const st = await stat(target);
      if (!input.rangeHeader) {
        const nodeStream = createReadStream(target);
        const web = Readable.toWeb(nodeStream) as ReadableStream<Uint8Array>;
        return { body: web, contentType: mimeType, contentLength: st.size };
      }
      const m = /bytes=(\d+)-(\d+)?/.exec(input.rangeHeader);
      const start = m ? Number(m[1]) : 0;
      const end = m && m[2] ? Number(m[2]) : st.size - 1;
      const handle = await open(target, 'r');
      const len = end - start + 1;
      const buf = Buffer.alloc(len);
      await handle.read(buf, 0, len, start);
      await handle.close();
      return {
        body: new ReadableStream<Uint8Array>({
          start(c) {
            c.enqueue(buf);
            c.close();
          },
        }),
        contentType: mimeType,
        contentLength: len,
      };
    },

    async putArtifact(input) {
      const dir = orgDir(input.organizationId);
      await mkdir(dir, { recursive: true });
      const key = input.artifactKey.replace(/[^\w.-]+/g, '_');
      const target = path.join(dir, `artifact_${key}.bin`);
      await fs.writeFile(target, input.bytes);
      await writeMeta(input.organizationId, input.artifactKey, {
        mimeType: input.mimeType,
        fileName: input.name,
        projectId: input.projectId,
        totalBytes: input.bytes.length,
        sha256: createHash('sha256').update(input.bytes).digest('hex'),
      });
      return { artifactKey: input.artifactKey };
    },
  };
}

export async function resetEphemeralTakeoffStoreForTests(): Promise<void> {
  await rm(rootDir(), { recursive: true, force: true });
}