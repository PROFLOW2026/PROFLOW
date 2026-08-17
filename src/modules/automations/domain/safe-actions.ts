import { DomainRuleError } from '@/shared/errors';
import {
  SAFE_AUTOMATION_ACTIONS,
  UNSAFE_AUTOMATION_ACTIONS,
  type AutomationActionRequest,
  type SafeAutomationAction,
} from './types';

export function isSafeAutomationAction(action: string): action is SafeAutomationAction {
  return (SAFE_AUTOMATION_ACTIONS as readonly string[]).includes(action);
}

export function isUnsafeAutomationAction(action: string): boolean {
  return (UNSAFE_AUTOMATION_ACTIONS as readonly string[]).includes(action);
}

export function assertSafeAutomationAction(action: string): asserts action is SafeAutomationAction {
  if (isUnsafeAutomationAction(action) || !isSafeAutomationAction(action)) {
    throw new DomainRuleError(
      'Automations cannot post, pay, approve, or change contracts',
      'automations.errors.unsafeAction',
      { action },
    );
  }
}

export function defaultActionsForPreset(): readonly AutomationActionRequest[] {
  return [{ kind: 'notify' }];
}

export function filterExecutableActions(
  requests: readonly AutomationActionRequest[],
): { readonly allowed: AutomationActionRequest[]; readonly refused: string[] } {
  const allowed: AutomationActionRequest[] = [];
  const refused: string[] = [];
  for (const request of requests) {
    if (isSafeAutomationAction(request.kind)) {
      allowed.push(request);
    } else {
      refused.push(request.kind);
    }
  }
  return { allowed, refused };
}
