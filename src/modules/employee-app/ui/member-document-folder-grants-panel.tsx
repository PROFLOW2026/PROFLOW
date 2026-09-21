'use client';

import { useActionState, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Field } from '@/components/ui/field';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DOCUMENT_CATEGORIES, type DocumentCategory } from '@/modules/documents/domain/categories';
import { saveMemberDocumentFolderGrantsAction } from '@/app/[locale]/(app)/settings/people/member-folder-grants-actions';
import type { SettingsActionState } from '@/app/[locale]/(app)/settings/actions';

type MemberRow = {
  readonly membershipId: string;
  readonly userId: string;
  readonly email: string;
  readonly displayName: string | null;
};

export function MemberDocumentFolderGrantsPanel({
  canManage,
  members,
  grantsByMembershipId,
}: {
  canManage: boolean;
  members: readonly MemberRow[];
  grantsByMembershipId: Readonly<Record<string, readonly DocumentCategory[]>>;
}) {
  const t = useTranslations('settings.people.folderGrants');
  const tDocCategories = useTranslations('documents.categories');
  const [selectedMembershipId, setSelectedMembershipId] = useState(members[0]?.membershipId ?? '');
  const [saveState, saveAction, savePending] = useActionState(
    saveMemberDocumentFolderGrantsAction,
    {} as SettingsActionState,
  );

  const selectedCategories = useMemo(() => {
    const configured = grantsByMembershipId[selectedMembershipId];
    if (configured === undefined) return new Set<DocumentCategory>(DOCUMENT_CATEGORIES);
    return new Set(configured);
  }, [grantsByMembershipId, selectedMembershipId]);

  const memberLabel = (member: MemberRow) => member.displayName || member.email;

  if (members.length === 0) return null;

  return (
    <section className="flex flex-col gap-4 border-t border-[var(--pf-border-default)] pt-5">
      <div>
        <h2 className="text-base font-semibold">{t('title')}</h2>
        <p className="mt-1 text-sm text-[var(--pf-text-secondary)]">{t('hint')}</p>
      </div>

      {saveState.error ? <Alert tone="danger">{saveState.error}</Alert> : null}
      {saveState.ok ? <Alert tone="success">{t('saved')}</Alert> : null}

      <Field label={t('member')}>
        {(control) => (
          <Select
            value={selectedMembershipId}
            onValueChange={setSelectedMembershipId}
            disabled={!canManage}
          >
            <SelectTrigger id={control.id}>
              <SelectValue placeholder={t('memberPlaceholder')} />
            </SelectTrigger>
            <SelectContent>
              {members.map((member) => (
                <SelectItem key={member.membershipId} value={member.membershipId}>
                  {memberLabel(member)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </Field>

      {canManage ? (
        <form key={selectedMembershipId} action={saveAction} className="flex flex-col gap-4">
          <input type="hidden" name="membershipId" value={selectedMembershipId} />
          <div className="grid gap-2 sm:grid-cols-2">
            {DOCUMENT_CATEGORIES.map((category) => (
              <label key={category} className="flex items-center gap-2 text-sm">
                <Checkbox
                  name="categories"
                  value={category}
                  defaultChecked={selectedCategories.has(category)}
                />
                <span>{tDocCategories(category)}</span>
              </label>
            ))}
          </div>
          <p className="text-sm text-[var(--pf-text-secondary)]">{t('emptyMeansAll')}</p>
          <Button type="submit" disabled={savePending}>
            {t('save')}
          </Button>
        </form>
      ) : (
        <ul className="flex flex-wrap gap-2 text-sm">
          {DOCUMENT_CATEGORIES.filter((category) => selectedCategories.has(category)).map((category) => (
            <li key={category} className="rounded-md bg-[var(--pf-surface-muted)] px-2 py-1">
              {tDocCategories(category)}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
