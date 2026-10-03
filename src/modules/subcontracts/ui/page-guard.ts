import { notFound } from 'next/navigation';
import { AuthorizationError, NotFoundError } from '@/shared/errors';

/** RSC pages: missing / not-visible / not-authorized all render 404 (no existence oracle). */
export async function loadOrNotFound<T>(load: () => Promise<T>): Promise<T> {
  try {
    return await load();
  } catch (error) {
    if (error instanceof NotFoundError || error instanceof AuthorizationError) notFound();
    throw error;
  }
}
