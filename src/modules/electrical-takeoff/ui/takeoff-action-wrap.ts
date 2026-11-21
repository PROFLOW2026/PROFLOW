import { isCatalogActionFailure, type CatalogActionFailure } from '../domain/errors';
import { TakeoffRevisionConflictError, isRevisionConflictError } from './takeoff-errors';

/** Re-throw revision conflicts as a typed client error (server actions serialize domain errors). */
export async function wrapTakeoffAction<T>(run: () => Promise<T>): Promise<Exclude<T, CatalogActionFailure>> {
  try {
    const result = await run();
    if (isCatalogActionFailure(result)) {
      throw Object.assign(new Error(result.message), { takeoffCode: result.code, name: 'TakeoffClientError' });
    }
    return result as Exclude<T, CatalogActionFailure>;
  } catch (error) {
    if (isRevisionConflictError(error)) {
      throw new TakeoffRevisionConflictError();
    }
    throw error;
  }
}