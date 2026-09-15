import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(process.cwd());

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), 'utf8');
}

describe('mobile layout regressions', () => {
  it('places company documents quick access on the locale dashboard home', () => {
    const page = read('src/app/[locale]/page.tsx');
    expect(page).toContain('DashboardQuickAccessBar');
    expect(page).toContain('data-pf-dashboard-home');
  });

  it('prevents app shell flex overflow by constraining the root flex row', () => {
    const shell = read('src/components/shell/app-shell.tsx');
    expect(shell).toMatch(/min-w-0/);
    expect(shell).toMatch(/overflow-x-clip/);
  });

  it('avoids w-screen on the storage preview shell (100vw page overflow)', () => {
    const preview = read('src/modules/external-storage/ui/storage-file-preview-shell.tsx');
    expect(preview).not.toMatch(/\bw-screen\b/);
    expect(preview).toContain('lockBodyScroll');
    expect(preview).toContain("body.style.width = '100%'");
    expect(preview).toContain('window.scrollTo(0, scrollY)');
  });

  it('keeps bottom nav fixed above content with safe-area padding', () => {
    const nav = read('src/components/shell/mobile-nav.tsx');
    expect(nav).toMatch(/z-40/);
    expect(nav).toContain('safe-area-inset-bottom');
    expect(nav).toContain('h-[var(--pf-bottomnav-height)]');
  });

  it('accounts for safe area in mobile main content bottom padding', () => {
    const css = read('src/app/globals.css');
    expect(css).toContain('--pf-bottomnav-total-height');
    expect(css).toContain('--pf-bottomnav-safe-area');
  });
});
