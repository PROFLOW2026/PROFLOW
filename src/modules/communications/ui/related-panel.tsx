import { getTranslations } from 'next-intl/server';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { listCommunications } from '@/modules/communications';
import { withOrgContext } from '@/shared/auth/session';
import { hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { Link } from '@/shared/i18n/navigation';
import { textNavLinkClassName } from '@/components/ui/pressable';
import type { CommunicationEntityType } from '../domain/types';

export async function RelatedCommunicationsPanel({
  projectId,
  clientId,
  vendorId,
  entityType,
  entityId,
}: {
  projectId?: string;
  clientId?: string;
  vendorId?: string;
  entityType?: CommunicationEntityType;
  entityId?: string;
}) {
  const t = await getTranslations('communications');
  const rows = await withOrgContext(async (context) => {
    if (!hasPermission(context, PERMISSIONS.COMMUNICATIONS_READ)) return [];
    try {
      return await listCommunications(context, {
        projectId,
        clientId,
        vendorId,
        relatedEntityType: entityType,
        relatedEntityId: entityId,
        limit: 8,
      });
    } catch {
      return [];
    }
  });

  if (rows.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t('history.relatedTitle')}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2 text-sm">
        {rows.map((row) => (
          <Link key={row.id} href={`/communications/${row.id}`} className={textNavLinkClassName}>
            {row.subject}
            <span className="ms-2 text-[var(--pf-text-muted)]">{t(`status.${row.status}`)}</span>
          </Link>
        ))}
      </CardContent>
    </Card>
  );
}
