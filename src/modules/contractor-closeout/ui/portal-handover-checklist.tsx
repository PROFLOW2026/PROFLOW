'use client';

import { useTranslations } from 'next-intl';
import { ActionForm, FormField } from '@/modules/subcontracts/ui/action-form';
import { submitHandoverChecklistItemAction } from '@/app/[locale]/contractor/(portal)/projects/[projectId]/handover/actions';

type ChecklistItem = {
  readonly id: string;
  readonly title: string;
  readonly status: string;
};

export function PortalHandoverChecklist({
  organizationId,
  projectId,
  agreementId,
  vendorId,
  items,
}: {
  readonly organizationId: string;
  readonly projectId: string;
  readonly agreementId: string;
  readonly vendorId: string;
  readonly items: readonly ChecklistItem[];
}) {
  const t = useTranslations('handover');
  return (
    <ul className="mt-2 flex flex-col gap-3">
      {items.map((item) => (
        <li key={item.id} className="rounded-md border border-[var(--pf-border-subtle)] p-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <span className="font-medium">{item.title}</span>
            <span className="text-xs text-[var(--pf-text-muted)]">{t(`itemStatus.${item.status}`)}</span>
          </div>
          {item.status === 'pending' ? (
            <div className="mt-3">
              <ActionForm
                action={submitHandoverChecklistItemAction}
                hidden={{
                  organizationId,
                  projectId,
                  agreementId,
                  vendorId,
                  itemId: item.id,
                }}
                submitLabel={t('portal.submitItem')}
                successLabel={t('portal.itemSubmitted')}
              >
                <FormField label={t('portal.itemNotes')} name="notes" multiline />
              </ActionForm>
            </div>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
