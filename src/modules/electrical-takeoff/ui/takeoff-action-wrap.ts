import { TakeoffRevisionConflictError, isRevisionConflictError } from './takeoff-errors';

/** Re-throw revision conflicts as a typed client error (server actions serialize domain errors). */
export async function wrapTakeoffAction<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (isRevisionConflictError(error)) {
      throw new TakeoffRevisionConflictError();
    }
    throw error;
  }
}