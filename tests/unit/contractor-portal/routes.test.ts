import { existsSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildPortalHref,
  isLivePortalHref,
  matchPortalRoute,
  PORTAL_ROUTES,
  portalHref,
} from '@/modules/contractor-portal';
import { isExternalCapability } from '@/shared/external';
import { requirementCapabilities } from '@/modules/contractor-portal';

const CONTRACTOR_APP_DIR = path.resolve(__dirname, '../../../src/app/[locale]/contractor');

function listPageFiles(dir: string, base = ''): string[] {
  if (!existsSync(dir)) return [];
  const found: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    const relative = base ? `${base}/${entry}` : entry;
    if (statSync(full).isDirectory()) found.push(...listPageFiles(full, relative));
    else if (entry === 'page.tsx') found.push(relative);
  }
  return found;
}

describe('contractor portal route config', () => {
  it('has unique keys and paths', () => {
    const keys = PORTAL_ROUTES.map((route) => route.key);
    const paths = PORTAL_ROUTES.map((route) => route.path);
    expect(new Set(keys).size).toBe(keys.length);
    expect(new Set(paths).size).toBe(paths.length);
  });

  it('marks a route implemented only when its page exists on disk (no dead links)', () => {
    for (const route of PORTAL_ROUTES.filter((candidate) => candidate.implemented)) {
      expect(existsSync(path.join(CONTRACTOR_APP_DIR, route.pageFile)), route.pageFile).toBe(true);
    }
  });

  it('covers every portal page that exists on disk', () => {
    const configured = new Set<string>(PORTAL_ROUTES.map((route) => route.pageFile));
    for (const pageFile of listPageFiles(CONTRACTOR_APP_DIR)) {
      expect(configured.has(pageFile), `${pageFile} missing from PORTAL_ROUTES`).toBe(true);
    }
  });

  it('only references catalog capabilities', () => {
    for (const route of PORTAL_ROUTES) {
      if (route.capability === null) continue;
      for (const capability of requirementCapabilities(route.capability)) {
        expect(isExternalCapability(capability), `${route.key}: ${capability}`).toBe(true);
      }
    }
  });

  it('gates every financial page behind a financial capability', () => {
    const financial = ['project.claims', 'project.claim', 'project.payments', 'project.contractChanges'];
    for (const key of financial) {
      const route = PORTAL_ROUTES.find((candidate) => candidate.key === key)!;
      expect(route.capability).not.toBeNull();
      const caps = requirementCapabilities(route.capability!);
      expect(caps.every((cap) => /^ext\.(claim|payment|change|contract)\./.test(cap))).toBe(true);
    }
  });

  it('builds hrefs and rejects missing params', () => {
    expect(buildPortalHref('')).toBe('/contractor');
    expect(buildPortalHref('projects/[projectId]/tasks', { projectId: 'p1' })).toBe('/contractor/projects/p1/tasks');
    expect(() => buildPortalHref('projects/[projectId]')).toThrow();
  });

  it('gives every implemented project route a live href', () => {
    const projectRoutes = PORTAL_ROUTES.filter((route) => route.scope === 'project');
    expect(projectRoutes.some((route) => !route.implemented)).toBe(false);
    for (const route of projectRoutes) {
      expect(
        portalHref(route.key, {
          projectId: 'p1',
          taskId: 't',
          eventId: 'e',
          agreementId: 'a',
          claimId: 'c',
          drawingId: 'd',
          rfiId: 'r',
          submittalId: 's',
          defectId: 'f',
          instructionId: 'i',
          inspectionId: 'in1',
          packageId: 'pkg1',
        }),
      ).not.toBeNull();
    }
    expect(portalHref('dashboard')).toBe('/contractor');
  });

  it('matches deep links to their route and drops dead ones', () => {
    expect(matchPortalRoute('/contractor/projects/abc')?.key).toBe('project.home');
    expect(matchPortalRoute('/contractor/projects/abc/tasks/t1?x=1')?.key).toBe('project.task');
    expect(matchPortalRoute('/projects/abc')).toBeNull();
    expect(isLivePortalHref('/contractor/projects/abc')).toBe(true);
    expect(isLivePortalHref('/contractor/notifications')).toBe(true);
    expect(isLivePortalHref('/contractor/unknown')).toBe(false);
    expect(isLivePortalHref(null)).toBe(false);
    const dead = PORTAL_ROUTES.find((route) => !route.implemented && route.key === 'project.tasks');
    if (dead) expect(isLivePortalHref('/contractor/projects/abc/tasks')).toBe(false);
  });
});
