import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const engineRoot =
  process.env.PF_CAD_ENGINE_ROOT ??
  path.resolve(root, '..', '..', 'projectflow-cad-engine');
const sourceDir = path.join(engineRoot, 'apps', 'viewer', 'public', 'wasm');
const targetDir = path.join(root, 'public', 'pf-cad', 'wasm');
const manifestPath = path.join(targetDir, 'version.json');

const files = [
  'pf_cad_wasm.js',
  'pf_cad_wasm.d.ts',
  'pf_cad_wasm_bg.wasm',
  'pf_cad_wasm_bg.wasm.d.ts',
];

const wasmPath = path.join(targetDir, 'pf_cad_wasm_bg.wasm');
const hasCommittedWasm =
  fs.existsSync(wasmPath) && fs.statSync(wasmPath).size >= 1_000_000;

if (!fs.existsSync(sourceDir)) {
  if (hasCommittedWasm) {
    console.log(
      `[copy-pf-cad-wasm] engine source missing; using committed ${path.relative(root, wasmPath)}`,
    );
    process.exit(0);
  }
  console.error(`[copy-pf-cad-wasm] missing source dir ${sourceDir} and no committed wasm`);
  process.exit(1);
}

fs.mkdirSync(targetDir, { recursive: true });

for (const name of files) {
  const source = path.join(sourceDir, name);
  const target = path.join(targetDir, name);
  if (!fs.existsSync(source)) {
    console.error(`[copy-pf-cad-wasm] missing ${source}`);
    process.exit(1);
  }
  fs.copyFileSync(source, target);
  const size = fs.statSync(target).size;
  console.log(`[copy-pf-cad-wasm] ${name} -> ${path.relative(root, target)} (${size} bytes)`);
}

const wasmSize = fs.statSync(wasmPath).size;
if (wasmSize < 1_000_000) {
  console.error(`[copy-pf-cad-wasm] wasm too small (${wasmSize} bytes)`);
  process.exit(1);
}

const enginePkgPath = path.join(engineRoot, 'package.json');
let engineVersion = 'unknown';
if (fs.existsSync(enginePkgPath)) {
  engineVersion = JSON.parse(fs.readFileSync(enginePkgPath, 'utf8')).version ?? engineVersion;
}

fs.writeFileSync(
  manifestPath,
  `${JSON.stringify(
    {
      engine: 'projectflow-cad-engine',
      engineVersion,
      wasm: 'pf_cad_wasm_bg.wasm',
      glue: 'pf_cad_wasm.js',
    },
    null,
    2,
  )}\n`,
);

console.log(`[copy-pf-cad-wasm] manifest -> ${path.relative(root, manifestPath)}`);
