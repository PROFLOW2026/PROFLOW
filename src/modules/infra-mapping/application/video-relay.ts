import type { StoredFile } from '@/modules/evidence';
import type { ResumableUploader } from '@/modules/external-storage/domain/provider-interface';
import { DomainRuleError } from '@/shared/errors';
import { needsChunking } from '../domain/video';
import type { InfraVideoPort, VideoChunkIn } from './videos';

/**
 * Relays video chunks from our (size-limited) serverless requests to the organization's cloud.
 *
 * The provider's own upload session lives in a SEALED token handed back to the browser after each
 * chunk: encrypted and authenticated (the browser can neither read the provider URL inside nor
 * forge it), bound to one evidence file, one user and one size, and short-lived. So the relay needs
 * no table of its own and no OAuth token or provider URL ever reaches the client.
 */

export interface RelayTarget {
  readonly connectionId: string;
  readonly provider: string;
  readonly accessToken: string;
  readonly uploader: ResumableUploader | null;
}

export interface NewRelayTarget extends RelayTarget {
  /** The location folder (or the project's photo folder as a fallback) the file goes into. */
  readonly parentFolderId: string;
}

export interface VideoRelayEnv {
  seal(plaintext: string): string;
  open(sealed: string): string;
  now(): number;
  /** True when the organization's connected provider can take a chunked upload. */
  supportsChunked(organizationId: string): Promise<boolean>;
  /** Small files (<= the single-request limit): one provider call through the regular infra store. */
  putSingle(input: {
    organizationId: string;
    projectId: string;
    locationId: string;
    documentId: string;
    fileName: string;
    mimeType: string;
    bytes: Uint8Array;
  }): Promise<StoredFile>;
  /** First chunk: resolve the connection, the token and the location folder. */
  startTarget(input: { organizationId: string; projectId: string; locationId: string }): Promise<NewRelayTarget>;
  /** Later chunks: only the connection and a fresh token (the folder is in the sealed session). */
  existingTarget(input: { organizationId: string; connectionId: string }): Promise<RelayTarget>;
}

const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

interface SessionPayload {
  readonly v: 1;
  readonly e: string;
  readonly o: string;
  readonly u: string;
  readonly t: number;
  readonly c: string;
  readonly p: string;
  readonly s: string;
  readonly x: number;
}

const SESSION_ERROR = 'infraMapping.errors.videoSession';
const PROVIDER_LIMIT_ERROR = 'infraMapping.errors.videoProviderLimit';

export function createVideoRelay(env: VideoRelayEnv): InfraVideoPort {
  function readSession(input: VideoChunkIn, sealed: string): SessionPayload {
    let payload: SessionPayload;
    try {
      payload = JSON.parse(env.open(sealed)) as SessionPayload;
    } catch {
      throw new DomainRuleError('Invalid upload session', SESSION_ERROR);
    }
    if (
      payload.v !== 1 ||
      payload.e !== input.evidenceId ||
      payload.o !== input.organizationId ||
      payload.u !== input.userId ||
      payload.t !== input.totalBytes ||
      payload.x < env.now()
    ) {
      throw new DomainRuleError('Upload session does not match this file', SESSION_ERROR);
    }
    return payload;
  }

  return {
    async assertCanStore({ organizationId, sizeBytes }) {
      if (!needsChunking(sizeBytes)) return;
      if (!(await env.supportsChunked(organizationId))) {
        throw new DomainRuleError('Provider cannot take a chunked upload', PROVIDER_LIMIT_ERROR);
      }
    },

    async uploadChunk(input) {
      if (!needsChunking(input.totalBytes)) {
        const stored = await env.putSingle({
          organizationId: input.organizationId,
          projectId: input.projectId,
          locationId: input.locationId,
          documentId: input.documentId,
          fileName: input.fileName,
          mimeType: input.mimeType,
          bytes: input.bytes,
        });
        return { kind: 'complete', stored };
      }

      let provider: string;
      let connectionId: string;
      let accessToken: string;
      let uploader: ResumableUploader;
      let parentFolderId: string;
      let state: string;

      if (input.session) {
        const session = readSession(input, input.session);
        const target = await env.existingTarget({ organizationId: input.organizationId, connectionId: session.c });
        if (!target.uploader) throw new DomainRuleError('Provider cannot take a chunked upload', PROVIDER_LIMIT_ERROR);
        ({ provider, connectionId, accessToken, uploader } = { ...target, uploader: target.uploader });
        parentFolderId = session.p;
        state = session.s;
      } else {
        if (input.offset !== 0) throw new DomainRuleError('Upload session missing', SESSION_ERROR);
        const target = await env.startTarget({
          organizationId: input.organizationId,
          projectId: input.projectId,
          locationId: input.locationId,
        });
        if (!target.uploader) throw new DomainRuleError('Provider cannot take a chunked upload', PROVIDER_LIMIT_ERROR);
        ({ provider, connectionId, accessToken, uploader } = { ...target, uploader: target.uploader });
        parentFolderId = target.parentFolderId;
        state = (
          await uploader.start(accessToken, {
            parentFolderId,
            fileName: input.fileName,
            mimeType: input.mimeType,
            sizeBytes: input.totalBytes,
          })
        ).state;
      }

      const outcome = await uploader.putChunk(accessToken, {
        state,
        parentFolderId,
        fileName: input.fileName,
        mimeType: input.mimeType,
        totalBytes: input.totalBytes,
        offset: input.offset,
        bytes: input.bytes,
      });

      if (outcome.kind === 'complete') {
        return {
          kind: 'complete',
          stored: {
            connectionId,
            provider,
            externalFileId: outcome.file.id,
            externalParentFolderId: outcome.file.parentId ?? parentFolderId,
            etag: outcome.file.etag ?? null,
            sizeBytes: outcome.file.sizeBytes ?? input.totalBytes,
            checksum: null,
          },
        };
      }

      const next: SessionPayload = {
        v: 1,
        e: input.evidenceId,
        o: input.organizationId,
        u: input.userId,
        t: input.totalBytes,
        c: connectionId,
        p: parentFolderId,
        s: outcome.state,
        x: env.now() + SESSION_TTL_MS,
      };
      return { kind: 'continue', session: env.seal(JSON.stringify(next)), nextOffset: outcome.nextOffset };
    },
  };
}
