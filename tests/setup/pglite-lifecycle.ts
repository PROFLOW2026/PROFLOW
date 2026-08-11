import { afterAll } from 'vitest';
import { closeAllTestDatabases } from './database';

/** Safety-net close for any PGlite handle this file forgot, including failure paths. */
afterAll(async () => {
  await closeAllTestDatabases();
});
