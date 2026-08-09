/**
 * Preload for the e2e harness (tsx outside Next.js).
 * `server-only` is a Next bundler guard; Node must treat it as a no-op.
 */
import { register } from 'node:module';

register('./alias-server-only-hook.mjs', import.meta.url);
