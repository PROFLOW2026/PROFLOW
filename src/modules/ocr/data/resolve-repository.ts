import type { DbExecutor } from '@/shared/db/types';
import { ServiceUnavailableError } from '@/shared/errors';
import { areOcrJobsDurable } from '../domain/persistence';
import { createDrizzleOcrRepository } from './drizzle-ocr.repository';
import { createInMemoryOcrRepository } from './in-memory-ocr.store';
import type { OcrRepository } from './ocr.repository';

let overrideRepo: OcrRepository | null = null;

/**
 * Production default: Drizzle when `OCR_PERSISTENCE_READY`.
 * Otherwise returns the in-memory **test double** (not durable).
 */
export function getOcrRepository(db?: DbExecutor | null): OcrRepository {
  if (overrideRepo) return overrideRepo;
  if (areOcrJobsDurable()) {
    if (!db) {
      throw new ServiceUnavailableError(
        'OCR persistence is ready but no database executor was provided',
        'ocr.errors.dbRequired',
      );
    }
    return createDrizzleOcrRepository(db);
  }
  return createInMemoryOcrRepository();
}

/** Test hook — inject a repository double. */
export function setOcrRepositoryForTests(repo: OcrRepository | null): void {
  overrideRepo = repo;
}
