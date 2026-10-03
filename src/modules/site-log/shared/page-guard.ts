import 'server-only';
import { notFound } from 'next/navigation';
import { AuthorizationError, NotFoundError } from '@/shared/errors';

/** Field pages render 404 for missing or unauthorized records (no existence oracle). */
export async function loadOrNotFound<T>(load: () => Promise<T>): Promise<T> {
  try {
    return await load();
  } catch (error) {
    if (error instanceof AuthorizationError || error instanceof NotFoundError) notFound();
    throw error;
  }
}
