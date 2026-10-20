import { AdaptiveListBody, MainAppPage, MainAppSection, mainAppListKitEnabled } from '@/components/patterns/main-app';
import { Plus } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { listAllChangeRequests } from '@/modules/commercial';
import { ChangeRequestList } from '@/modules/commercial/ui/change-request-list';
import { withOrgContext } from '@/shared/auth/session';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { Link } from '@/shared/i18n/navigation';
import { CommercialDocsHub } from '@/modules/quotes/ui/commercial-docs-hub';
import {
  orgListHasPermission,
  type OrgListSurface,
} from '@/modules/employee-app/application/org-list-permissions';

export interface ChangesOrgListViewProps {
  readonly routeBase: string;
  readonly surface: OrgListSurface;
}

export async function ChangesOrgListView({ routeBase, surface }: ChangesOrgListViewProps) {
  const t = await getTranslations('changes');
  const isOwner = surface === 'owner';
  const listKit = mainAppListKitEnabled(surface);

  const { items, canManage, canRead } = await withOrgContext(async (context) => {
    const allowed = orgListHasPermission(context, PERMISSIONS.CHANGES_READ, surface);
    if (!allowed) {
      return {
        items: [] as Awaited<ReturnType<typeof listAllChangeRequests>>,
        canManage: false,
        canRead: false,
      };
    }

    return {
      items: await listAllChangeRequests(context),
      canManage: orgListHasPermission(context, PERMISSIONS.CHANGES_MANAGE, surface),
      canRead: true,
    };
  });

  if (!canRead) {
    return (
      <MainAppPage>
        {isOwner ? (
          <PageHeader title={t('pageTitle')} description={t('pageDescription')} />
        ) : null}
        <MainAppSection>
          <EmptyState title={t('empty.title')} description={t('empty.description')} />
        </MainAppSection>
      </MainAppPage>
    );
  }

  return (
    <MainAppPage>
      {isOwner ? (
        <PageHeader
          title={t('pageTitle')}
          actions={
            canManage ? (
              <Button asChild className="max-w-full">
                <Link href={`${routeBase}/new`}>
                  <Plus aria-hidden />
                  {t('panel.new')}
                </Link>
              </Button>
            ) : null
          }
        />
      ) : null}

      <MainAppSection>
      {isOwner ? <CommercialDocsHub current="changes" /> : null}

      <AdaptiveListBody surface={surface}>
      <ChangeRequestList
        items={items}
        canManage={isOwner && canManage}
        routeBase={routeBase}
        listKit={listKit}
      />
      </AdaptiveListBody>
      </MainAppSection>
    </MainAppPage>
  );
}
