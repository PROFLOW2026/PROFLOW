import { getTranslations } from 'next-intl/server';
import { Card } from '@/components/ui/card';
import {
  listProjectVendorEngagementHistory,
  listProjectVendorEngagements,
  listVendorsForOrg,
} from '@/modules/vendors';
import { withOrgContext } from '@/shared/auth/session';
import { todayInTimeZone } from '@/shared/dates';
import { hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { ProjectContractorsRoster } from './project-contractors-roster';

export interface ProjectContractorsPanelProps {
  readonly projectId: string;
}

/**
 * Optional Project → contractors / vendors section (overview embed).
 * Gated by vendors.read / vendors.manage. Engagement ≠ cost.
 */
export async function ProjectContractorsPanel({ projectId }: ProjectContractorsPanelProps) {
  const t = await getTranslations('vendors.projectPanel');

  const data = await withOrgContext(async (context) => {
    if (!hasPermission(context, PERMISSIONS.VENDORS_READ)) {
      return null;
    }

    const allowManage = hasPermission(context, PERMISSIONS.VENDORS_MANAGE);
    const [engagements, history, vendors] = await Promise.all([
      listProjectVendorEngagements(context, projectId),
      listProjectVendorEngagementHistory(context, projectId).catch(() => []),
      allowManage
        ? listVendorsForOrg(context, { status: 'active' })
        : Promise.resolve([]),
    ]);

    return {
      engagements,
      history,
      candidateVendors: vendors.map((vendor) => ({
        id: vendor.id,
        name: vendor.name,
        type: vendor.type,
      })),
      allowManage,
      defaultStartDate: todayInTimeZone(context.organization.timezone),
    };
  });

  if (!data) return null;

  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-col gap-4 p-4 sm:p-6">
        <ProjectContractorsRoster
          projectId={projectId}
          engagements={data.engagements}
          history={data.history}
          candidateVendors={data.candidateVendors}
          canManage={data.allowManage}
          defaultStartDate={data.defaultStartDate}
        />
      </Card>
      <p className="text-start text-sm text-[var(--pf-text-muted)]">{t('engagementNote')}</p>
    </div>
  );
}
