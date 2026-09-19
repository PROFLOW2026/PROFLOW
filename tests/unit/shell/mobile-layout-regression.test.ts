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

  it('does not clip main content or sync visual viewport on scroll', () => {
    const shell = read('src/components/shell/app-shell.tsx');
    expect(shell).toMatch(/min-w-0/);
    expect(shell).not.toMatch(/overflow-x-clip/);
    expect(shell).not.toContain('MobileShellViewportSync');
  });

  it('keeps skip link vertically off-screen so hidden 1px box does not widen RTL viewport', () => {
    const shell = read('src/components/shell/app-shell.tsx');
    expect(shell).toContain('-top-[100vh]');
    expect(shell).toContain('skipToContent');
  });

  it('uses stable fixed bottom nav without dynamic visual viewport geometry', () => {
    const nav = read('src/components/shell/mobile-nav.tsx');
    expect(nav).toContain('createPortal');
    expect(nav).toContain('inset-x-0');
    expect(nav).toContain('bottom-0');
    expect(nav).not.toContain('--pf-visual-viewport-width');
    expect(nav).not.toContain('--pf-visual-viewport-bottom-offset');
    expect(nav).not.toContain('mobileNavPositionStyle');
  });

  it('positions FAB fixed to viewport with bottom-nav clearance on mobile', () => {
    const quickCreate = read('src/components/shell/quick-create.tsx');
    expect(quickCreate).toContain('QuickCreateFabPortal');
    expect(quickCreate).toContain('--pf-bottomnav-total-height');
    expect(quickCreate).toContain('fixed left-4');
    expect(quickCreate).toContain('lg:bottom-[var(--pf-fab-gap)]');
    expect(quickCreate).not.toContain('lg:static');
    expect(quickCreate).not.toMatch(/\b100vw\b/);
    expect(quickCreate).not.toContain('--pf-visual-viewport');
  });

  it('exposes locale switcher on the public marketing header', () => {
    const header = read('src/modules/marketing/ui/landing-header.tsx');
    expect(header).toContain('LocaleSwitcherInline');
  });

  it('avoids w-screen on the storage preview shell (100vw page overflow)', () => {
    const preview = read('src/modules/external-storage/ui/storage-file-preview-shell.tsx');
    expect(preview).not.toMatch(/\bw-screen\b/);
    expect(preview).toContain('lockBodyScroll');
  });

  it('uses constant mobile content padding from bottom nav and FAB only', () => {
    const css = read('src/app/globals.css');
    expect(css).toContain('--pf-bottomnav-total-height');
    expect(css).toContain('--pf-mobile-content-bottom');
    expect(css).not.toContain('--pf-visual-viewport-width');
    expect(css).not.toContain('--pf-visual-viewport-bottom-offset');
    expect(css).not.toContain('--pf-mobile-chrome-safety-inset');
  });

  it('uses normal fixed toast containers without visual viewport width tracking', () => {
    const toast = read('src/components/ui/toast.tsx');
    const statusToast = read('src/components/ui/status-toast.tsx');
    expect(toast).toContain('inset-x-0');
    expect(toast).not.toContain('--pf-visual-viewport');
    expect(statusToast).toContain('inset-x-0');
    expect(statusToast).not.toContain('--pf-visual-viewport');
  });
});
