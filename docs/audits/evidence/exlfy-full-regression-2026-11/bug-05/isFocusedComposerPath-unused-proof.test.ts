/**
 * BUG-05: isFocusedComposerPath must be wired so FAB hides on composer routes.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { isFocusedComposerPath } from '@/components/shell/navigation';

const QUICK_CREATE = path.join(process.cwd(), 'src/components/shell/quick-create.tsx');

describe('BUG-05 isFocusedComposerPath wiring', () => {
  it('isFocusedComposerPath matches /new and /edit routes', () => {
    expect(isFocusedComposerPath('/projects/new')).toBe(true);
    expect(isFocusedComposerPath('/expenses/abc/edit')).toBe(true);
    expect(isFocusedComposerPath('/he-IL/billing/payments/new')).toBe(true);
    expect(isFocusedComposerPath('/projects')).toBe(false);
  });

  it('quick-create.tsx imports and calls isFocusedComposerPath to hide FAB', () => {
    const source = readFileSync(QUICK_CREATE, 'utf8');
    expect(source).toContain('isFocusedComposerPath');
    expect(source).toContain('shouldHideQuickCreateForRoute');
    expect(source).toContain('data-pf-quick-create="fab"');
    expect(source).toMatch(
      /isFocusedComposerPath\(pathname\)[\s\S]*shouldHideQuickCreateForRoute|shouldHideQuickCreateForRoute[\s\S]*isFocusedComposerPath\(pathname\)/,
    );
  });
});
