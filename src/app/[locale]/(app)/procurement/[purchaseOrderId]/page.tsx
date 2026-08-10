import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { MoneyText } from '@/components/patterns/money-text';
import { PageHeader } from '@/components/ui/page-header';
import { StatusBadge, type StatusShape } from '@/components/ui/status-badge';
import { getEntityDocumentPanelData } from '@/modules/documents';
import { DocumentAttachments } from '@/modules/documents/ui';
import { getPurchaseOrderById, isPurchaseOrderCancellable, isPurchaseOrderCloseable, type PurchaseOrderStatus } from '@/modules/procurement';
import { money } from '@/shared/money/money';
import { withOrgContext } from '@/shared/auth/session';
import { Link } from '@/shared/i18n/navigation';
import { hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { textNavLinkMutedClassName } from '@/components/ui/pressable';
import { CancelPurchaseOrderButton, ClosePurchaseOrderButton } from '../po-lifecycle-buttons';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'procurement' });
  return { title: t('detail.title') };
}

function orderStatusShape(status: string): StatusShape {
  switch (status as PurchaseOrderStatus) {
    case 'draft':
      return 'draft';
    case 'issued':
      return 'active';
    case 'partially_received':
      return 'pending';
    case 'closed':
      return 'completed';
    case 'cancelled':
      return 'cancelled';
    default:
      return 'archived';
  }
}

export default async function PurchaseOrderDetailPage({
  params,
}: {
  params: Promise<{ purchaseOrderId: string }>;
}) {
  const { purchaseOrderId } = await params;
  const t = await getTranslations('procurement');

  const data = await withOrgContext(async (context) => {
    if (!hasPermission(context, PERMISSIONS.PROCUREMENT_READ)) return null;
    try {
      const detail = await getPurchaseOrderById(context, purchaseOrderId);
      const documentsPanel = await getEntityDocumentPanelData(
        context,
        'purchase_order',
        purchaseOrderId,
      );
      return {
        ...detail,
        documentsPanel,
        canManage: hasPermission(context, PERMISSIONS.PROCUREMENT_MANAGE),
      };
    } catch {
      return null;
    }
  });

  if (!data) notFound();

  const { order, lines, documentsPanel, canManage } = data;
  const status = order.status as PurchaseOrderStatus;
  const showCancel = canManage && isPurchaseOrderCancellable(status);
  const showClose = canManage && isPurchaseOrderCloseable(status);

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <PageHeader
        title={order.reference?.trim() || t('list.noReference')}
        description={t('detail.description')}
        breadcrumb={
          <Link
            href="/procurement"
            className={textNavLinkMutedClassName}
          >
            {t('title')}
          </Link>
        }
        meta={
          <StatusBadge
            shape={orderStatusShape(order.status)}
            label={t(`statuses.${order.status}` as 'statuses.draft')}
          />
        }
      />

      <div className="grid min-w-0 gap-3 text-sm sm:grid-cols-2">
        <div className="min-w-0">
          <p className="text-xs text-[var(--pf-text-muted)]">{t('list.columns.committed')}</p>
          <MoneyText value={money(order.committedAmount, order.currency)} />
        </div>
        <div className="min-w-0">
          <p className="text-xs text-[var(--pf-text-muted)]">{t('list.columns.actions')}</p>
          <p dir="ltr">{lines.length}</p>
        </div>
      </div>

      {showCancel || showClose ? (
        <div className="flex flex-wrap gap-2">
          {showClose ? <ClosePurchaseOrderButton purchaseOrderId={order.id} /> : null}
          {showCancel ? <CancelPurchaseOrderButton purchaseOrderId={order.id} /> : null}
        </div>
      ) : null}

      <DocumentAttachments
        ownerType="purchase_order"
        ownerId={order.id}
        documents={documentsPanel.documents}
        linkCandidates={documentsPanel.linkCandidates}
        canRead={documentsPanel.canRead}
        canManage={documentsPanel.canManage}
        storageConfigured={documentsPanel.storageConfigured}
      />
    </div>
  );
}
