import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { SHELL_CACHE_NAME, SHELL_NAVIGATION_PRELOAD } from '@/modules/offline/domain/sw-policy';
import { buildWebManifest, manifestLocaleFromCookie } from '@/modules/offline/domain/web-manifest';

describe('PWA web manifest start_url', () => {
  it('prefixes start_url with the cookie locale so launch skips the / redirect', () => {
    expect(manifestLocaleFromCookie(undefined)).toBe('he-IL');
    expect(manifestLocaleFromCookie('en')).toBe('en');
    expect(buildWebManifest('he-IL').start_url).toBe('/he-IL');
    expect(buildWebManifest('en').start_url).toBe('/en');
    expect(buildWebManifest('he-IL').display).toBe('standalone');
    expect(buildWebManifest('he-IL').id).toBe('/');
  });
});

describe('installed-app service worker', () => {
  it('enables navigation preload and serves preloadResponse for navigations', () => {
    expect(SHELL_NAVIGATION_PRELOAD).toBe(true);
    expect(SHELL_CACHE_NAME).toBe('projectflow-shell-v4');

    const source = readFileSync(path.join(process.cwd(), 'public/sw.js'), 'utf8');
    expect(source).toContain('projectflow-shell-v4');
    expect(source).toContain("cache: 'no-store'");
    expect(source).toContain('/documents');
    expect(source).toContain('navigationPreload.enable');
    expect(source).toContain('event.preloadResponse');
    expect(source).toMatch(/if \(request\.mode === 'navigate'\)/);

    const registrar = readFileSync(
      path.join(process.cwd(), 'src/modules/offline/ui/service-worker-registrar.tsx'),
      'utf8',
    );
    expect(registrar).toContain("updateViaCache: 'none'");
    expect(registrar).toContain('controllerchange');
    expect(registrar).toContain('hadController');
  });
});
