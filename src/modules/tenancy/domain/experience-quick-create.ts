/**
 * Quick Create allowlists — visibly smaller menus per persona.
 */

import type { ExperiencePersonaKey } from './experience-persona';

export const PERSONA_QUICK_CREATE_KEYS: Readonly<
  Record<ExperiencePersonaKey, readonly string[]>
> = {
  project_contractor: ['project', 'quote', 'expense', 'vendorBill', 'fieldLog', 'change'],
  electrical: ['job', 'project', 'quote', 'expense', 'timeEntry', 'fieldLog'],
  renovation: ['project', 'job', 'quote', 'expense', 'change', 'client'],
  small_works: ['client', 'job', 'quote', 'expense', 'billingRecord'],
  service: ['client', 'service', 'expense', 'billingRecord', 'attendance'],
  architecture: ['client', 'quote', 'project', 'timeEntry', 'billingRecord'],
  consulting: ['client', 'quote', 'project', 'timeEntry', 'billingRecord'],
  inspection: ['job', 'fieldLog', 'expense', 'client', 'timeEntry'],
  mixed: ['project', 'job', 'service', 'quote', 'expense', 'client'],
  all: [
    'project',
    'job',
    'service',
    'quote',
    'client',
    'expense',
    'vendor',
    'billingRecord',
    'employee',
    'timeEntry',
    'fieldLog',
    'change',
  ],
};

const MAX_ACTIONS = 6;

export function limitQuickCreateForPersona<T extends { key: string }>(
  actions: readonly T[],
  persona: ExperiencePersonaKey,
): T[] {
  const allow = PERSONA_QUICK_CREATE_KEYS[persona];
  const allowSet = new Set(allow);
  const preferred: T[] = [];
  const rest: T[] = [];

  for (const key of allow) {
    const match = actions.find((action) => action.key === key);
    if (match) preferred.push(match);
  }
  for (const action of actions) {
    if (!allowSet.has(action.key) && persona === 'all') {
      rest.push(action);
    }
  }

  const combined = persona === 'all' ? [...preferred, ...rest] : preferred;
  return combined.slice(0, persona === 'all' ? 12 : MAX_ACTIONS);
}
