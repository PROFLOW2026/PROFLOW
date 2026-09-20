import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(process.cwd(), 'src/app/[locale]/employee');

const FILES = [
  '(shell)/tasks/page.tsx',
  '(shell)/tasks/[taskId]/page.tsx',
  '(shell)/projects/[projectId]/tasks/page.tsx',
  '(shell)/tasks/actions.ts',
  '(shell)/expenses/actions.ts',
];

describe('employee task routing', () => {
  it('does not hardcode duplicated locale prefixes in employee task links', () => {
    for (const file of FILES) {
      const source = readFileSync(join(ROOT, file), 'utf8');
      expect(source).not.toMatch(/\$\{locale\}\/employee/);
      expect(source).not.toMatch(/`\/\$\{locale\}\/employee/);
    }
  });
});
