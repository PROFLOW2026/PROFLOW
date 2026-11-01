/**
 * Provider-native chunked upload (used so a video never travels in one request to Vercel).
 * fetch is mocked: these tests pin the wire protocol of each provider (chunk headers, completion,
 * resume offsets) but cannot prove live provider behaviour.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { dropboxProvider, parseDropboxCorrectOffset } from '@/modules/external-storage/providers/dropbox';
import { googleDriveProvider, parseGoogleNextOffset } from '@/modules/external-storage/providers/google-drive';
import { oneDriveProvider, parseOneDriveNextOffset } from '@/modules/external-storage/providers/onedrive';
import { boxProvider } from '@/modules/external-storage/providers/box';

const TOKEN = 'access-token';
const CHUNK = 2_621_440;
const TOTAL = CHUNK * 2 + 500;
const bytes = (n: number) => new Uint8Array(n);

interface Call {
  url: string;
  method: string;
  headers: Headers;
  bodyLength: number;
}

function mockFetch(responses: Array<Response | ((call: Call) => Response)>) {
  const calls: Call[] = [];
  const queue = [...responses];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: unknown, init?: RequestInit) => {
      const body = init?.body as Uint8Array | Buffer | string | undefined;
      const call: Call = {
        url: String(url),
        method: init?.method ?? 'GET',
        headers: new Headers(init?.headers),
        bodyLength: body && typeof body !== 'string' ? body.byteLength : typeof body === 'string' ? body.length : 0,
      };
      calls.push(call);
      const next = queue.shift();
      if (!next) throw new Error(`unexpected fetch ${call.method} ${call.url}`);
      return typeof next === 'function' ? next(call) : next;
    }),
  );
  return calls;
}

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('capabilities', () => {
  it('OneDrive, Google Drive and Dropbox take chunked uploads; Box stays single-request only', () => {
    expect(oneDriveProvider.resumableUpload).toBeDefined();
    expect(googleDriveProvider.resumableUpload).toBeDefined();
    expect(dropboxProvider.resumableUpload).toBeDefined();
    expect((boxProvider as { resumableUpload?: unknown }).resumableUpload).toBeUndefined();
  });
});

describe('OneDrive upload session', () => {
  const input = { parentFolderId: 'folder1', fileName: 'infra-video.mp4', mimeType: 'video/mp4', sizeBytes: TOTAL };

  it('creates the session in the target folder and sends aligned chunks with Content-Range', async () => {
    const calls = mockFetch([
      json({ uploadUrl: 'https://upload.example/session-1' }),
      json({ nextExpectedRanges: [`${CHUNK}-`] }, 202),
      json({ nextExpectedRanges: [`${CHUNK * 2}-`] }, 202),
      json({ id: 'file-1', name: 'infra-video.mp4', size: TOTAL, eTag: 'e1', parentReference: { id: 'folder1' }, file: { mimeType: 'video/mp4' } }, 201),
    ]);
    const uploader = oneDriveProvider.resumableUpload;
    const { state } = await uploader.start(TOKEN, input);
    expect(calls[0]!.url).toContain('/items/folder1:/infra-video.mp4:/createUploadSession');
    expect(calls[0]!.headers.get('authorization')).toBe(`Bearer ${TOKEN}`);

    const first = await uploader.putChunk(TOKEN, { ...input, state, totalBytes: TOTAL, offset: 0, bytes: bytes(CHUNK) });
    expect(first).toMatchObject({ kind: 'continue', nextOffset: CHUNK });
    expect(calls[1]!.headers.get('content-range')).toBe(`bytes 0-${CHUNK - 1}/${TOTAL}`);
    // the pre-authenticated session URL must NOT receive our OAuth token
    expect(calls[1]!.headers.get('authorization')).toBeNull();

    const second = await uploader.putChunk(TOKEN, { ...input, state, totalBytes: TOTAL, offset: CHUNK, bytes: bytes(CHUNK) });
    expect(second).toMatchObject({ kind: 'continue', nextOffset: CHUNK * 2 });

    const last = await uploader.putChunk(TOKEN, { ...input, state, totalBytes: TOTAL, offset: CHUNK * 2, bytes: bytes(500) });
    expect(calls[3]!.headers.get('content-range')).toBe(`bytes ${CHUNK * 2}-${TOTAL - 1}/${TOTAL}`);
    expect(last.kind).toBe('complete');
    if (last.kind === 'complete') expect(last.file).toMatchObject({ id: 'file-1', parentId: 'folder1' });
  });

  it('asks the session where it is after a 416 (a chunk that already landed)', async () => {
    const calls = mockFetch([
      new Response('range', { status: 416 }),
      json({ nextExpectedRanges: [`${CHUNK}-${TOTAL - 1}`] }),
    ]);
    const result = await oneDriveProvider.resumableUpload.putChunk(TOKEN, {
      ...input,
      state: JSON.stringify({ uploadUrl: 'https://upload.example/s', rename: false }),
      totalBytes: TOTAL,
      offset: 0,
      bytes: bytes(CHUNK),
    });
    expect(result).toMatchObject({ kind: 'continue', nextOffset: CHUNK });
    expect(calls[1]!.method).toBe('GET');
  });

  it('turns a provider failure into a ProviderHttpError for the caller', async () => {
    mockFetch([new Response('nope', { status: 503 })]);
    await expect(
      oneDriveProvider.resumableUpload.putChunk(TOKEN, {
        ...input,
        state: JSON.stringify({ uploadUrl: 'https://upload.example/s', rename: false }),
        totalBytes: TOTAL,
        offset: 0,
        bytes: bytes(CHUNK),
      }),
    ).rejects.toMatchObject({ status: 503 });
  });

  it('parses the expected-range answer', () => {
    expect(parseOneDriveNextOffset(['26-'])).toBe(26);
    expect(parseOneDriveNextOffset(['26-100'])).toBe(26);
    expect(parseOneDriveNextOffset([])).toBeNull();
    expect(parseOneDriveNextOffset(undefined)).toBeNull();
  });
});

describe('Google Drive resumable upload', () => {
  const input = { parentFolderId: 'parent1', fileName: 'infra-video.webm', mimeType: 'video/webm', sizeBytes: TOTAL };

  it('starts a session in the folder, continues on 308 and completes with the file', async () => {
    const calls = mockFetch([
      new Response(null, { status: 200, headers: { Location: 'https://upload.example/drive-session' } }),
      new Response(null, { status: 308, headers: { Range: `bytes=0-${CHUNK - 1}` } }),
      json({ id: 'g1' }, 200),
      json({ id: 'g1', name: 'infra-video.webm', mimeType: 'video/webm', size: String(TOTAL), parents: ['parent1'] }),
    ]);
    const uploader = googleDriveProvider.resumableUpload;
    const { state } = await uploader.start(TOKEN, input);
    expect(calls[0]!.url).toContain('uploadType=resumable');
    expect(calls[0]!.headers.get('x-upload-content-length')).toBe(String(TOTAL));
    const first = await uploader.putChunk(TOKEN, { ...input, state, totalBytes: TOTAL, offset: 0, bytes: bytes(CHUNK) });
    expect(first).toMatchObject({ kind: 'continue', nextOffset: CHUNK });
    expect(calls[1]!.url).toBe('https://upload.example/drive-session');
    expect(calls[1]!.headers.get('content-range')).toBe(`bytes 0-${CHUNK - 1}/${TOTAL}`);

    const last = await uploader.putChunk(TOKEN, { ...input, state, totalBytes: TOTAL, offset: CHUNK * 2, bytes: bytes(500) });
    expect(last.kind).toBe('complete');
    if (last.kind === 'complete') expect(last.file.id).toBe('g1');
  });

  it('reads the persisted range from the 308 answer', () => {
    expect(parseGoogleNextOffset('bytes=0-42')).toBe(43);
    expect(parseGoogleNextOffset(null)).toBe(0);
  });
});

describe('Dropbox upload session', () => {
  const input = { parentFolderId: 'id:folder', fileName: 'infra-video.mp4', mimeType: 'video/mp4', sizeBytes: TOTAL };
  const argOf = (call: Call) => JSON.parse(call.headers.get('dropbox-api-arg')!) as Record<string, unknown>;

  it('opens the session with the first chunk, appends, then finishes with the commit path', async () => {
    const calls = mockFetch([
      json({ path_lower: '/proj/infra', name: 'infra' }), // resolvePath(folder)
      json({ session_id: 'sess-1' }),
      new Response(null, { status: 200 }),
      json({ '.tag': 'file', id: 'id:file1', name: 'infra-video.mp4', size: TOTAL, rev: 'r1', path_lower: '/proj/infra/infra-video.mp4' }),
    ]);
    const uploader = dropboxProvider.resumableUpload;
    const { state } = await uploader.start(TOKEN, input);
    expect(JSON.parse(state).sessionId).toBeNull();

    const first = await uploader.putChunk(TOKEN, { ...input, state, totalBytes: TOTAL, offset: 0, bytes: bytes(CHUNK) });
    expect(first.kind).toBe('continue');
    if (first.kind !== 'continue') throw new Error('expected continue');
    expect(first.nextOffset).toBe(CHUNK);
    expect(calls[1]!.url).toContain('/files/upload_session/start');
    expect(JSON.parse(first.state).sessionId).toBe('sess-1');

    const second = await uploader.putChunk(TOKEN, { ...input, state: first.state, totalBytes: TOTAL, offset: CHUNK, bytes: bytes(CHUNK) });
    expect(second).toMatchObject({ kind: 'continue', nextOffset: CHUNK * 2 });
    expect(calls[2]!.url).toContain('/files/upload_session/append_v2');
    expect(argOf(calls[2]!)).toMatchObject({ cursor: { session_id: 'sess-1', offset: CHUNK }, close: false });

    const last = await uploader.putChunk(TOKEN, { ...input, state: first.state, totalBytes: TOTAL, offset: CHUNK * 2, bytes: bytes(500) });
    expect(calls[3]!.url).toContain('/files/upload_session/finish');
    expect(argOf(calls[3]!)).toMatchObject({
      cursor: { session_id: 'sess-1', offset: CHUNK * 2 },
      commit: { path: '/proj/infra/infra-video.mp4', mode: 'add', autorename: false },
    });
    expect(last.kind).toBe('complete');
  });

  it('answers with the offset Dropbox holds after an incorrect_offset conflict', async () => {
    mockFetch([json({ error_summary: 'lookup_failed/incorrect_offset/.', error: { '.tag': 'lookup_failed', lookup_failed: { '.tag': 'incorrect_offset', correct_offset: CHUNK * 2 } } }, 409)]);
    const result = await dropboxProvider.resumableUpload.putChunk(TOKEN, {
      ...input,
      state: JSON.stringify({ path: '/p/f.mp4', sessionId: 'sess-1' }),
      totalBytes: TOTAL,
      offset: CHUNK,
      bytes: bytes(CHUNK),
    });
    expect(result).toMatchObject({ kind: 'continue', nextOffset: CHUNK * 2 });
  });

  it('parses the conflict body defensively', () => {
    expect(parseDropboxCorrectOffset('not json')).toBeNull();
    expect(parseDropboxCorrectOffset('{"error":{}}')).toBeNull();
    expect(parseDropboxCorrectOffset('{"error":{"correct_offset":5}}')).toBe(5);
  });
});
