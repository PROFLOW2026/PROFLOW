import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  AuthenticationRequiredError,
  AuthorizationError,
  DomainRuleError,
  NotFoundError,
  apiRouteErrorFromUnknown,
  apiRouteErrorResponse,
  fileRouteErrorResponse,
} from '@/shared/errors';

describe('apiRouteErrorResponse', () => {
  it('returns messageKey only, never English AppError.message', async () => {
    const response = apiRouteErrorResponse('errors.notFound', 404);
    expect(response.status).toBe(404);
    const body = (await response.json()) as { error: string };
    expect(body.error).toBe('errors.notFound');
  });

  it('apiRouteErrorFromUnknown uses AppError.messageKey', async () => {
    const error = new DomainRuleError('English only', 'externalStorage.errors.quotaFull');
    const response = apiRouteErrorFromUnknown(error, 'errors.unexpected');
    expect(response.status).toBe(422);
    const body = (await response.json()) as { error: string };
    expect(body.error).toBe('externalStorage.errors.quotaFull');
    expect(body.error).not.toBe('English only');
  });
});

describe('fileRouteErrorResponse', () => {
  it('maps a sign-in redirect to 401 with an empty body', async () => {
    const error = Object.assign(new Error('NEXT_REDIRECT'), {
      digest: 'NEXT_REDIRECT;replace;/he/contractor/sign-in?reason=revoked;307;',
    });
    const response = fileRouteErrorResponse(error);
    expect(response.status).toBe(401);
    expect(await response.text()).toBe('');
  });

  it('rethrows other requireSession redirects instead of returning 500', () => {
    const error = Object.assign(new Error('NEXT_REDIRECT'), {
      digest: 'NEXT_REDIRECT;replace;/he/onboarding;307;',
    });
    expect(() => fileRouteErrorResponse(error)).toThrow(error);
  });

  it('rethrows the redirect fallback so it is not operationFailed', () => {
    const error = new Error('redirect() was expected to interrupt rendering');
    expect(() => fileRouteErrorResponse(error)).toThrow(error);
  });

  it('maps a missing session to 401 without the error text', async () => {
    const response = fileRouteErrorResponse(new AuthenticationRequiredError('Invalid API key'));
    expect(response.status).toBe(401);
    expect(await response.text()).toBe('');
  });

  it('maps a missing record to 404 without the id', async () => {
    const id = '11111111-1111-1111-1111-111111111111';
    const response = fileRouteErrorResponse(new NotFoundError(`Document ${id}`));
    expect(response.status).toBe(404);
    const body = await response.text();
    expect(body).toBe('');
    expect(body).not.toContain(id);
  });

  it('maps no access to 404 without the permission', async () => {
    const response = fileRouteErrorResponse(new AuthorizationError('documents.read'));
    expect(response.status).toBe(404);
    expect(await response.text()).toBe('');
  });

  it('maps an invalid id database error to 404 without echoing the id', async () => {
    const error = Object.assign(new Error('invalid input syntax for type uuid: "not-a-uuid"'), {
      code: '22P02',
    });
    const response = fileRouteErrorResponse(error);
    expect(response.status).toBe(404);
    const body = await response.text();
    expect(body).not.toContain('not-a-uuid');
  });

  it('maps a provider 404 to 404 without the provider body', async () => {
    const error = new Error('Provider request failed (404)');
    error.name = 'ProviderHttpError';
    Object.assign(error, { status: 404, bodySnippet: 'secret-file-id' });
    const response = fileRouteErrorResponse(error);
    expect(response.status).toBe(404);
    expect(await response.text()).not.toContain('secret-file-id');
  });

  it('maps a provider outage to 500 operationFailed without the provider body', async () => {
    const error = new Error('Provider request failed (500)');
    error.name = 'ProviderHttpError';
    Object.assign(error, { status: 500, bodySnippet: 'secret-file-id' });
    const response = fileRouteErrorResponse(error);
    expect(response.status).toBe(500);
    const body = (await response.json()) as { error: string };
    expect(body.error).toBe('externalStorage.errors.operationFailed');
    expect(JSON.stringify(body)).not.toContain('secret-file-id');
  });

  it('maps unconfigured storage to 500 operationFailed without the English message', async () => {
    const error = new Error('File storage is not configured in this environment.');
    error.name = 'StorageNotConfiguredError';
    const response = fileRouteErrorResponse(error);
    expect(response.status).toBe(500);
    const body = (await response.json()) as { error: string };
    expect(body.error).toBe('externalStorage.errors.operationFailed');
    expect(JSON.stringify(body)).not.toContain('configured');
  });

  it('keeps domain-rule failures on their own status and messageKey', async () => {
    const error = new DomainRuleError('Upload too large', 'projectPlans.evidence.errors.tooLarge');
    const response = fileRouteErrorResponse(error);
    expect(response.status).toBe(422);
    const body = (await response.json()) as { error: string };
    expect(body.error).toBe('projectPlans.evidence.errors.tooLarge');
    expect(body.error).not.toBe('Upload too large');
  });

  it('does not label an unknown failure as a storage outage or leak its message', async () => {
    const response = fileRouteErrorResponse(new Error('boom secret-file-id'));
    expect(response.status).toBe(500);
    const body = (await response.json()) as { error: string };
    expect(body.error).toBe('errors.unexpected');
    expect(JSON.stringify(body)).not.toContain('secret-file-id');
  });
});

describe('browser download route', () => {
  it('uses the file error map instead of the storage 500 catch', () => {
    const source = readFileSync('src/app/api/org-storage/browser-download/route.ts', 'utf8');
    expect(source).toContain('fileRouteErrorResponse(error)');
    expect(source).not.toContain('apiRouteErrorFromUnknown');
  });
});
