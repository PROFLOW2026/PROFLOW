'use client';

import { useActionState } from 'react';
import { useTranslations } from 'next-intl';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  createWarrantyCoverageAction,
  createWarrantyIssueAction,
  createWarrantyWorkOrderAction,
  updateWarrantyIssueStatusAction,
  voidWarrantyCoverageAction,
  type WarrantyFormState,
} from '@/app/[locale]/(app)/warranty/actions';
import type { WarrantyCoverageType } from '../domain/types';

function FormError({ state }: { state: WarrantyFormState }) {
  if (!state.error) return null;
  return <Alert tone="danger">{state.error}</Alert>;
}

const SELECT_CLASS =
  'h-10 w-full rounded-md border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] px-3 text-sm';

export function CreateCoverageForm({
  projectId,
  workPackages,
  vendors,
}: {
  readonly projectId: string;
  readonly workPackages: readonly { id: string; name: string }[];
  readonly vendors: readonly { id: string; name: string }[];
}) {
  const t = useTranslations('warranty');
  const [state, action, pending] = useActionState(createWarrantyCoverageAction, {});
  const types: WarrantyCoverageType[] = ['workmanship', 'materials', 'equipment', 'mixed'];

  return (
    <form action={action} className="flex min-w-0 flex-col gap-3 rounded-lg border border-[var(--pf-border-default)] p-4">
      <input type="hidden" name="projectId" value={projectId} />
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      {state.success ? <Alert tone="success">{t('actions.created')}</Alert> : null}
      <Field label={t('coverage.title')} required>
        {(control) => <Input {...control} name="title" required maxLength={200} />}
      </Field>
      <Field label={t('coverage.type')}>
        {(control) => (
          <select {...control} name="coverageType" defaultValue="workmanship" className={SELECT_CLASS}>
            {types.map((type) => (
              <option key={type} value={type}>
                {t(`coverage.types.${type}`)}
              </option>
            ))}
          </select>
        )}
      </Field>
      {workPackages.length > 0 ? (
        <Field label={t('coverage.workPackage')}>
          {(control) => (
            <select {...control} name="workPackageId" className={SELECT_CLASS}>
              <option value="">{t('coverage.workPackage')}</option>
              {workPackages.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.name}
                </option>
              ))}
            </select>
          )}
        </Field>
      ) : null}
      {vendors.length > 0 ? (
        <Field label={t('coverage.vendor')}>
          {(control) => (
            <select {...control} name="vendorId" className={SELECT_CLASS}>
              <option value="">{t('coverage.vendor')}</option>
              {vendors.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.name}
                </option>
              ))}
            </select>
          )}
        </Field>
      ) : null}
      <div className="grid min-w-0 gap-3 sm:grid-cols-2">
        <Field label={t('coverage.start')}>
          {(control) => <Input {...control} name="startDate" type="date" />}
        </Field>
        <Field label={t('coverage.end')}>
          {(control) => <Input {...control} name="endDate" type="date" />}
        </Field>
      </div>
      <Field label={t('coverage.reminder')}>
        {(control) => <Input {...control} name="reminderDaysBefore" type="number" min={0} defaultValue={30} />}
      </Field>
      <Field label={t('coverage.notes')}>
        {(control) => <Textarea {...control} name="notes" rows={2} />}
      </Field>
      <Button type="submit" disabled={pending}>
        {t('list.new')}
      </Button>
    </form>
  );
}

export function VoidCoverageButton({
  coverageId,
  projectId,
}: {
  readonly coverageId: string;
  readonly projectId: string;
}) {
  const t = useTranslations('warranty');
  const [state, action, pending] = useActionState(voidWarrantyCoverageAction, {});
  return (
    <form action={action}>
      <input type="hidden" name="coverageId" value={coverageId} />
      <input type="hidden" name="projectId" value={projectId} />
      <FormError state={state} />
      <Button type="submit" variant="secondary" disabled={pending}>
        {t('actions.void')}
      </Button>
    </form>
  );
}

export function CreateIssueForm({
  coverageId,
  projectId,
}: {
  readonly coverageId: string;
  readonly projectId: string;
}) {
  const t = useTranslations('warranty');
  const [state, action, pending] = useActionState(createWarrantyIssueAction, {});
  return (
    <form action={action} className="flex min-w-0 flex-col gap-2">
      <input type="hidden" name="coverageId" value={coverageId} />
      <input type="hidden" name="projectId" value={projectId} />
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      {state.success ? <Alert tone="success">{t('actions.issueCreated')}</Alert> : null}
      <Field label={t('issue.title')} required>
        {(control) => <Input {...control} name="title" required maxLength={200} />}
      </Field>
      <Field label={t('coverage.notes')}>
        {(control) => <Textarea {...control} name="notes" rows={2} />}
      </Field>
      <Button type="submit" variant="secondary" disabled={pending}>
        {t('issue.new')}
      </Button>
    </form>
  );
}

export function IssueStatusButtons({
  issueId,
  projectId,
  status,
}: {
  readonly issueId: string;
  readonly projectId: string;
  readonly status: string;
}) {
  const t = useTranslations('warranty');
  const [state, action, pending] = useActionState(updateWarrantyIssueStatusAction, {});
  if (status === 'resolved' || status === 'cancelled') return null;
  return (
    <form action={action} className="flex flex-wrap gap-2">
      <input type="hidden" name="issueId" value={issueId} />
      <input type="hidden" name="projectId" value={projectId} />
      <input type="hidden" name="status" value="resolved" />
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      <Button type="submit" variant="secondary" disabled={pending}>
        {t('actions.resolve')}
      </Button>
    </form>
  );
}

export function CreateWorkOrderForm({
  issueId,
  projectId,
  title,
}: {
  readonly issueId: string;
  readonly projectId: string;
  readonly title: string;
}) {
  const t = useTranslations('warranty');
  const [state, action, pending] = useActionState(createWarrantyWorkOrderAction, {});
  return (
    <form action={action} className="flex min-w-0 flex-col gap-2">
      <input type="hidden" name="issueId" value={issueId} />
      <input type="hidden" name="projectId" value={projectId} />
      <input type="hidden" name="name" value={title} />
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      {state.success ? <Alert tone="success">{t('actions.workOrderCreated')}</Alert> : null}
      <Button type="submit" variant="secondary" disabled={pending}>
        {t('issue.createWorkOrder')}
      </Button>
    </form>
  );
}
