import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = path.resolve(import.meta.dirname, '../..');
const GLOBALS_CSS_PATH = path.join(REPO_ROOT, 'src/app/globals.css');
const SOURCE_ROOT = path.join(REPO_ROOT, 'src');

const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.css']);
const TOKEN_REFERENCE_PATTERN = /var\(\s*(--pf-[a-z0-9-]+)\s*(?:,[^)]*)?\)/gi;
const TOKEN_DECLARATION_PATTERN = /--pf-[a-z0-9-]+(?=\s*:)/gi;

function walkSourceFiles(directory: string): string[] {
  const entries = fs.readdirSync(directory, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkSourceFiles(absolutePath));
      continue;
    }

    if (SOURCE_EXTENSIONS.has(path.extname(entry.name))) {
      files.push(absolutePath);
    }
  }

  return files;
}

function collectDeclaredTokens(css: string): Set<string> {
  const declared = new Set<string>();
  for (const match of css.matchAll(TOKEN_DECLARATION_PATTERN)) {
    declared.add(match[0]);
  }
  return declared;
}

function collectTokenReferences(source: string): string[] {
  const references: string[] = [];
  for (const match of source.matchAll(TOKEN_REFERENCE_PATTERN)) {
    references.push(match[1]!);
  }
  return references;
}

describe('design tokens', () => {
  it('declares every --pf-* token referenced in src/', () => {
    const globalsCss = fs.readFileSync(GLOBALS_CSS_PATH, 'utf8');
    const declaredTokens = collectDeclaredTokens(globalsCss);
    const violations: string[] = [];

    for (const filePath of walkSourceFiles(SOURCE_ROOT)) {
      if (filePath === GLOBALS_CSS_PATH) continue;

      const source = fs.readFileSync(filePath, 'utf8');
      const relativePath = path.relative(REPO_ROOT, filePath).replaceAll('\\', '/');

      for (const token of collectTokenReferences(source)) {
        if (!declaredTokens.has(token)) {
          violations.push(`${relativePath}: undefined token ${token}`);
        }
      }
    }

    expect(violations, violations.join('\n')).toEqual([]);
  });
});
