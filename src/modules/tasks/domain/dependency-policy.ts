export type TaskDependencyPolicy = 'warn' | 'block';

const DEFAULT_POLICY: TaskDependencyPolicy = 'warn';

function parsePolicyFromModuleConfig(moduleConfig: unknown): TaskDependencyPolicy {
  if (!moduleConfig || typeof moduleConfig !== 'object') return DEFAULT_POLICY;
  const tasks = (moduleConfig as Record<string, unknown>).tasks;
  if (!tasks || typeof tasks !== 'object') return DEFAULT_POLICY;
  const policy = (tasks as Record<string, unknown>).dependencyPolicy;
  return policy === 'block' ? 'block' : DEFAULT_POLICY;
}

export function taskDependencyPolicyFromModuleConfig(moduleConfig: unknown): TaskDependencyPolicy {
  return parsePolicyFromModuleConfig(moduleConfig);
}
