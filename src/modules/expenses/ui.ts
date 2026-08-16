/**
 * UI entry point for this module.
 *
 * Kept separate from `index.ts` so importing the module's application or domain
 * layer never pulls React server components - and the `server-only` guard they
 * import - into plain Node contexts such as unit tests.
 */

export { ProjectExpensesPanel } from './ui/project-expenses-panel';
