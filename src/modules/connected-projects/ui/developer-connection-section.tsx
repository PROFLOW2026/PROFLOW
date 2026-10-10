'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import type { ContractorAccessOverview } from '@/modules/contractor-access/application/manage-contractor-access';
import type { ConnectionInvitationSummary } from '../application/create-invitation';
import { DeveloperConnectionPanel, type DeveloperConnectionActionState } from './developer-connection-panel';
import { Field } from '@/components/ui/field';

const selectClassName =
  'min-h-11 w-full rounded-md border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] px-3 text-sm';

export function DeveloperConnectionSection(props: {
  readonly projectId: string;
  readonly overview: ContractorAccessOverview;
  readonly invitationsByAgreement: Readonly<Record<string, readonly ConnectionInvitationSummary[]>>;
  readonly actions: {
    readonly issue: (
      state: DeveloperConnectionActionState,
      formData: FormData,
    ) => Promise<DeveloperConnectionActionState>;
    readonly revoke: (
      state: DeveloperConnectionActionState,
      formData: FormData,
    ) => Promise<DeveloperConnectionActionState>;
  };
}) {
  const t = useTranslations('connectedProjects.developer');
  const [vendorId, setVendorId] = useState(props.overview.vendors[0]?.id ?? '');
  const [agreementId, setAgreementId] = useState('');

  const agreements = useMemo(
    () => props.overview.agreements.filter((row) => row.vendorId === vendorId),
    [props.overview.agreements, vendorId],
  );

  const invitations = agreementId ? (props.invitationsByAgreement[agreementId] ?? []) : [];

  if (!props.overview.authority.canInvite) return null;

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label={t('vendor')}>
          {(control) => (
            <select
              {...control}
              className={selectClassName}
              value={vendorId}
              onChange={(event) => {
                setVendorId(event.target.value);
                setAgreementId('');
              }}
            >
              {props.overview.vendors.map((vendor) => (
                <option key={vendor.id} value={vendor.id}>
                  {vendor.name}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field label={t('agreement')}>
          {(control) => (
            <select
              {...control}
              className={selectClassName}
              value={agreementId}
              onChange={(event) => setAgreementId(event.target.value)}
            >
              <option value="" disabled>
                —
              </option>
              {agreements.map((agreement) => (
                <option key={agreement.id} value={agreement.id}>
                  {agreement.title}
                </option>
              ))}
            </select>
          )}
        </Field>
      </div>
      <DeveloperConnectionPanel
        projectId={props.projectId}
        vendorId={vendorId}
        subcontractAgreementId={agreementId || null}
        invitations={invitations}
        canIssue={props.overview.authority.canInvite}
        actions={props.actions}
      />
    </div>
  );
}
