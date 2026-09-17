import { describe, expect, it } from 'vitest';
import { DomainRuleError, apiRouteErrorFromUnknown, apiRouteErrorResponse } from '@/shared/errors';

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
