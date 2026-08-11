import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
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
import { AssetAssignmentForm, AssetStatusForm } from './asset-manage-forms';
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

export default async function AssetDetailPage({
  params,
}: {
  params: Promise<{ assetId: string }>;
}) {
  const { assetId } = await params;
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
    <div className="flex flex-col gap-6">
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

      <section className="rounded-lg border border-[var(--pf-border-default)] p-4">
        <h2 className="font-semibold">{t('detail.registry')}</h2>
        <dl className="mt-2 grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <dt className="text-[var(--pf-text-secondary)]">{t('detail.identifier')}</dt>
            <dd>
              {asset.identifier ? (
                <span className="pf-ltr-island pf-entity-string" dir="ltr">
                  {asset.identifier}
                </span>
              ) : (
                '—'
              )}
            </dd>
          </div>
          <div>
            <dt className="text-[var(--pf-text-secondary)]">{t('detail.manufacturer')}</dt>
            <dd>{asset.manufacturer ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-[var(--pf-text-secondary)]">{t('detail.model')}</dt>
            <dd>{asset.model ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-[var(--pf-text-secondary)]">{t('detail.serialNumber')}</dt>
            <dd>
              {asset.serialNumber ? (
                <span className="pf-ltr-island pf-entity-string" dir="ltr">
                  {asset.serialNumber}
                </span>
              ) : (
                '—'
              )}
            </dd>
          </div>
          <div>
            <dt className="text-[var(--pf-text-secondary)]">{t('detail.assignedProject')}</dt>
            <dd>{assignedProject?.name ?? t('detail.unassigned')}</dd>
          </div>
          {asset.notes ? (
            <div className="sm:col-span-2 lg:col-span-3">
              <dt className="text-[var(--pf-text-secondary)]">{t('createAsset.notesLabel')}</dt>
              <dd>{asset.notes}</dd>
            </div>
          ) : null}
        </dl>
        {loaded.canManage ? (
          <div className="mt-4">
            <AssetStatusForm assetId={asset.id} currentStatus={asset.status} />
          </div>
        ) : null}
      </section>

      {loaded.canManage ? (
        <section className="rounded-lg border border-[var(--pf-border-default)] p-4">
          <h2 className="font-semibold">{t('detail.assignment')}</h2>
          <div className="mt-3">
            <AssetAssignmentForm
              assetId={asset.id}
              assignedProjectId={asset.assignedProjectId}
              projects={loaded.projects.map((p) => ({ id: p.id, name: p.name }))}
            />
          </div>
        </section>
      ) : null}

      <section className="rounded-lg border border-[var(--pf-border-default)] p-4">
        <h2 className="font-semibold">{t('detail.fleet')}</h2>
        {fleet ? (
          <dl className="mt-2 grid gap-2 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-[var(--pf-text-secondary)]">{t('createAsset.plateNumberLabel')}</dt>
              <dd>
                {fleet.plateNumber ? (
                  <span className="pf-ltr-island pf-entity-string" dir="ltr">
                    {fleet.plateNumber}
                  </span>
                ) : (
                  '—'
                )}
              </dd>
            </div>
            <div>
              <dt className="text-[var(--pf-text-secondary)]">{t('createAsset.vinLabel')}</dt>
              <dd>
                {fleet.vin ? (
                  <span className="pf-ltr-island pf-entity-string" dir="ltr">
                    {fleet.vin}
                  </span>
                ) : (
                  '—'
                )}
              </dd>
            </div>
            <div>
              <dt className="text-[var(--pf-text-secondary)]">{t('createAsset.odometerLabel')}</dt>
              <dd>
                {fleet.odometer ? (
                  <span className="pf-numeric" dir="ltr">
                    {fleet.odometer}
                  </span>
                ) : (
                  '—'
                )}
              </dd>
            </div>
            {fleet.notes ? (
              <div className="sm:col-span-3">
                <dt className="text-[var(--pf-text-secondary)]">{t('createAsset.notesLabel')}</dt>
                <dd>{fleet.notes}</dd>
              </div>
            ) : null}
          </dl>
        ) : (
          <p className="mt-2 text-sm text-[var(--pf-text-secondary)]">{t('detail.noFleet')}</p>
        )}
      </section>

      <DocumentAttachments
        ownerType={documentsOwnerType}
        ownerId={asset.id}
        documents={documentsPanel.documents}
        linkCandidates={documentsPanel.linkCandidates}
        canRead={documentsPanel.canRead}
        canManage={documentsPanel.canManage}
        storageConfigured={documentsPanel.storageConfigured}
      />

      <AssetEquipmentUsagePanel assetId={asset.id} />

      <section className="flex flex-col gap-4">
        <div>
          <h2 className="font-semibold">{t('detail.history')}</h2>
          <p className="text-sm text-[var(--pf-text-secondary)]">{t('detail.historyHint')}</p>
          <p className="text-sm text-[var(--pf-text-secondary)]">{t('detail.maintenanceHint')}</p>
          <p className="text-sm text-[var(--pf-text-secondary)]">{t('detail.createLinkedExpenseHint')}</p>
        </div>

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
                            '—'
                          )}
                        </TableCell>
                        <TableCell>
                          {row.vendorId ? (vendorNameById.get(row.vendorId) ?? '—') : '—'}
                        </TableCell>
                        <TableCell numeric>
                          {row.costAmount ? (
                            <>
                              <span dir="ltr">
                                {`${row.costAmount}${row.currency ? ` ${row.currency}` : ''}`}
                              </span>
                              <span className="mt-0.5 block text-xs text-[var(--pf-text-secondary)]">
                                {t('detail.costNotExpense')}
                              </span>
                            </>
                          ) : (
                            '—'
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
                            '—'
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
                  {row.vendorId ? (vendorNameById.get(row.vendorId) ?? '—') : '—'}
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
                      <span className="pf-numeric" dir="ltr">
                        {`${row.costAmount}${row.currency ? ` ${row.currency}` : ''}`}
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
      </section>
    </div>
  );
}
