import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  familyBodyLandmark,
  familyUsesStructuralTemplate,
} from '@/shared/theme/design/route-family';

const ROOT = process.cwd();
const DESIGN_DIR = join(ROOT, 'src', 'shared', 'theme', 'design');
const STYLE_FILES = [
  join(ROOT, 'src', 'shared', 'theme', 'styles', 'design-v9.css'),
  join(ROOT, 'src', 'shared', 'theme', 'styles', 'design-v10.css'),
] as const;

const FORBIDDEN_IMPORT_MODULES = [
  'design-lab',
  'electrical-takeoff',
  'infra-mapping',
  'upload-document-bytes',
  'live-share-view',
  'pdf-js-viewer',
] as const;

function listFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const abs = join(dir, name);
    if (statSync(abs).isDirectory()) listFiles(abs, out);
    else out.push(abs);
  }
  return out;
}

function rel(abs: string): string {
  return relative(ROOT, abs).replaceAll('\\', '/');
}

function hasModuleImport(source: string, moduleName: string): boolean {
  const needle = moduleName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const specifier = String.raw`['"][^'"]*\b${needle}\b`;
  return (
    new RegExp(String.raw`(?:from|import\s*\(|require\s*\(|@import)\s*${specifier}`).test(source) ||
    new RegExp(String.raw`(?:^|[\n;])\s*import\s+${specifier}`).test(source)
  );
}

describe('design engine boundary', () => {
  const designFiles = listFiles(DESIGN_DIR);
  const scannedFiles = [...designFiles, ...STYLE_FILES];

  it('does not import product engines, upload, live-share, or pdf viewers', () => {
    const offenders: string[] = [];
    for (const file of scannedFiles) {
      const source = readFileSync(file, 'utf8');
      for (const moduleName of FORBIDDEN_IMPORT_MODULES) {
        if (hasModuleImport(source, moduleName)) {
          offenders.push(`${rel(file)} imports ${moduleName}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('keeps engine and print off structural templates with no v9/v10 landmarks', () => {
    expect(familyUsesStructuralTemplate('engine')).toBe(false);
    expect(familyUsesStructuralTemplate('print')).toBe(false);
    expect(familyBodyLandmark('engine', 'v9')).toBeUndefined();
    expect(familyBodyLandmark('engine', 'v10')).toBeUndefined();
    expect(familyBodyLandmark('print', 'v9')).toBeUndefined();
    expect(familyBodyLandmark('print', 'v10')).toBeUndefined();
  });

  it('does not call router.refresh from the design layer', () => {
    const offenders = designFiles
      .filter((file) => readFileSync(file, 'utf8').includes('router.refresh'))
      .map(rel);
    expect(offenders).toEqual([]);
  });
});
