import { getTranslations } from 'next-intl/server';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { listProjectContracts } from '@/modules/projects';
import { withOrgContext } from '@/shared/auth/session';
import { hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { ProjectContractsClient } from './project-contracts-client';

interface ProjectContractsPanelProps {
  readonly projectId: string;
  readonly currency: string;
}

export async function ProjectContractsPanel({ projectId, currency }: ProjectContractsPanelProps) {
  const t = await getTranslations('projects.contracts');

  const view = await withOrgContext(async (context) => {
    if (!hasPermission(context, PERMISSIONS.CONTRACTS_READ)) {
      return { allowed: false as const, items: [], canManage: false };
    }
    const items = await listProjectContracts(context, { projectId });
    return {
      allowed: true as const,
      items,
      canManage: hasPermission(context, PERMISSIONS.CONTRACTS_MANAGE),
    };
  });

  if (!view.allowed) return null;

  return (
    <Card className="min-w-0 max-w-full">
      <CardHeader>
        <CardTitle>{t('title')}</CardTitle>
      </CardHeader>
      <CardContent>
        <ProjectContractsClient
          projectId={projectId}
          currency={currency}
          canManage={view.canManage}
          contracts={view.items.map((item) => ({
            id: item.contract.id,
            name: item.contract.name,
            contractNumber: item.contract.contractNumber,
            contractType: item.contract.contractType,
            isPrimary: item.contract.isPrimary,
            status: item.contract.status,
            originalValueAmount: item.originalValueAmount,
            currentValueAmount: item.currentValueAmount,
            currency: item.currency,
            startDate: item.contract.startDate,
            endDate: item.contract.endDate,
            retentionPercent: item.contract.retentionPercent,
            notes: item.contract.notes,
          }))}
        />
      </CardContent>
    </Card>
  );
}
