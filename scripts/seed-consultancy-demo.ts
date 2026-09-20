/**
 * Idempotent Hebrew consultancy demo seed — demo org only.
 *
 * Usage:
 *   $env:NODE_OPTIONS="--require ./scripts/profile-shim.cjs"
 *   npm run seed:consultancy-demo
 */
import { main } from './consultancy-demo/run.ts';

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
