'use client';

import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import type { ModuleVisibility } from '@/modules/tenancy/domain/types';
import { capabilityForPath } from '@/modules/tenancy/domain/route-capability';
import { HiddenCapabilityBanner } from './hidden-capability-banner';

/**
 * Client notice when a deep link opens a capability hidden from navigation.
 * Permissions still gate the page; this only explains nav visibility.
 */
export function HiddenCapabilityNotice({
  modules,
}: {
  readonly modules: ModuleVisibility;
}) {
  const pathname = usePathname() ?? '';
  const tNav = useTranslations('nav');
  const moduleKey = capabilityForPath(pathname);
  if (!moduleKey) return null;
  if (modules[moduleKey]) return null;

  // Prefer nav labels when present; fall back to module key.
  let moduleLabel: string = moduleKey;
  const navKeyMap: Partial<Record<string, string>> = {
    clients: 'clients',
    quotes: 'quotes',
    crm: 'crm',
    changes: 'changes',
    billing: 'billing',
    vendors: 'vendors',
    procurement: 'procurement',
    materials: 'materials',
    field_ops: 'fieldOps',
    safety: 'safety',
    forms: 'forms',
    documents: 'documents',
    assets: 'assets',
    compliance: 'compliance',
    approvals: 'approvals',
    month_close: 'monthClose',
    overhead: 'overhead',
    jobs: 'jobs',
    service: 'workOrders',
  };
  const labelKey = navKeyMap[moduleKey];
  if (labelKey) {
    try {
      moduleLabel = tNav(labelKey as 'clients');
    } catch {
      moduleLabel = moduleKey;
    }
  }

  return <HiddenCapabilityBanner moduleLabel={moduleLabel} />;
}
