import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  APP_CLIENT_MESSAGE_NAMESPACES,
  AUTH_CLIENT_MESSAGE_NAMESPACES,
  MARKETING_CLIENT_MESSAGE_NAMESPACES,
  ROOT_CLIENT_MESSAGE_NAMESPACES,
} from '@/shared/i18n/config';
import { appClientMessageNamespaces, pickClientMessages } from '@/shared/i18n/pick-client-messages';

/** Client modules rendered under PublicHomepage (signed-out locale root). */
const PUBLIC_HOMEPAGE_CLIENT_FILES = [
  'src/modules/marketing/ui/landing-header.tsx',
  'src/modules/marketing/ui/landing-install-block.tsx',
  'src/modules/marketing/ui/landing-faq.tsx',
  'src/modules/marketing/ui/product-tour.tsx',
] as const;

function rootNamespacesFromClientSource(source: string): Set<string> {
  const roots = new Set<string>();
  const pattern =
    /useTranslations\(\s*(?:\{[^}]*namespace:\s*['"]([^'"]+)['"][^}]*\}|['"]([^'"]+)['"])\s*\)/g;
  for (const match of source.matchAll(pattern)) {
    const ns = match[1] ?? match[2];
    if (!ns) continue;
    roots.add(ns.split('.')[0]!);
  }
  if (source.includes('PwaInstallCta')) {
    roots.add('offline');
  }
  return roots;
}

function assertSurfaceCoversFiles(
  surfaceLabel: string,
  surfaceNamespaces: readonly string[],
  clientFiles: readonly string[],
): void {
  const available = new Set(surfaceNamespaces);
  for (const relativePath of clientFiles) {
    const source = readFileSync(join(process.cwd(), relativePath), 'utf8');
    for (const root of rootNamespacesFromClientSource(source)) {
      expect(available.has(root), `${surfaceLabel} missing "${root}" for ${relativePath}`).toBe(
        true,
      );
    }
  }
}

describe('client message scoping', () => {
  it('root layout ships only universal namespaces', () => {
    expect(ROOT_CLIENT_MESSAGE_NAMESPACES).toEqual(['common', 'errors', 'offline']);
    expect(ROOT_CLIENT_MESSAGE_NAMESPACES.length).toBeLessThan(5);
  });

  it('WithClientMessages exact set excludes the app catalog', () => {
    const messages = Object.fromEntries(
      [...ROOT_CLIENT_MESSAGE_NAMESPACES, ...AUTH_CLIENT_MESSAGE_NAMESPACES, ...APP_CLIENT_MESSAGE_NAMESPACES].map(
        (ns) => [ns, { sample: ns }],
      ),
    );
    const picked = pickClientMessages(messages, AUTH_CLIENT_MESSAGE_NAMESPACES);
    expect(Object.keys(picked).sort()).toEqual([...AUTH_CLIENT_MESSAGE_NAMESPACES].sort());
    expect(picked).not.toHaveProperty('projects');
  });

  it('app wrapper merges authenticated base with extras', () => {
    const merged = appClientMessageNamespaces('imports');
    expect(merged).toContain('imports');
    expect(merged).toContain('nav');
    expect(merged.length).toBeGreaterThan(APP_CLIENT_MESSAGE_NAMESPACES.length - 1);
  });

  it('marketing scope stays lean (no app catalog)', () => {
    expect(MARKETING_CLIENT_MESSAGE_NAMESPACES).toEqual(['common', 'marketing', 'offline']);
    expect(MARKETING_CLIENT_MESSAGE_NAMESPACES).not.toContain('projects');
  });

  it('root and auth surfaces ship offline for PwaInstallCta', () => {
    expect(ROOT_CLIENT_MESSAGE_NAMESPACES).toContain('offline');
    expect(AUTH_CLIENT_MESSAGE_NAMESPACES).toContain('offline');
  });

  it('PublicHomepage client tree is covered by MARKETING_CLIENT_MESSAGE_NAMESPACES', () => {
    assertSurfaceCoversFiles(
      'marketing',
      MARKETING_CLIENT_MESSAGE_NAMESPACES,
      PUBLIC_HOMEPAGE_CLIENT_FILES,
    );
  });

  it('auth surface covers auth layout client dependencies', () => {
    const authClientFiles = [
      'src/app/[locale]/(auth)/sign-in/sign-in-form.tsx',
      'src/modules/offline/ui/pwa-install-cta.tsx',
    ] as const;
    assertSurfaceCoversFiles('auth', AUTH_CLIENT_MESSAGE_NAMESPACES, authClientFiles);
  });
});
