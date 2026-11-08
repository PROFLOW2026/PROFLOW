/**
 * In-process OneDrive stand-in for Playwright.
 * Mirrors the integration storage fixture: a connected org can upload and
 * download bytes without live OAuth. Loaded via NODE_OPTIONS from
 * start-app-for-playwright.mjs. Does not change product code.
 */
const DRIVE_ROOT_ID = 'e2e-drive-root';
const PROJECTFLOW_ROOT_ID = 'e2e-projectflow-root';

const nodes = new Map();
let seq = 0;

function addNode(node) {
  nodes.set(node.id, node);
  return node;
}

addNode({ id: DRIVE_ROOT_ID, name: 'root', kind: 'folder', parentId: null });
addNode({
  id: PROJECTFLOW_ROOT_ID,
  name: 'ProjectFlow',
  kind: 'folder',
  parentId: DRIVE_ROOT_ID,
});

function nextId() {
  seq += 1;
  return `e2e-item-${seq}`;
}

function childrenOf(parentId) {
  return [...nodes.values()].filter((node) => node.parentId === parentId);
}

function folderJson(node) {
  return {
    id: node.id,
    name: node.name,
    folder: { childCount: childrenOf(node.id).length },
    parentReference: node.parentId ? { id: node.parentId } : undefined,
    eTag: 'e2e',
  };
}

function fileJson(node) {
  return {
    id: node.id,
    name: node.name,
    size: node.bytes ? node.bytes.byteLength : 0,
    file: { mimeType: node.mimeType || 'application/octet-stream' },
    parentReference: node.parentId ? { id: node.parentId } : undefined,
    eTag: 'e2e',
  };
}

function itemJson(node) {
  return node.kind === 'folder' ? folderJson(node) : fileJson(node);
}

function json(status, body) {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
  });
}

const originalFetch = globalThis.fetch.bind(globalThis);

globalThis.fetch = async function e2eGraphFetch(input, init) {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return originalFetch(input, init);
  }
  if (parsed.hostname !== 'graph.microsoft.com') {
    return originalFetch(input, init);
  }

  const method = (
    init?.method ??
    (typeof input !== 'string' && !(input instanceof URL) ? input.method : 'GET')
  ).toUpperCase();
  const path = decodeURIComponent(parsed.pathname.replace(/^\/v1\.0/, ''));

  if (method === 'GET' && path === '/me/drive/root') {
    return json(200, folderJson(nodes.get(DRIVE_ROOT_ID)));
  }

  const contentPut = path.match(/^\/me\/drive\/items\/([^/]+):\/(.+):\/content$/);
  if (method === 'PUT' && contentPut) {
    const parentId = contentPut[1];
    const name = contentPut[2];
    if (!nodes.has(parentId)) return json(404, { error: { code: 'itemNotFound' } });
    const raw = init?.body ?? (typeof input !== 'string' && !(input instanceof URL) ? input.body : null);
    const bytes = raw ? new Uint8Array(await new Response(raw).arrayBuffer()) : new Uint8Array();
    const headerType =
      (init?.headers && new Headers(init.headers).get('content-type')) ||
      'application/octet-stream';
    const node = addNode({
      id: nextId(),
      name,
      kind: 'file',
      parentId,
      mimeType: headerType,
      bytes,
    });
    return json(201, fileJson(node));
  }

  const contentGet = path.match(/^\/me\/drive\/items\/([^/]+)\/content$/);
  if (method === 'GET' && contentGet) {
    const node = nodes.get(contentGet[1]);
    if (!node || node.kind !== 'file' || !node.bytes) {
      return json(404, { error: { code: 'itemNotFound' } });
    }
    return new Response(node.bytes, {
      status: 200,
      headers: { 'content-type': node.mimeType || 'application/octet-stream' },
    });
  }

  const children = path.match(/^\/me\/drive\/(?:root\/children|items\/([^/]+)\/children)$/);
  if (children) {
    const parentId = path.startsWith('/me/drive/root/') ? DRIVE_ROOT_ID : children[1];
    if (!nodes.has(parentId)) return json(404, { error: { code: 'itemNotFound' } });
    if (method === 'GET') {
      const filter = parsed.searchParams.get('$filter') ?? '';
      const nameMatch = filter.match(/name eq '([^']*)'/);
      let rows = childrenOf(parentId);
      if (nameMatch) rows = rows.filter((node) => node.name === nameMatch[1]);
      return json(200, { value: rows.map(itemJson) });
    }
    if (method === 'POST') {
      const bodyText = typeof init?.body === 'string' ? init.body : '{}';
      const body = JSON.parse(bodyText);
      const node = addNode({
        id: nextId(),
        name: String(body.name ?? 'folder'),
        kind: body.folder ? 'folder' : 'file',
        parentId,
        mimeType: body.file?.mimeType,
      });
      return json(201, itemJson(node));
    }
  }

  const item = path.match(/^\/me\/drive\/items\/([^/]+)$/);
  if (item) {
    const node = nodes.get(item[1]);
    if (method === 'GET') {
      if (!node) return json(404, { error: { code: 'itemNotFound' } });
      return json(200, itemJson(node));
    }
    if (method === 'PATCH') {
      if (!node) return json(404, { error: { code: 'itemNotFound' } });
      const bodyText = typeof init?.body === 'string' ? init.body : '{}';
      const body = JSON.parse(bodyText);
      if (typeof body.name === 'string') node.name = body.name;
      if (body.parentReference?.id) node.parentId = String(body.parentReference.id);
      return json(200, itemJson(node));
    }
    if (method === 'DELETE') {
      nodes.delete(item[1]);
      return new Response(null, { status: 204 });
    }
  }

  return json(404, { error: { code: 'itemNotFound', message: method + ' ' + path } });
};
