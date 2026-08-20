/**
 * Two-level navigation composition by experience persona.
 * Reuses NAV_ITEMS destinations — changes grouping + primary prominence.
 */

import type { ExperiencePersonaKey, ExperienceRoleSurface } from './experience-persona';

export const EXPERIENCE_NAV_GROUPS = [
  'today',
  'clients',
  'work',
  'people',
  'purchasing',
  'money',
  'field',
  'documents',
  'reports',
  'advanced',
] as const;

export type ExperienceNavGroup = (typeof EXPERIENCE_NAV_GROUPS)[number];

/** Nav item keys that belong in each conceptual group (destination catalog). */
export const NAV_KEY_TO_EXPERIENCE_GROUP: Readonly<Record<string, ExperienceNavGroup>> = {
  dashboard: 'today',
  today: 'today',
  clients: 'clients',
  quotes: 'clients',
  crm: 'clients',
  communications: 'clients',
  projects: 'work',
  jobs: 'work',
  workOrders: 'work',
  dispatch: 'work',
  serviceRecurring: 'work',
  changes: 'work',
  scheduling: 'work',
  calendar: 'work',
  warranty: 'work',
  workforce: 'people',
  time: 'people',
  attendance: 'people',
  timesheets: 'people',
  vendors: 'purchasing',
  procurement: 'purchasing',
  vendorBills: 'purchasing',
  materials: 'purchasing',
  expenses: 'money',
  billing: 'money',
  recurringDrafts: 'money',
  cashFlow: 'money',
  monthClose: 'money',
  overhead: 'money',
  fieldOps: 'field',
  fieldHome: 'field',
  safety: 'field',
  forms: 'field',
  documents: 'documents',
  imports: 'documents',
  reports: 'reports',
  assets: 'advanced',
  compliance: 'advanced',
  approvals: 'advanced',
  assistant: 'advanced',
  automations: 'advanced',
  settings: 'advanced',
};

/**
 * Primary destinations (sidebar core / mobile bar) per persona.
 * Order matters. Settings always appended separately.
 */
export const PERSONA_PRIMARY_NAV_KEYS: Readonly<
  Record<ExperiencePersonaKey, readonly string[]>
> = {
  project_contractor: ['today', 'dashboard', 'projects', 'expenses', 'clients'],
  electrical: ['today', 'dashboard', 'jobs', 'projects', 'expenses'],
  renovation: ['today', 'dashboard', 'projects', 'clients', 'expenses'],
  small_works: ['today', 'dashboard', 'jobs', 'clients', 'expenses'],
  service: ['today', 'dashboard', 'workOrders', 'fieldHome', 'clients'],
  architecture: ['today', 'dashboard', 'projects', 'clients', 'time'],
  consulting: ['today', 'dashboard', 'projects', 'time', 'clients'],
  inspection: ['today', 'dashboard', 'fieldOps', 'projects', 'clients'],
  mixed: ['today', 'dashboard', 'projects', 'jobs', 'expenses'],
  all: ['today', 'dashboard', 'projects', 'jobs', 'expenses'],
};

/**
 * Groups shown in the sidebar for each persona (empty groups omitted at render).
 */
export const PERSONA_VISIBLE_GROUPS: Readonly<
  Record<ExperiencePersonaKey, readonly ExperienceNavGroup[]>
> = {
  project_contractor: [
    'today',
    'clients',
    'work',
    'people',
    'purchasing',
    'money',
    'field',
    'documents',
    'reports',
    'advanced',
  ],
  electrical: [
    'today',
    'clients',
    'work',
    'people',
    'purchasing',
    'money',
    'field',
    'documents',
    'reports',
    'advanced',
  ],
  renovation: [
    'today',
    'clients',
    'work',
    'people',
    'purchasing',
    'money',
    'field',
    'documents',
    'reports',
    'advanced',
  ],
  small_works: ['today', 'clients', 'work', 'people', 'money', 'documents', 'reports', 'advanced'],
  service: [
    'today',
    'clients',
    'work',
    'people',
    'purchasing',
    'money',
    'field',
    'documents',
    'reports',
    'advanced',
  ],
  architecture: ['today', 'clients', 'work', 'people', 'money', 'documents', 'reports', 'advanced'],
  consulting: ['today', 'clients', 'work', 'people', 'money', 'documents', 'reports', 'advanced'],
  inspection: [
    'today',
    'clients',
    'work',
    'people',
    'field',
    'money',
    'documents',
    'reports',
    'advanced',
  ],
  mixed: [
    'today',
    'clients',
    'work',
    'people',
    'purchasing',
    'money',
    'field',
    'documents',
    'reports',
    'advanced',
  ],
  all: [
    'today',
    'clients',
    'work',
    'people',
    'purchasing',
    'money',
    'field',
    'documents',
    'reports',
    'advanced',
  ],
};

/** Nav keys de-emphasized (moved to advanced / More) for a role surface. */
export function roleNavEmphasis(
  role: ExperienceRoleSurface,
): { prefer: readonly string[]; demote: readonly string[] } {
  switch (role) {
    case 'field':
      return {
        prefer: ['today', 'fieldHome', 'fieldOps', 'attendance', 'time', 'jobs', 'workOrders'],
        demote: ['reports', 'cashFlow', 'monthClose', 'crm', 'approvals', 'automations', 'overhead'],
      };
    case 'finance':
      return {
        prefer: ['dashboard', 'billing', 'expenses', 'vendors', 'vendorBills', 'cashFlow', 'reports'],
        demote: ['fieldOps', 'fieldHome', 'safety', 'forms', 'dispatch'],
      };
    case 'office':
      return {
        prefer: ['clients', 'quotes', 'documents', 'procurement', 'vendors', 'communications'],
        demote: ['fieldOps', 'safety', 'cashFlow', 'monthClose'],
      };
    case 'project_manager':
      return {
        prefer: ['today', 'projects', 'jobs', 'scheduling', 'workforce', 'fieldOps', 'changes'],
        demote: ['monthClose', 'overhead', 'automations'],
      };
    case 'owner':
    case 'general':
    default:
      return { prefer: [], demote: [] };
  }
}
