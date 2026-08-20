/**
 * Single source of truth for optional capability metadata.
 * Visibility/presentation only — never security. Permissions stay separate.
 */

import {
  CUSTOMER_FEATURE_MODULE_KEYS,
  OPTIONAL_MODULE_KEYS,
  type OptionalModuleKey,
} from './types';

export type CapabilityGroup =
  | 'sales'
  | 'work'
  | 'people'
  | 'purchasing'
  | 'money'
  | 'field'
  | 'documents'
  | 'advanced';

export const CAPABILITY_GROUP_ORDER: readonly CapabilityGroup[] = [
  'sales',
  'work',
  'people',
  'purchasing',
  'money',
  'field',
  'documents',
  'advanced',
] as const;

export interface CapabilityDefinition {
  readonly id: OptionalModuleKey;
  /** i18n key under settings.modules */
  readonly labelKey: string;
  readonly group: CapabilityGroup;
  /** Real dependencies that must be on when this capability is enabled. */
  readonly requires: readonly OptionalModuleKey[];
  /** Whether Settings → Capabilities may toggle this for customers. */
  readonly customerToggle: boolean;
}

/**
 * Registry keyed by optional module id. Portal stays registered but never
 * customer-toggleable. command_center is core Today chrome, not a toggle.
 */
export const CAPABILITY_REGISTRY: Readonly<Record<OptionalModuleKey, CapabilityDefinition>> =
  {
    clients: {
      id: 'clients',
      labelKey: 'clients',
      group: 'sales',
      requires: [],
      customerToggle: true,
    },
    quotes: {
      id: 'quotes',
      labelKey: 'quotes',
      group: 'sales',
      requires: ['clients'],
      customerToggle: true,
    },
    crm: {
      id: 'crm',
      labelKey: 'crm',
      group: 'sales',
      requires: ['clients'],
      customerToggle: true,
    },
    changes: {
      id: 'changes',
      labelKey: 'changes',
      group: 'work',
      requires: [],
      customerToggle: true,
    },
    jobs: {
      id: 'jobs',
      labelKey: 'jobs',
      group: 'work',
      requires: [],
      customerToggle: true,
    },
    service: {
      id: 'service',
      labelKey: 'service',
      group: 'work',
      requires: [],
      customerToggle: true,
    },
    budgets: {
      id: 'budgets',
      labelKey: 'budgets',
      group: 'money',
      requires: [],
      customerToggle: true,
    },
    boq: {
      id: 'boq',
      labelKey: 'boq',
      group: 'money',
      requires: [],
      customerToggle: true,
    },
    billing: {
      id: 'billing',
      labelKey: 'billing',
      group: 'money',
      requires: [],
      customerToggle: true,
    },
    overhead: {
      id: 'overhead',
      labelKey: 'overhead',
      group: 'money',
      requires: [],
      customerToggle: true,
    },
    month_close: {
      id: 'month_close',
      labelKey: 'month_close',
      group: 'money',
      requires: [],
      customerToggle: true,
    },
    vendors: {
      id: 'vendors',
      labelKey: 'vendors',
      group: 'purchasing',
      requires: [],
      customerToggle: true,
    },
    procurement: {
      id: 'procurement',
      labelKey: 'procurement',
      group: 'purchasing',
      requires: ['vendors'],
      customerToggle: true,
    },
    materials: {
      id: 'materials',
      labelKey: 'materials',
      group: 'purchasing',
      requires: [],
      customerToggle: true,
    },
    workforce: {
      id: 'workforce',
      labelKey: 'workforce',
      group: 'people',
      requires: [],
      customerToggle: true,
    },
    field_ops: {
      id: 'field_ops',
      labelKey: 'field_ops',
      group: 'field',
      requires: [],
      customerToggle: true,
    },
    safety: {
      id: 'safety',
      labelKey: 'safety',
      group: 'field',
      requires: [],
      customerToggle: true,
    },
    forms: {
      id: 'forms',
      labelKey: 'forms',
      group: 'documents',
      requires: [],
      customerToggle: true,
    },
    documents: {
      id: 'documents',
      labelKey: 'documents',
      group: 'documents',
      requires: [],
      customerToggle: true,
    },
    assets: {
      id: 'assets',
      labelKey: 'assets',
      group: 'advanced',
      requires: [],
      customerToggle: true,
    },
    compliance: {
      id: 'compliance',
      labelKey: 'compliance',
      group: 'advanced',
      requires: [],
      customerToggle: true,
    },
    approvals: {
      id: 'approvals',
      labelKey: 'approvals',
      group: 'advanced',
      requires: [],
      customerToggle: true,
    },
    api: {
      id: 'api',
      labelKey: 'api',
      group: 'advanced',
      requires: [],
      customerToggle: true,
    },
    portal: {
      id: 'portal',
      labelKey: 'portal',
      group: 'advanced',
      requires: [],
      customerToggle: false,
    },
    command_center: {
      id: 'command_center',
      labelKey: 'command_center',
      group: 'work',
      requires: [],
      customerToggle: false,
    },
  };

export function getCapability(id: OptionalModuleKey): CapabilityDefinition {
  return CAPABILITY_REGISTRY[id];
}

export function listCustomerCapabilities(): readonly CapabilityDefinition[] {
  return CUSTOMER_FEATURE_MODULE_KEYS.map((id) => CAPABILITY_REGISTRY[id]);
}

export function listCapabilitiesByGroup(
  group: CapabilityGroup,
): readonly CapabilityDefinition[] {
  return listCustomerCapabilities().filter((cap) => cap.group === group);
}

/**
 * Resolve required foundations when enabling a capability.
 * Does not auto-enable unrelated modules.
 */
export function requiredFoundationsFor(
  moduleKey: OptionalModuleKey,
): readonly OptionalModuleKey[] {
  const seen = new Set<OptionalModuleKey>();
  const out: OptionalModuleKey[] = [];

  const visit = (key: OptionalModuleKey) => {
    for (const req of CAPABILITY_REGISTRY[key].requires) {
      if (seen.has(req)) continue;
      seen.add(req);
      visit(req);
      out.push(req);
    }
  };

  visit(moduleKey);
  return out;
}

/** Inventory parity helper — every optional module must appear in the registry. */
export function assertCapabilityRegistryComplete(): void {
  for (const key of OPTIONAL_MODULE_KEYS) {
    if (!CAPABILITY_REGISTRY[key]) {
      throw new Error(`Missing capability registry entry: ${key}`);
    }
  }
}
