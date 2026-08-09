/**
 * UI entry point for this module.
 *
 * Kept separate from `index.ts` so importing the module's application or domain
 * layer never pulls React into plain Node contexts such as unit tests.
 */

export { complianceStatusShape } from './ui/status-shape';
