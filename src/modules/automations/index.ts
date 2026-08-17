export {
  AUTOMATION_PRESET_KEYS,
  SAFE_AUTOMATION_ACTIONS,
  UNSAFE_AUTOMATION_ACTIONS,
} from './domain/types';
export type {
  AutomationPresetKey,
  AutomationRunRecord,
  SafeAutomationAction,
} from './domain/types';
export {
  assertSafeAutomationAction,
  filterExecutableActions,
  isSafeAutomationAction,
  isUnsafeAutomationAction,
} from './domain/safe-actions';
export { listAutomationPresets, setAutomationRuleEnabled } from './application/manage';
export { runRules } from './application/run-rules';
export type { RunRulesResult } from './application/run-rules';
export { setAutomationRuleSchema, runAutomationsSchema } from './validation/schemas';
