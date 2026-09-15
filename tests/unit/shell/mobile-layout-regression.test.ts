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

  it('does not clip main content to hide horizontal overflow', () => {
    const shell = read('src/components/shell/app-shell.tsx');
    expect(shell).toMatch(/min-w-0/);
    expect(shell).not.toMatch(/overflow-x-clip/);
    expect(shell).toContain('MobileShellViewportSync');
  });

  it('keeps skip link vertically off-screen so hidden 1px box does not widen RTL viewport', () => {
    const shell = read('src/components/shell/app-shell.tsx');
    expect(shell).toContain('-top-[100vh]');
    expect(shell).toContain('skipToContent');
  });

  it('portals mobile nav with visual viewport width and bottom tracking', () => {
    const nav = read('src/components/shell/mobile-nav.tsx');
    expect(nav).toContain('createPortal');
    expect(nav).toContain('--pf-visual-viewport-width');
    expect(nav).toContain('--pf-visual-viewport-offset-left');
    expect(nav).toContain('--pf-visual-viewport-bottom-offset');
    expect(nav).not.toMatch(/\bwidth:\s*['"]100%/);
    expect(nav).not.toMatch(/\binset-x-0\b/);
  });

  it('portals mobile FAB with shared chrome bottom and viewport-bounded inline end', () => {
    const quickCreate = read('src/components/shell/quick-create.tsx');
    expect(quickCreate).toContain('QuickCreateFabPortal');
    expect(quickCreate).toContain('--pf-mobile-chrome-bottom');
    expect(quickCreate).toContain('--pf-visual-viewport-offset-left');
    expect(quickCreate).toContain('insetInlineEnd');
    expect(quickCreate).not.toMatch(/\b100vw\b/);
  });

  it('avoids w-screen on the storage preview shell (100vw page overflow)', () => {
    const preview = read('src/modules/external-storage/ui/storage-file-preview-shell.tsx');
    expect(preview).not.toMatch(/\bw-screen\b/);
    expect(preview).toContain('lockBodyScroll');
  });

  it('accounts for visual viewport geometry in mobile shell CSS vars', () => {
    const css = read('src/app/globals.css');
    expect(css).toContain('--pf-visual-viewport-width');
    expect(css).toContain('--pf-visual-viewport-offset-left');
    expect(css).toContain('--pf-mobile-chrome-safety-inset');
    expect(css).toContain('--pf-mobile-chrome-bottom');
  });

  it('constrains document width to visual viewport on mobile (Android layout vs visual gap)', () => {
    const css = read('src/app/globals.css');
    expect(css).toContain('width: var(--pf-visual-viewport-width, 100%)');
    expect(css).toContain('margin-left: var(--pf-visual-viewport-offset-left, 0px)');
  });

  it('does not use layout-viewport inset-x-0 on mobile toast chrome', () => {
    const toast = read('src/components/ui/toast.tsx');
    const statusToast = read('src/components/ui/status-toast.tsx');
    expect(toast).toContain('--pf-visual-viewport-width');
    expect(toast).not.toMatch(/fixed inset-x-0/);
    expect(statusToast).toContain('--pf-visual-viewport-width');
    expect(statusToast).toMatch(/lg:inset-x-0/);
  });

  it('uses feedback sync for bottom HUD clipping correction', () => {
    const chrome = read('src/shared/ui/visual-viewport-chrome.ts');
    expect(chrome).toContain('syncVisualViewportChromeWithFeedback');
    expect(chrome).toContain('measureNavVisualViewportOvershoot');
    expect(chrome).toContain('MOBILE_CHROME_BOTTOM_SAFETY_PX');
  });
});
