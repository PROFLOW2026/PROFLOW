import type { Metadata } from 'next';

import { getTranslations } from 'next-intl/server';

import { notFound } from 'next/navigation';

import { PageHeader } from '@/components/ui/page-header';

import { Button } from '@/components/ui/button';

import { StatusBadge, type StatusShape } from '@/components/ui/status-badge';

import { getChangeRequestDetail, signedChangeAmount } from '@/modules/commercial';

import type { QuoteVersionStatus } from '@/modules/commercial/domain/types';

import { ChangeStatusBadge } from '@/modules/commercial/ui/change-status-badge';

import { MoneyText } from '@/components/patterns/money-text';

import { getShellContext, withOrgContext } from '@/shared/auth/session';

import { PERMISSIONS } from '@/shared/permissions/catalog';

import { Link } from '@/shared/i18n/navigation';

import { fromNumericString } from '@/shared/money/money';

import {

  cancelChangeAction,

  rejectChangeAction,

  submitForApprovalAction,

} from '../actions';

import { ChangeActionButtons } from './change-action-buttons';



const QUOTE_VERSION_SHAPES: Record<QuoteVersionStatus, StatusShape> = {

  draft: 'draft',

  issued: 'pending',

  accepted: 'approved',

  superseded: 'archived',

  rejected: 'rejected',

};



export async function generateMetadata({

  params,

}: {

  params: Promise<{ changeRequestId: string }>;

}): Promise<Metadata> {

  const { changeRequestId } = await params;

  const detail = await withOrgContext(async (context) =>

    getChangeRequestDetail(context, changeRequestId).catch(() => null),

  );

  return { title: detail?.title ?? 'Change request' };

}



export default async function ChangeDetailPage({

  params,

}: {

  params: Promise<{ changeRequestId: string }>;

}) {

  const t = await getTranslations('changes');

  const { changeRequestId } = await params;

  const shell = await getShellContext();



  const detail = await withOrgContext(async (context) =>

    getChangeRequestDetail(context, changeRequestId).catch(() => null),

  );



  if (!detail) notFound();



  const canManage = shell?.permissions.has(PERMISSIONS.CHANGES_MANAGE) ?? false;

  const canApprove = shell?.permissions.has(PERMISSIONS.CHANGES_APPROVE) ?? false;



  const selectedVersion = detail.quoteVersions.find((version) => version.isSelected);

  const raw = selectedVersion?.totalAmount ?? detail.requestedAmount;

  const magnitude = raw ? fromNumericString(raw, detail.currency) : null;

  const signed = magnitude ? signedChangeAmount(detail.direction, magnitude) : null;



  return (

    <div className="flex flex-col gap-6">

      <PageHeader

        title={detail.title}

        description={detail.description}

        meta={

          <>

            <ChangeStatusBadge status={detail.status} sentAt={detail.sentAt} />

            {detail.reference ? (

              <span className="font-mono text-xs text-[var(--pf-text-secondary)]">

                {detail.reference}

              </span>

            ) : null}

          </>

        }

        actions={

          <div className="flex flex-wrap gap-2">

            {canManage && detail.status === 'draft' ? (

              <Button asChild variant="secondary" size="sm">

                <Link href={`/changes/${changeRequestId}/price`}>{t('detail.price')}</Link>

              </Button>

            ) : null}

            {canApprove && detail.status === 'awaiting_approval' ? (

              <Button asChild size="sm">

                <Link href={`/changes/${changeRequestId}/approve`}>{t('detail.approve')}</Link>

              </Button>

            ) : null}

          </div>

        }

      />



      {signed ? (

        <div>

          <p className="text-sm text-[var(--pf-text-secondary)]">{t('detail.amount')}</p>

          <MoneyText value={signed} className="text-lg font-semibold" colorizeNegative />

        </div>

      ) : null}



      {detail.quoteVersions.length > 0 ? (

        <section className="flex flex-col gap-2">

          <h2 className="text-base font-semibold">{t('detail.versionsTitle')}</h2>

          <ul className="flex flex-col gap-2 text-sm">

            {detail.quoteVersions.map((version) => (

              <li

                key={version.id}

                className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-[var(--pf-border-default)] p-3"

              >

                <div className="flex flex-wrap items-center gap-2">

                  <span>{t('detail.version', { number: version.versionNumber })}</span>

                  <StatusBadge

                    shape={QUOTE_VERSION_SHAPES[version.status]}

                    label={t(`detail.quoteVersionStatus.${version.status}`)}

                  />

                </div>

                <MoneyText

                  value={fromNumericString(version.totalAmount, version.currency)!}

                />

              </li>

            ))}

          </ul>

        </section>

      ) : null}



      {detail.changeOrder ? (

        <section className="rounded-lg border border-[var(--pf-border-default)] p-4">

          <h2 className="text-base font-semibold">{t('detail.changeOrderTitle')}</h2>

          <p className="text-sm text-[var(--pf-text-secondary)]">

            {detail.changeOrder.reference}

          </p>

        </section>

      ) : null}



      {canManage ? (

        <ChangeActionButtons

          changeRequestId={changeRequestId}

          status={detail.status}

          submitAction={submitForApprovalAction}

          rejectAction={rejectChangeAction}

          cancelAction={cancelChangeAction}

        />

      ) : null}

    </div>

  );

}

