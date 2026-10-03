import 'server-only';

import { DomainRuleError, apiRouteErrorFromUnknown } from '@/shared/errors';
import type { OpenedFile } from './application/file-store';

/** Reads a raw upload body, refusing anything beyond `maxBytes` without buffering it all first. */
export async function readRequestBytes(request: Request, maxBytes: number): Promise<Uint8Array> {
  const declared = Number(request.headers.get('content-length') ?? '0');
  if (declared > maxBytes) {
    throw new DomainRuleError('Upload too large', 'projectPlans.evidence.errors.tooLarge');
  }
  if (!request.body) throw new DomainRuleError('Empty upload', 'projectPlans.evidence.errors.empty');
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      throw new DomainRuleError('Upload too large', 'projectPlans.evidence.errors.tooLarge');
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

/** Inline for previewable media, attachment otherwise; RFC 5987 filename for Hebrew names. */
export function fileResponse(file: OpenedFile & { readonly fileName: string }, inline: boolean): Response {
  const headers = new Headers({
    'Content-Type': file.mimeType,
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
    'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(file.fileName)}`,
    'Accept-Ranges': 'bytes',
  });
  if (file.sizeBytes != null && file.httpStatus !== 206) headers.set('Content-Length', String(file.sizeBytes));
  if (file.contentRange) headers.set('Content-Range', file.contentRange);
  return new Response(file.stream, { status: file.httpStatus, headers });
}

export function fileRouteError(error: unknown): Response {
  return apiRouteErrorFromUnknown(error, 'externalStorage.errors.operationFailed');
}
