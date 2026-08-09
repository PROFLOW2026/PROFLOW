import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Card } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { StatusBadge } from '@/components/ui/status-badge';
import { MoneyText } from '@/components/patterns/money-text';
import { listCustomFieldValuesForEntity } from '@/modules/custom-fields';
import { EntityCustomFieldsPanel } from '@/modules/custom-fields/ui';
import { getEntityDocumentPanelData } from '@/modules/documents';
import { DocumentAttachments } from '@/modules/documents/ui';
import { getEmployee, listRateHistory, resolveRateVersionForDate } from '@/modules/workforce';
import { RateHistoryTable } from '@/modules/workforce/ui/rate-history-table';
import { withOrgContext } from '@/shared/auth/session';
import { businessDate, todayInTimeZone } from '@/shared/dates';
import { fromNumericString } from '@/shared/money';
import { upsertEntityFieldValueAction } from '../../../settings/custom-fields/actions';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; employeeId: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'workforce' });
  return { title: t('employees.detail.title') };
}

export default async function EmployeeDetailPage({
  params,
}: {
  params: Promise<{ employeeId: string }>;
}) {
  const { employeeId } = await params;
  const t = await getTranslations('workforce');

  const data = await withOrgContext(async (context) => {
    try {
      const employee = await getEmployee(context, employeeId);
      const [rateHistory, documentsPanel, customFields] = await Promise.all([
        listRateHistory(context, employeeId),
        getEntityDocumentPanelData(context, 'employee', employeeId),
        listCustomFieldValuesForEntity(context, 'employee', employeeId).catch(() => []),
      ]);
      const today = todayInTimeZone(context.organization.timezone);
      const currentRate = resolveRateVersionForDate(employee.rateVersions, businessDate(today));
      return { employee, rateHistory, currentRate, today, documentsPanel, customFields };
    } catch {
      return null;
    }
  });

  if (!data) notFound();

  const { employee, rateHistory, currentRate, documentsPanel, customFields } = data;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={employee.name}
        meta={
          <StatusBadge
            shape={employee.status === 'active' ? 'active' : 'archived'}
            label={t(`employeeStatus.${employee.status}`)}
          />
        }
        description={employee.jobTitle ?? undefined}
      />

      <Card className="flex flex-col gap-3 p-4 sm:p-6">
        <h2 className="text-base font-semibold">{t('employees.detail.currentRate')}</h2>
        {currentRate ? (
          <div className="flex flex-col gap-1 text-sm">
            <p>
              <MoneyText
                value={fromNumericString(currentRate.baseRate, currentRate.currency) ?? {
                  amount: currentRate.baseRate,
                  currency: currentRate.currency,
                }}
              />
              {' · '}
              {t(`rateUnits.${currentRate.rateUnit}`)}
            </p>
            {currentRate.burdenPercent ? (
              <p className="text-[var(--pf-text-secondary)]">
                {t('employees.detail.burden', { percent: currentRate.burdenPercent })}
              </p>
            ) : null}
          </div>
        ) : (
          <p className="text-sm text-[var(--pf-text-secondary)]">{t('employees.noRate')}</p>
        )}
      </Card>

      {(employee.email || employee.phone || employee.notes) && (
        <Card className="flex flex-col gap-2 p-4 sm:p-6">
          <h2 className="text-base font-semibold">{t('employees.detail.profile')}</h2>
          {employee.email ? <p className="text-sm">{employee.email}</p> : null}
          {employee.phone ? <p className="text-sm">{employee.phone}</p> : null}
          {employee.notes ? (
            <p className="text-sm text-[var(--pf-text-secondary)]">{employee.notes}</p>
          ) : null}
        </Card>
      )}

      <EntityCustomFieldsPanel
        entityId={employee.id}
        fields={customFields}
        revalidatePath={`/workforce/employees/${employee.id}`}
        saveAction={upsertEntityFieldValueAction}
      />

      <Card className="flex flex-col gap-3 p-4 sm:p-6">
        <h2 className="text-base font-semibold">{t('employees.detail.rateHistory')}</h2>
        <RateHistoryTable versions={rateHistory} />
      </Card>

      <DocumentAttachments
        ownerType="employee"
        ownerId={employee.id}
        documents={documentsPanel.documents}
        linkCandidates={documentsPanel.linkCandidates}
        canRead={documentsPanel.canRead}
        canManage={documentsPanel.canManage}
        storageConfigured={documentsPanel.storageConfigured}
      />
    </div>
  );
}
