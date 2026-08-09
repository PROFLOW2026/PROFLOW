import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { MoneyText } from '@/components/patterns/money-text';
import { PageHeader } from '@/components/ui/page-header';
import { StatusBadge, type StatusShape } from '@/components/ui/status-badge';
import { getEntityDocumentPanelData } from '@/modules/documents';
import { DocumentAttachments } from '@/modules/documents/ui';
import { getPurchaseOrderById, type PurchaseOrderStatus } from '@/modules/procurement';
import { money } from '@/shared/money/money';
import { withOrgContext } from '@/shared/auth/session';
import { Link } from '@/shared/i18n/navigation';
import { hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';

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
      return { ...detail, documentsPanel };
    } catch {
      return null;
    }
  });

  if (!data) notFound();

  const { order, lines, documentsPanel } = data;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={order.reference?.trim() || t('list.noReference')}
        description={t('detail.description')}
        breadcrumb={
          <Link href="/procurement" className="text-sm text-[var(--pf-text-secondary)] hover:underline">
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

      <div className="grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <p className="text-xs text-[var(--pf-text-muted)]">{t('list.columns.committed')}</p>
          <MoneyText value={money(order.committedAmount, order.currency)} />
        </div>
        <div>
          <p className="text-xs text-[var(--pf-text-muted)]">{t('list.columns.actions')}</p>
          <p>{lines.length}</p>
        </div>
      </div>

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
