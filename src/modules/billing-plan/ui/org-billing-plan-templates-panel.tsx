'use client';

import { useActionState, useEffect, useState } from 'react';
import { useRouter } from '@/shared/i18n/navigation';
import { useTranslations } from 'next-intl';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  applyOrgTemplateAction,
  archiveOrgTemplateAction,
  saveOrgTemplateAction,
  type BillingPlanActionState,
} from './billing-plan-actions';

export interface OrgTemplateOption {
  readonly id: string;
  readonly name: string;
}

interface OrgBillingPlanTemplatesPanelProps {
  readonly projectId: string;
  readonly planId: string;
  readonly canManage: boolean;
  readonly templates: readonly OrgTemplateOption[];
}

export function OrgBillingPlanTemplatesPanel({
  projectId,
  planId,
  canManage,
  templates,
}: OrgBillingPlanTemplatesPanelProps) {
  const t = useTranslations('billingPlan');
  const tCommon = useTranslations('common');
  const router = useRouter();
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveState, saveAction, savePending] = useActionState<BillingPlanActionState, FormData>(
    saveOrgTemplateAction,
    {},
  );
  const [applyState, applyAction, applyPending] = useActionState<BillingPlanActionState, FormData>(
    applyOrgTemplateAction,
    {},
  );

  useEffect(() => {
    if (saveState.success) {
      setSaveOpen(false);
      router.refresh();
    }
  }, [saveState.success, router]);

  useEffect(() => {
    if (applyState.success) {
      router.refresh();
    }
  }, [applyState.success, router]);

  if (!canManage) return null;

  return (
    <section
      className="flex min-w-0 flex-col gap-3 rounded-md border border-[var(--pf-border-default)] p-4"
      data-testid="org-billing-plan-templates"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">{t('orgTemplates.listLabel')}</h3>
        <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
          <DialogTrigger asChild>
            <Button type="button" variant="secondary" data-testid="save-org-template-trigger">
              {t('orgTemplates.saveAction')}
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>{t('orgTemplates.saveTitle')}</DialogTitle>
              <DialogDescription>{t('orgTemplates.saveAction')}</DialogDescription>
            </DialogHeader>
            <form action={saveAction}>
              <DialogBody className="flex flex-col gap-3">
                {saveState.error ? <Alert tone="danger">{saveState.error}</Alert> : null}
                <input type="hidden" name="projectId" value={projectId} />
                <input type="hidden" name="planId" value={planId} />
                <Field label={t('orgTemplates.saveName')}>
                  {(control) => <Input {...control} name="name" required />}
                </Field>
              </DialogBody>
              <DialogFooter>
                <Button type="button" variant="ghost" onClick={() => setSaveOpen(false)}>
                  {tCommon('actions.cancel')}
                </Button>
                <Button type="submit" loading={savePending}>
                  {t('orgTemplates.saveAction')}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {applyState.error ? <Alert tone="danger">{applyState.error}</Alert> : null}

      {templates.length === 0 ? (
        <p className="text-sm text-[var(--pf-text-secondary)]">{t('orgTemplates.empty')}</p>
      ) : (
        <ul className="flex min-w-0 flex-col gap-2">
          {templates.map((template) => (
            <li
              key={template.id}
              className="flex min-w-0 flex-wrap items-center justify-between gap-2 rounded-md bg-[var(--pf-bg-muted)] px-3 py-2"
            >
              <span className="min-w-0 truncate text-sm font-medium">{template.name}</span>
              <div className="flex flex-wrap gap-2">
                <form action={applyAction}>
                  <input type="hidden" name="projectId" value={projectId} />
                  <input type="hidden" name="planId" value={planId} />
                  <input type="hidden" name="templateId" value={template.id} />
                  <input type="hidden" name="replaceExisting" value="true" />
                  <Button type="submit" variant="secondary" loading={applyPending}>
                    {t('orgTemplates.applyAction')}
                  </Button>
                </form>
                <form action={archiveOrgTemplateAction}>
                  <input type="hidden" name="projectId" value={projectId} />
                  <input type="hidden" name="templateId" value={template.id} />
                  <Button type="submit" variant="ghost">
                    {t('orgTemplates.archiveAction')}
                  </Button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
