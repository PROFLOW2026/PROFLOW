import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { AuthorizationError, NotFoundError } from '@/shared/errors';
import {
  PAGE_AUTHORIZATION_DIGEST,
  isPageAuthorizationFailure,
  rethrowIfPageAuthorization,
} from '@/shared/errors/page-authorization';

describe('page authorization failure', () => {
  it('stamps AuthorizationError so an escaped page render can show errors.notAllowed', () => {
    const error = new AuthorizationError('project_financials.read');

    expect(error.messageKey).toBe('errors.notAllowed');
    expect(error.status).toBe(403);
    expect(error.digest).toBe(PAGE_AUTHORIZATION_DIGEST);
    expect(error.digest.startsWith('NEXT_')).toBe(false);
    expect(isPageAuthorizationFailure(error)).toBe(true);
  });

  it('does not treat not-found or a generic failure as a permission denial', () => {
    expect(isPageAuthorizationFailure(new NotFoundError('Project'))).toBe(false);
    expect(isPageAuthorizationFailure(new Error('boom'))).toBe(false);
    expect(isPageAuthorizationFailure({ digest: 'NEXT_HTTP_ERROR_FALLBACK;404' })).toBe(false);
    expect(isPageAuthorizationFailure({ digest: 'NEXT_HTTP_ERROR_FALLBACK;403' })).toBe(false);
    expect(() => rethrowIfPageAuthorization(new NotFoundError('Project'))).not.toThrow();
  });

  it('rethrows only the page authorization digest', () => {
    const error = new AuthorizationError('project_financials.read');
    expect(() => rethrowIfPageAuthorization(error)).toThrow(error);
  });

  it('leaves requireProjectCapabilityPage on notFound for a bad id, a missing project, and a missing capability', () => {
    const source = readFileSync(
      path.join(process.cwd(), 'src/modules/project-team/server.ts'),
      'utf8',
    );
    const start = source.indexOf('export async function requireProjectCapabilityPage');
    expect(start).toBeGreaterThan(-1);
    const body = source.slice(start);

    expect(body).toContain('if (!UUID_PATTERN.test(projectId)) notFound()');
    expect(body).toContain('if (!access) notFound()');
    expect(body).toContain('if (!allowed) notFound()');
    expect(body).not.toContain('forbidden(');
    expect(body).not.toContain('PAGE_AUTHORIZATION_DIGEST');
  });
});