/**
 * Node probe: load each pf-cad WASM tree, parse real DWG hosts, print report.xrefs.
 * Usage: node scripts/xref-wasm-probe.mjs [--json out.json]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const ENGINES = [
  { id: 'viewer-v1-frozen', dir: 'public/pf-cad/v1/wasm', tree: 'pf-cad-v1 (WASM קפוא)' },
  { id: 'viewer-v2', dir: 'public/pf-cad/v2/wasm', tree: 'pf-cad (v2)' },
  { id: 'viewer-v3', dir: 'public/pf-cad/v3/wasm', tree: 'pf-cad-v3 (v3)' },
];

const HOSTS = [
  {
    id: '3643-EL',
    host: 'C:/Users/ERAN YOSEF/OneDrive/ProjectFlow/3643-EL - Standard/3643-EL.dwg',
    expectPathContains: ['02.06.26', '15.06.26'],
  },
  {
    id: '1545-all-01',
    host: 'C:/Users/ERAN YOSEF/OneDrive/ProjectFlow/פרויקטים/PRJ-00001 - ברנדייס 6 תל אביב/05 - תוכניות/1545-all-01 - Bitzua/1545-all-01.dwg',
    expectPathContains: [],
  },
  {
    id: '7155-A1',
    host: 'C:/Users/ERAN YOSEF/OneDrive/ProjectFlow/7155-A1 - Standard/7155-A1.dwg',
    expectPathContains: [],
  },
  {
    id: '3096-EL-extra',
    host: 'C:/Users/ERAN YOSEF/Desktop/final projects/cad-xref-test-fixtures/3096-EL/3096-EL.dwg',
    expectPathContains: [],
  },
];

function normalizeCadPath(p) {
  let s = p.trim().replace(/\\/g, '/');
  while (s.includes('//')) s = s.replace('//', '/');
  return s.toLowerCase().replace(/^\.\/+/, '');
}

function basenameKey(p) {
  const parts = p.split('/');
  return (parts[parts.length - 1] ?? p).toLowerCase();
}

function resolveXrefPath(hostPath, xrefPath) {
  let s = xrefPath.trim().replace(/\\/g, '/');
  while (s.includes('//')) s = s.replace('//', '/');
  const lower = s.toLowerCase();
  if (lower.length >= 2 && lower.charCodeAt(1) === 58) return lower;
  if (lower.startsWith('/')) return lower;
  const hostNorm = normalizeCadPath(hostPath);
  const hostDir = hostNorm.includes('/') ? hostNorm.slice(0, hostNorm.lastIndexOf('/')) : '';
  const rel = lower.replace(/^\.\/+/, '');
  if (!hostDir) return rel;
  return `${hostDir}/${rel}`;
}

function collectDwgs(dir, out, depth = 0) {
  if (depth > 8 || !fs.existsSync(dir)) return;
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    let st;
    try {
      st = fs.statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) collectDwgs(full, out, depth + 1);
    else if (name.toLowerCase().endsWith('.dwg')) out.push(full);
  }
}

function buildBasenameIndex(files) {
  const byBasenameLower = new Map();
  for (const file of files) {
    const rel = path.basename(file);
    const key = basenameKey(normalizeCadPath(rel));
    const list = byBasenameLower.get(key);
    if (list) list.push(file);
    else byBasenameLower.set(key, [file]);
  }
  return byBasenameLower;
}

function cadStem(name) {
  const key = name.toLowerCase();
  return key.endsWith('.dwg') ? key.slice(0, -4) : key;
}

function sameCadName(a, b) {
  const na = a.toLowerCase();
  const nb = b.toLowerCase();
  if (na === nb) return true;
  return cadStem(na) === cadStem(nb) && cadStem(na).length > 0;
}

/** Stage-2 fallback when WASM paths are empty (frozen v1): subtree basename match. */
function nameSearchFallback(hostFile, xrefsReport) {
  const hostDir = path.dirname(hostFile);
  const dwgs = [];
  collectDwgs(hostDir, dwgs);
  const resolved = {};
  for (const [block, savedPath] of Object.entries(xrefsReport ?? {})) {
    const xrefPath = (savedPath && String(savedPath).trim()) || block;
    const savedHasFolder = xrefPath.replace(/\\/g, '/').split('/').filter((p) => p && p !== '.').length > 1;
    let hit = null;
    let status = 'not_found';
    if (savedHasFolder) {
      status = 'needs_server_walk';
    } else {
      const names = [xrefPath, block, `${block}.dwg`];
      const hits = [];
      for (const f of dwgs) {
        const base = path.basename(f);
        if (names.some((n) => sameCadName(base, n))) hits.push(f);
      }
      const uniq = [...new Map(hits.map((h) => [h, h])).values()];
      if (uniq.length === 1) {
        hit = uniq[0];
        status = 'found';
      } else if (uniq.length > 1) status = 'ambiguous';
    }
    resolved[block] = {
      xrefPath,
      status,
      hit: hit ? path.relative(hostDir, hit).replace(/\\/g, '/') : null,
    };
  }
  return resolved;
}

async function loadWasm(wasmDir) {
  const abs = path.join(root, wasmDir);
  const glue = await import(pathToFileURL(path.join(abs, 'pf_cad_wasm.js')).href);
  const wasmBytes = fs.readFileSync(path.join(abs, 'pf_cad_wasm_bg.wasm'));
  const sha256 = createHash('sha256').update(wasmBytes).digest('hex').slice(0, 12);
  let version = null;
  try {
    version = JSON.parse(fs.readFileSync(path.join(abs, 'version.json'), 'utf8'));
  } catch {
    /* ignore */
  }
  const api = glue.initSync
    ? glue.initSync({ module: wasmBytes })
    : await glue.default({ module_or_path: wasmBytes });
  return { api, sha256, version };
}

function probeHost(api, hostFile) {
  const put = (bytes) => {
    const p = api.alloc(bytes.length);
    new Uint8Array(api.memory.buffer, p, bytes.length).set(bytes);
    return p;
  };
  const putStr = (s) => {
    const b = new TextEncoder().encode(s);
    return [put(b), b.length];
  };
  api.clear_xref_deps?.();
  const hostDir = path.dirname(hostFile).replace(/\\/g, '/');
  api.set_host_path?.(...putStr(hostDir));
  api.set_space?.(...putStr(''));
  const data = fs.readFileSync(hostFile);
  const rc = api.build_dl(put(data), data.length);
  const json = JSON.parse(
    new TextDecoder().decode(new Uint8Array(api.memory.buffer, api.json_ptr(), api.json_len())),
  );
  return { rc, xrefs: json.report?.xrefs ?? {}, error: json.error ?? null, segCount: rc / 6 };
}

const results = [];

for (const engine of ENGINES) {
  const { api, sha256, version } = await loadWasm(engine.dir);
  const engineRow = { engine: engine.id, tree: engine.tree, wasmSha256_12: sha256, version, hosts: [] };

  for (const job of HOSTS) {
    if (!fs.existsSync(job.host)) {
      engineRow.hosts.push({ id: job.id, status: 'MISSING_FILE', path: job.host });
      continue;
    }
    const { xrefs, error, segCount } = probeHost(api, job.host);
    const paths = Object.entries(xrefs).map(([k, v]) => ({ block: k, path: String(v ?? '') }));
    const nonEmpty = paths.filter((p) => p.path.trim().length > 0);
    let expectOk = true;
    if (job.expectPathContains.length) {
      const blob = JSON.stringify(xrefs);
      expectOk = job.expectPathContains.every((needle) => blob.includes(needle));
    }
    const fallback =
      engine.id === 'viewer-v1-frozen' ? nameSearchFallback(job.host, xrefs) : null;
    let fallback3643Pass = null;
    if (engine.id === 'viewer-v1-frozen' && job.id === '3643-EL' && fallback) {
      const blob = JSON.stringify(fallback);
      fallback3643Pass = blob.includes('02.06.26') && blob.includes('15.06.26');
    }
    engineRow.hosts.push({
      id: job.id,
      hostFile: job.host,
      error,
      segCount,
      xrefs: paths,
      nonEmptyPathCount: nonEmpty.length,
      expectPathContainsPass: job.expectPathContains.length ? expectOk : null,
      nameSearchFallback: fallback,
      fallback3643SubtreePass: fallback3643Pass,
    });
  }
  results.push(engineRow);
}

const outPath = process.argv.includes('--json')
  ? process.argv[process.argv.indexOf('--json') + 1]
  : null;

const summary = {
  ranAt: new Date().toISOString(),
  results,
};

if (outPath) {
  fs.writeFileSync(path.resolve(outPath), JSON.stringify(summary, null, 2), 'utf8');
  console.log('wrote', outPath);
}

for (const row of results) {
  console.log('\n===', row.tree, row.engine, 'wasm', row.wasmSha256_12, 'commit', row.version?.engineCommitSha ?? '?');
  for (const h of row.hosts) {
    console.log('---', h.id, h.status ?? 'ok');
    if (h.xrefs) {
      for (const x of h.xrefs) console.log('   xref', x.block, '=>', x.path || '(empty)');
      if (h.expectPathContainsPass != null) {
        console.log('   3643 folder needles:', h.expectPathContainsPass ? 'PASS' : 'FAIL');
      }
      console.log('   nonEmptyPathCount:', h.nonEmptyPathCount);
    }
    if (h.nameSearchFallback) {
      console.log('   nameSearchFallback:', JSON.stringify(h.nameSearchFallback, null, 0));
      if (h.fallback3643SubtreePass != null) {
        console.log('   v1 subtree 02.06.26+15.06.26:', h.fallback3643SubtreePass ? 'PASS' : 'FAIL');
      }
    }
    if (h.error) console.log('   error:', h.error);
  }
}

process.exit(
  results.some(
    (r) =>
      r.engine !== 'viewer-v1-frozen' && r.hosts.some((h) => h.expectPathContainsPass === false),
  )
    ? 2
    : 0,
);