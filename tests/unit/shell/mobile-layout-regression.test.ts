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

  it('hides dashboard unused-capability tip while preserving settings flow', () => {
    const page = read('src/app/[locale]/page.tsx');
    const flags = read('src/modules/tenancy/domain/dashboard-ui-flags.ts');
    expect(flags).toContain('DASHBOARD_UNUSED_CAPABILITY_TIP_VISIBLE = false');
    expect(page).toContain('DASHBOARD_UNUSED_CAPABILITY_TIP_VISIBLE');
    expect(read('src/app/[locale]/(app)/settings/features/page.tsx')).toContain(
      'UnusedCapabilitySuggestionBanner',
    );
  });

  it('clips horizontal overflow on main content, not the shell root (fixed chrome safe)', () => {
    const shell = read('src/components/shell/app-shell.tsx');
    expect(shell).toMatch(/min-w-0/);
    expect(shell).toMatch(/id="main"[\s\S]*overflow-x-clip/);
    const shellRoot = shell.match(/<div className="([^"]*)" data-pf-shell="app"/)?.[1] ?? '';
    expect(shellRoot).not.toContain('overflow-x-clip');
    expect(shell).toContain('MobileShellViewportSync');
  });

  it('portals mobile nav and tracks visual viewport bottom offset', () => {
    const nav = read('src/components/shell/mobile-nav.tsx');
    expect(nav).toContain('createPortal');
    expect(nav).toContain('--pf-visual-viewport-bottom-offset');
    expect(nav).toMatch(/z-40/);
    expect(nav).not.toMatch(/\binset-x-0\b/);
  });

  it('portals mobile FAB and includes visual viewport offset in bottom calc', () => {
    const quickCreate = read('src/components/shell/quick-create.tsx');
    expect(quickCreate).toContain('QuickCreateFabPortal');
    expect(quickCreate).toContain('--pf-visual-viewport-bottom-offset');
    expect(quickCreate).toContain('max-w-[calc(100%-2rem)]');
  });

  it('avoids w-screen on the storage preview shell (100vw page overflow)', () => {
    const preview = read('src/modules/external-storage/ui/storage-file-preview-shell.tsx');
    expect(preview).not.toMatch(/\bw-screen\b/);
    expect(preview).toContain('lockBodyScroll');
  });

  it('accounts for safe area and visual viewport in mobile main content bottom padding', () => {
    const css = read('src/app/globals.css');
    expect(css).toContain('--pf-bottomnav-total-height');
    expect(css).toContain('--pf-visual-viewport-bottom-offset');
    expect(css).toContain('--pf-mobile-chrome-bottom');
  });
});
