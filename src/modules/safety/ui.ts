/**
 * UI entry point for the safety module.
 *
 * Kept separate from `index.ts` so importing application/domain never pulls React.
 */

export {
  safetyRecordStatusShape,
  safetyActionStatusShape,
  safetySeverityShape,
} from './ui/status-shape';
