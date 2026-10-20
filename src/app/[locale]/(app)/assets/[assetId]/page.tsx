import { notFound } from 'next/navigation';
import {
  MainAppPage,
  MainAppSection,
  MainAppSummaryGrid,
  MainAppSummaryItem,
} from '@/components/patterns/main-app';
import type { Metadata } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';
import { formatMoneyString } from '@/shared/money/format';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { StatusBadge, type StatusShape } from '@/components/ui/status-badge';
import { ResponsiveTable } from '@/components/patterns/responsive-table';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  getAssetById,
  listMaintenanceRecordsForAsset,
  type AssetStatus,
  type MaintenanceStatus,
} from '@/modules/assets';
import { getEntityDocumentPanelData } from '@/modules/documents';
import { DocumentAttachments } from '@/modules/documents/ui';
import { peekOpsExpenseLinksForRecords } from '@/modules/ops-finance';
import { CreateLinkedExpenseForm } from '@/modules/ops-finance/ui/create-linked-expense-form';
import { listProjectsForOrg } from '@/modules/projects';
import { listVendorsForOrg } from '@/modules/vendors';
import { withOrgContext } from '@/shared/auth/session';
import { Link } from '@/shared/i18n/navigation';
import { hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import {
  AssetAcquisitionForm,
  AssetAssignmentForm,
  AssetStatusForm,
} from './asset-manage-forms';
import { MaintenanceCreateForm, MaintenanceStatusForm } from './maintenance-create-form';
import { AssetEquipmentUsagePanel } from '@/modules/assets/ui';
import { textNavLinkMutedClassName } from '@/components/ui/pressable';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; assetId: string }>;
}): Promise<Metadata> {
  const { locale, assetId } = await params;
  const t = await getTranslations({ locale, namespace: 'assets' });
  try {
    const detail = await withOrgContext((context) => getAssetById(context, assetId));
    return { title: detail?.asset.name ?? t('title') };
  } catch {
    return { title: t('title') };
  }
}

const EMPTY = '—';

function assetShape(status: AssetStatus): StatusShape {
  switch (status) {
    case 'active':
      return 'active';
    case 'in_maintenance':
      return 'pending';
    case 'retired':
      return 'onHold';
    case 'disposed':
      return 'archived';
    default:
      return 'archived';
  }
}

function maintenanceShape(status: MaintenanceStatus): StatusShape {
  switch (status) {
    case 'planned':
      return 'pending';
    case 'in_progress':
      return 'active';
    case 'completed':
      return 'completed';
    case 'cancelled':
      return 'cancelled';
    default:
      return 'archived';
  }
}

function formatAssetCost(
  amount: string | null | undefined,
  currency: string | null | undefined,
  locale: string,
): string {
  if (!amount) return '-';
  if (!currency) return amount;
  return formatMoneyString(amount, currency, locale);
}

export default async function AssetDetailPage({
  params,
}: {
  params: Promise<{ assetId: string }>;
}) {
  const [{ assetId }, locale] = await Promise.all([params, getLocale()]);
  const t = await getTranslations('assets');
  const tAssetStatus = await getTranslations('status.asset');
  const tMaintStatus = await getTranslations('status.maintenance');

  const loaded = await withOrgContext(async (context) => {
    const detail = await getAssetById(context, assetId);
    if (!detail) return null;
    const [maintenance, projects, vendors, documentsPanel] = await Promise.all([
      listMaintenanceRecordsForAsset(context, assetId),
      listProjectsForOrg(context, { status: 'active' }).catch(() => []),
      listVendorsForOrg(context, { status: 'active' }).catch(() => []),
      getEntityDocumentPanelData(context, detail.documentsOwnerType, assetId),
    ]);
    const expenseLinks = await peekOpsExpenseLinksForRecords(
      context,
      'maintenance_record',
      maintenance.map((row) => row.id),
    );
    const linkedExpenseByMaintenanceId = new Map(
      expenseLinks.map((link) => [link.opsRecordId, link.expenseId] as const),
    );
    return {
      detail,
      maintenance,
      projects,
      vendors,
      documentsPanel,
      linkedExpenseByMaintenanceId,
      canManage: hasPermission(context, PERMISSIONS.ASSETS_MANAGE),
      canCreateExpense: hasPermission(context, PERMISSIONS.EXPENSES_CREATE),
      baseCurrency: context.organization.baseCurrency,
    };
  });

  if (!loaded) notFound();

  const { asset, fleet, documentsOwnerType } = loaded.detail;
  const { documentsPanel } = loaded;
  const assignedProject = loaded.projects.find((p) => p.id === asset.assignedProjectId);
  const vendorNameById = new Map(loaded.vendors.map((v) => [v.id, v.name]));

  return (
    <MainAppPage>
      <PageHeader
        title={asset.name}
        description={t(`kinds.${asset.assetKind}`)}
        breadcrumb={
          <Link href="/assets" className={textNavLinkMutedClassName}>
            {t('title')}
          </Link>
        }
        meta={
          <StatusBadge shape={assetShape(asset.status)} label={tAssetStatus(asset.status)} />
        }
      />
      <MainAppSection>
        <MainAppSummaryGrid>
          <MainAppSummaryItem label={t('detail.identifier')}>
            {asset.identifier ? (
              <span className="pf-ltr-island pf-entity-string" dir="ltr">
                {asset.identifier}
              </span>
            ) : (
              EMPTY
            )}
          </MainAppSummaryItem>
          <MainAppSummaryItem label={t('detail.manufacturer')}>
            {asset.manufacturer?.trim() ? asset.manufacturer : EMPTY}
          </MainAppSummaryItem>
          <MainAppSummaryItem label={t('detail.model')}>
            {asset.model?.trim() ? asset.model : EMPTY}
          </MainAppSummaryItem>
          <MainAppSummaryItem label={t('detail.serialNumber')}>
            {asset.serialNumber ? (
              <span className="pf-ltr-island pf-entity-string" dir="ltr">
                {asset.serialNumber}
              </span>
            ) : (
              EMPTY
            )}
          </MainAppSummaryItem>
          <MainAppSummaryItem label={t('detail.assignedProject')}>
            {assignedProject?.name ?? t('detail.unassigned')}
          </MainAppSummaryItem>
        </MainAppSummaryGrid>
        {asset.notes ? (
          <p className="text-sm text-[var(--pf-text-secondary)]">{asset.notes}</p>
        ) : null}
        {loaded.canManage ? (
          <AssetStatusForm assetId={asset.id} currentStatus={asset.status} />
        ) : null}
      </MainAppSection>

      <MainAppSection title={t('detail.acquisition')} description={t('detail.acquisitionHint')}>
        <MainAppSummaryGrid>
          <MainAppSummaryItem label={t('createAsset.acquisitionAmountLabel')}>
            {formatAssetCost(asset.acquisitionAmount, asset.acquisitionCurrency, locale)}
          </MainAppSummaryItem>
          <MainAppSummaryItem label={t('createAsset.acquiredOnLabel')}>
            {asset.acquiredOn ? (
              <span className="pf-ltr-island" dir="ltr">
                {asset.acquiredOn}
              </span>
            ) : (
              EMPTY
            )}
          </MainAppSummaryItem>
          <MainAppSummaryItem label={t('createAsset.sourceExpenseIdLabel')}>
            {asset.sourceExpenseId ? (
              <Link
                href={`/expenses/${asset.sourceExpenseId}`}
                className={`${textNavLinkMutedClassName} pf-ltr-island pf-entity-string`}
                dir="ltr"
              >
                {asset.sourceExpenseId}
              </Link>
            ) : (
              EMPTY
            )}
          </MainAppSummaryItem>
          <MainAppSummaryItem label={t('createAsset.sourceApBillIdLabel')}>
            {asset.sourceApBillId ? (
              <Link
                href={`/procurement/ap/${asset.sourceApBillId}`}
                className={`${textNavLinkMutedClassName} pf-ltr-island pf-entity-string`}
                dir="ltr"
              >
                {asset.sourceApBillId}
              </Link>
            ) : (
              EMPTY
            )}
          </MainAppSummaryItem>
        </MainAppSummaryGrid>
        {loaded.canManage ? (
          <AssetAcquisitionForm
            assetId={asset.id}
            acquisitionAmount={asset.acquisitionAmount}
            acquisitionCurrency={asset.acquisitionCurrency}
            acquiredOn={asset.acquiredOn}
            sourceExpenseId={asset.sourceExpenseId}
            sourceApBillId={asset.sourceApBillId}
            defaultCurrency={loaded.baseCurrency}
          />
        ) : null}
      </MainAppSection>

      {loaded.canManage ? (
        <MainAppSection title={t('detail.assignment')}>
          <AssetAssignmentForm
            assetId={asset.id}
            assignedProjectId={asset.assignedProjectId}
            projects={loaded.projects.map((p) => ({ id: p.id, name: p.name }))}
          />
        </MainAppSection>
      ) : null}

      <MainAppSection title={t('detail.fleet')}>
        {fleet ? (
          <MainAppSummaryGrid>
            <MainAppSummaryItem label={t('createAsset.plateNumberLabel')}>
              {fleet.plateNumber ? (
                <span className="pf-ltr-island pf-entity-string" dir="ltr">
                  {fleet.plateNumber}
                </span>
              ) : (
                EMPTY
              )}
            </MainAppSummaryItem>
            <MainAppSummaryItem label={t('createAsset.vinLabel')}>
              {fleet.vin ? (
                <span className="pf-ltr-island pf-entity-string" dir="ltr">
                  {fleet.vin}
                </span>
              ) : (
                EMPTY
              )}
            </MainAppSummaryItem>
            <MainAppSummaryItem label={t('createAsset.odometerLabel')}>
              {fleet.odometer ? (
                <span className="pf-numeric" dir="ltr">
                  {fleet.odometer}
                </span>
              ) : (
                EMPTY
              )}
            </MainAppSummaryItem>
          </MainAppSummaryGrid>
        ) : (
          <p className="text-sm text-[var(--pf-text-secondary)]">{t('detail.noFleet')}</p>
        )}
        {fleet?.notes ? (
          <p className="text-sm text-[var(--pf-text-secondary)]">{fleet.notes}</p>
        ) : null}
      </MainAppSection>

      <MainAppSection>
        <DocumentAttachments
          ownerType={documentsOwnerType}
          ownerId={asset.id}
          documents={documentsPanel.documents}
          linkCandidates={documentsPanel.linkCandidates}
          canRead={documentsPanel.canRead}
          canManage={documentsPanel.canManage}
          storageConfigured={documentsPanel.storageConfigured}
        />
      </MainAppSection>

      <MainAppSection>
        <AssetEquipmentUsagePanel assetId={asset.id} />
      </MainAppSection>

      <MainAppSection
        title={t('detail.history')}
        description={
          <>
            <span className="block">{t('detail.historyHint')}</span>
            <span className="block">{t('detail.maintenanceHint')}</span>
            <span className="block">{t('detail.createLinkedExpenseHint')}</span>
          </>
        }
      >

        {loaded.maintenance.length === 0 ? (
          <EmptyState size="sm" title={t('detail.emptyMaintenance')} description={t('detail.maintenanceHint')} className="py-6" />
        ) : (
          <ResponsiveTable
            items={loaded.maintenance}
            getRowKey={(row) => row.id}
            desktop={
              <div className="overflow-x-auto rounded-lg border border-[var(--pf-border-default)]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('detail.maintenanceTitle')}</TableHead>
                      <TableHead>{t('detail.maintenanceStatus')}</TableHead>
                      <TableHead>{t('detail.performedOn')}</TableHead>
                      <TableHead>{t('detail.vendor')}</TableHead>
                      <TableHead numeric>{t('detail.costAmount')}</TableHead>
                      <TableHead>{t('financeLink.create')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loaded.maintenance.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell className="font-medium">{row.title}</TableCell>
                        <TableCell>
                          {loaded.canManage ? (
                            <MaintenanceStatusForm
                              assetId={asset.id}
                              maintenanceRecordId={row.id}
                              currentStatus={row.status}
                            />
                          ) : (
                            <StatusBadge
                              shape={maintenanceShape(row.status)}
                              label={tMaintStatus(row.status)}
                            />
                          )}
                        </TableCell>
                        <TableCell>
                          {row.performedOn ? (
                            <span className="pf-ltr-island" dir="ltr">
                              {row.performedOn}
                            </span>
                          ) : (
                            '-'
                          )}
                        </TableCell>
                        <TableCell>
                          {row.vendorId ? (vendorNameById.get(row.vendorId) ?? '-') : '-'}
                        </TableCell>
                        <TableCell numeric>
                          {row.costAmount ? (
                            <>
                              <span>
                                {formatAssetCost(row.costAmount, row.currency, locale)}
                              </span>
                              <span className="mt-0.5 block text-xs text-[var(--pf-text-secondary)]">
                                {t('detail.costNotExpense')}
                              </span>
                            </>
                          ) : (
                            '-'
                          )}
                        </TableCell>
                        <TableCell>
                          {loaded.canCreateExpense && row.costAmount && row.currency ? (
                            <CreateLinkedExpenseForm
                              namespace="assets"
                              opsRecordKind="maintenance_record"
                              opsRecordId={row.id}
                              assetId={asset.id}
                              defaultAmount={row.costAmount}
                              defaultCurrency={row.currency}
                              defaultDescription={row.title}
                              existingExpenseId={
                                loaded.linkedExpenseByMaintenanceId.get(row.id) ?? null
                              }
                              compact
                            />
                          ) : loaded.linkedExpenseByMaintenanceId.get(row.id) ? (
                            <CreateLinkedExpenseForm
                              namespace="assets"
                              opsRecordKind="maintenance_record"
                              opsRecordId={row.id}
                              existingExpenseId={loaded.linkedExpenseByMaintenanceId.get(row.id)}
                              compact
                            />
                          ) : (
                            '-'
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            }
            renderMobileCard={(row) => (
              <div className="flex min-h-11 flex-col gap-2 rounded-lg border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] p-4">
                <div className="flex items-start justify-between gap-2">
                  <p className="min-w-0 flex-1 font-semibold">{row.title}</p>
                  {loaded.canManage ? null : (
                    <StatusBadge
                      shape={maintenanceShape(row.status)}
                      label={tMaintStatus(row.status)}
                    />
                  )}
                </div>
                <p className="text-sm text-[var(--pf-text-secondary)]">
                  {row.vendorId ? (vendorNameById.get(row.vendorId) ?? '-') : '-'}
                  {row.performedOn ? (
                    <>
                      {' · '}
                      <span className="pf-ltr-island" dir="ltr">
                        {row.performedOn}
                      </span>
                    </>
                  ) : null}
                  {row.costAmount ? (
                    <>
                      {' · '}
                      <span className="pf-numeric">
                        {formatAssetCost(row.costAmount, row.currency, locale)}
                      </span>
                    </>
                  ) : null}
                </p>
                {row.costAmount ? (
                  <p className="text-xs text-[var(--pf-text-secondary)]">{t('detail.costNotExpense')}</p>
                ) : null}
                {loaded.canManage ? (
                  <MaintenanceStatusForm
                    assetId={asset.id}
                    maintenanceRecordId={row.id}
                    currentStatus={row.status}
                  />
                ) : null}
                {loaded.canCreateExpense && row.costAmount && row.currency ? (
                  <CreateLinkedExpenseForm
                    namespace="assets"
                    opsRecordKind="maintenance_record"
                    opsRecordId={row.id}
                    assetId={asset.id}
                    defaultAmount={row.costAmount}
                    defaultCurrency={row.currency}
                    defaultDescription={row.title}
                    existingExpenseId={loaded.linkedExpenseByMaintenanceId.get(row.id) ?? null}
                    compact
                  />
                ) : loaded.linkedExpenseByMaintenanceId.get(row.id) ? (
                  <CreateLinkedExpenseForm
                    namespace="assets"
                    opsRecordKind="maintenance_record"
                    opsRecordId={row.id}
                    existingExpenseId={loaded.linkedExpenseByMaintenanceId.get(row.id)}
                    compact
                  />
                ) : null}
              </div>
            )}
          />
        )}

        {loaded.canManage ? (
          <div>
            <h3 className="mb-2 text-sm font-medium">{t('detail.newMaintenance')}</h3>
            <MaintenanceCreateForm
              assetId={asset.id}
              defaultCurrency={loaded.baseCurrency}
              vendors={loaded.vendors.map((v) => ({ id: v.id, name: v.name }))}
            />
          </div>
        ) : null}
      </MainAppSection>
    </MainAppPage>
  );
}
