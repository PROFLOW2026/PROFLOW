import http from 'node:http';
import type { AddressInfo } from 'node:net';
import type { DbExecutor } from '@/shared/db/types';
import {
  handleWorkerArtifact,
  handleWorkerFile,
  handleWorkerProgress,
  handleWorkerResult,
  setTakeoffRouteAdminDbForTests,
} from '@/modules/electrical-takeoff/routes';

async function readBody(req: http.IncomingMessage): Promise<Uint8Array> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return new Uint8Array(Buffer.concat(chunks));
}

async function dispatchTakeoffWorkerRoute(request: Request, pathname: string): Promise<Response> {
  const file = pathname.match(/^\/api\/takeoff\/worker\/file\/([^/]+)\/([^/]+)\/?$/);
  if (file) return handleWorkerFile(request, file[1]!, file[2]!);
  const progress = pathname.match(/^\/api\/takeoff\/worker\/progress\/([^/]+)\/?$/);
  if (progress) return handleWorkerProgress(request, progress[1]!);
  const result = pathname.match(/^\/api\/takeoff\/worker\/result\/([^/]+)\/?$/);
  if (result) return handleWorkerResult(request, result[1]!);
  const artifact = pathname.match(/^\/api\/takeoff\/worker\/artifact\/([^/]+)\/?$/);
  if (artifact) return handleWorkerArtifact(request, artifact[1]!);
  return new Response('not found', { status: 404 });
}

/** Minimal HTTP stub so a local Python worker can POST callbacks and download sources (PGlite tests). */
export async function startTakeoffCallbackServer(adminDb: DbExecutor, preferredPort = 0): Promise<{ port: number; close: () => Promise<void> }> {
  setTakeoffRouteAdminDbForTests(adminDb);
  const server = http.createServer(async (req, res) => {
    try {
      const host = req.headers.host ?? '127.0.0.1';
      const url = new URL(req.url ?? '/', `http://${host}`);
      const body = req.method === 'GET' || req.method === 'HEAD' ? undefined : await readBody(req);
      const headers = new Headers();
      for (const [k, v] of Object.entries(req.headers)) {
        if (v === undefined) continue;
        if (Array.isArray(v)) v.forEach((item) => headers.append(k, item));
        else headers.set(k, v);
      }
      const request = new Request(url, {
        method: req.method ?? 'GET',
        headers,
        body: body && body.length > 0 ? Buffer.from(body) : undefined,
      });
      const response = await dispatchTakeoffWorkerRoute(request, url.pathname);
      res.statusCode = response.status;
      response.headers.forEach((value, key) => {
        if (key.toLowerCase() === 'transfer-encoding') return;
        res.setHeader(key, value);
      });
      const bytes = new Uint8Array(await response.arrayBuffer());
      res.end(Buffer.from(bytes));
    } catch (error) {
      res.statusCode = 500;
      res.end(String(error));
    }
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(preferredPort, '127.0.0.1', () => resolve());
  });
  const port = (server.address() as AddressInfo).port;
  return {
    port,
    close: () =>
      new Promise((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}