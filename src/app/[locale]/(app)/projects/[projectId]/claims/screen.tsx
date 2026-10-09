import { getTranslations } from 'next-intl/server';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { requireProjectCapabilityPage } from '@/modules/project-team/server';
import { listClaimableAgreements, listProjectClaims } from '@/modules/subcontract-claims';
import { ClaimsList } from '@/modules/subcontract-claims/ui/claims-list';
import { createClaimAction } from '@/modules/subcontract-claims/ui/actions';
import { loadOrNotFound } from '@/modules/subcontract-claims/ui/page-guard';
import { withOrgContext } from '@/shared/auth/session';
import { WithAppClientMessages } from '@/shared/i18n/with-client-messages';

export async function ProjectClaimsScreen({
  surfaceRoot,
  params,
  searchParams,
}: {
  surfaceRoot?: string;
  params: Promise<{ projectId: string }>;
  searchParams?: Promise<{ new?: string }>;
}) {
  const { projectId } = await params;
  const query = searchParams ? await searchParams : {};
  const wantsCreate = query.new === '1';
  const access = await requireProjectCapabilityPage(projectId, 'claim.view');
  const t = await getTranslations('subcontractClaims');
  const basePath = `${surfaceRoot ?? ('/projects/' + projectId)}/claims`;

  const data = await loadOrNotFound(() =>
    withOrgContext(async (context) => ({
      items: await listProjectClaims(context, projectId),
      agreements: access.has('claim.review') ? await listClaimableAgreements(context, projectId) : [],
    })),
  );

  const canOfferForm = access.has('claim.review') && data.agreements.some((agreement) => !agreement.hasOpenClaim);
  const blockedKey = !access.has('claim.review')
    ? 'errors.reviewRequired'
    : data.agreements.length > 0
      ? 'errors.openClaimExists'
      : 'list.empty';

  return (
    <WithAppClientMessages extra={['subcontractClaims']}>
      <div className="flex flex-col gap-6">
        <PageHeader title={t('list.pageTitle')} description={t('list.pageDescription')} />

        {canOfferForm ? (
          <Card>
            <CardHeader>
              <CardTitle>{t('list.pageTitle')}</CardTitle>
            </CardHeader>
            <CardContent>
              <form
                id={wantsCreate ? 'new-claim' : undefined}
                action={createClaimAction}
                className="flex max-w-md flex-col gap-3"
              >
                <input type="hidden" name="projectId" value={projectId} />
                <input type="hidden" name="basePath" value={basePath} />
                <label className="text-sm">
                  {t('deductions.agreement')}
                  <select name="agreementId" required className="mt-1 w-full rounded-md border px-3 py-2">
                    {data.agreements
                      .filter((a) => !a.hasOpenClaim)
                      .map((a) => (
                        <option key={a.agreementId} value={a.agreementId}>
                          {a.title} · {a.vendorName}
                        </option>
                      ))}
                  </select>
                </label>
                <label className="text-sm">
                  {t('list.period')} (start)
                  <input type="date" name="periodStart" required className="mt-1 w-full rounded-md border px-3 py-2" />
                </label>
                <label className="text-sm">
                  {t('list.period')} (end)
                  <input type="date" name="periodEnd" required className="mt-1 w-full rounded-md border px-3 py-2" />
                </label>
                <button type="submit" className="inline-flex min-h-11 items-center justify-center rounded-md bg-[var(--pf-teal-600)] px-4 text-sm font-medium text-white">
                  {t('common.save')}
                </button>
              </form>
            </CardContent>
          </Card>
        ) : wantsCreate ? (
          <p id="new-claim" className="text-sm text-[var(--pf-text-secondary)]" role="status">
            {t(blockedKey)}
          </p>
        ) : null}

        {data.items.length > 0 || !wantsCreate || canOfferForm ? (
          <ClaimsList items={data.items} basePath={basePath} />
        ) : null}
      </div>
    </WithAppClientMessages>
  );
}

export default function ProjectClaimsPage(
  props: Omit<Parameters<typeof ProjectClaimsScreen>[0], 'surfaceRoot'>,
) {
  return <ProjectClaimsScreen {...props} />;
}
