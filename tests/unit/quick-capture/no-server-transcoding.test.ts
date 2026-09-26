import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const QUICK_CAPTURE_ROOT = path.resolve(process.cwd(), 'src/modules/quick-capture');

const FORBIDDEN_PATTERNS = [
  /\bffmpeg\b/i,
  /\btranscod(?:e|ing)\b/i,
  /fluent-ffmpeg/i,
  /@ffmpeg/i,
];

function listSourceFiles(dir: string): string[] {
  const entries = readdirSync(dir);
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry);
    const stats = statSync(fullPath);
    if (stats.isDirectory()) {
      files.push(...listSourceFiles(fullPath));
      continue;
    }
    if (/\.(ts|tsx|js|jsx|mjs)$/.test(entry)) {
      files.push(fullPath);
    }
  }
  return files;
}

describe('Quick Capture has no server-side transcoding', () => {
  it('does not reference ffmpeg or transcoding anywhere in the module', () => {
    const offenders: string[] = [];

    for (const filePath of listSourceFiles(QUICK_CAPTURE_ROOT)) {
      const source = readFileSync(filePath, 'utf8');
      for (const pattern of FORBIDDEN_PATTERNS) {
        if (pattern.test(source)) {
          offenders.push(`${path.relative(process.cwd(), filePath)} (${pattern})`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });
});
