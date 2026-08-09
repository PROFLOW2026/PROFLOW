'use client';

import { useTranslations } from 'next-intl';
import { useActionState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { DEFAULT_WORK_PACKAGE_NAME, type ProjectDetail } from '@/modules/projects';
import { addWorkPackageAction, splitProjectAction, type ProjectFormState } from '../actions';

interface WorkTabProps {
  detail: ProjectDetail;
}

export function WorkTab({ detail }: WorkTabProps) {
  const t = useTranslations('projects.workPackages');

  if (!detail.showWorkPackages) {
    return <SplitProjectForm projectId={detail.project.id} />;
  }

  return (
    <div className="flex flex-col gap-4">
      {detail.workPackages.map((pkg) => (
        <Card key={pkg.id}>
          <CardHeader>
            <CardTitle>
              {pkg.isDefault && pkg.name === DEFAULT_WORK_PACKAGE_NAME
                ? t('defaultName')
                : pkg.name}
            </CardTitle>
            {pkg.description ? <CardDescription>{pkg.description}</CardDescription> : null}
          </CardHeader>
          <CardContent>
            <p className="text-sm text-[var(--pf-text-secondary)]">
              {t('phases')}:{' '}
              {detail.phases.filter((phase) => phase.workPackageId === pkg.id).length === 0
                ? t('emptyPhases')
                : detail.phases
                    .filter((phase) => phase.workPackageId === pkg.id)
                    .map((phase) => phase.name)
                    .join(', ')}
            </p>
          </CardContent>
        </Card>
      ))}

      <AddWorkPackageForm projectId={detail.project.id} />
    </div>
  );
}

function SplitProjectForm({ projectId }: { projectId: string }) {
  const t = useTranslations('projects.workPackages');
  const tWork = useTranslations('projects.work');
  const [state, formAction, pending] = useActionState<ProjectFormState, FormData>(
    splitProjectAction,
    {},
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('splitCta')}</CardTitle>
        <CardDescription>{t('splitDescription')}</CardDescription>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="flex flex-col gap-4">
          <input type="hidden" name="projectId" value={projectId} />
          {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
          <Field label={t('renameDefault')}>
            {(control) => <Input {...control} name="defaultPackageName" />}
          </Field>
          <Field label={t('add')} description={t('splitDescription')}>
            {(control) => (
              <Textarea
                {...control}
                name="additionalPackages"
                rows={4}
                placeholder={tWork('areasPlaceholder')}
              />
            )}
          </Field>
          <Button type="submit" loading={pending}>
            {t('splitCta')}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function AddWorkPackageForm({ projectId }: { projectId: string }) {
  const t = useTranslations('projects.workPackages');
  const tCommon = useTranslations('common');
  const [state, formAction, pending] = useActionState<ProjectFormState, FormData>(
    addWorkPackageAction,
    {},
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('add')}</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="flex flex-col gap-3">
          <input type="hidden" name="projectId" value={projectId} />
          {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
          <Field label={tCommon('labels.name')} required>
            {(control) => <Input {...control} name="name" required />}
          </Field>
          <Button type="submit" loading={pending} variant="secondary">
            {t('add')}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
