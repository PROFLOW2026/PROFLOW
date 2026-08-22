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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { listProfessionStarterTemplates } from '@/modules/billing-plan/domain/templates';
import {
  createBillingPlanAction,
  type BillingPlanActionState,
} from './billing-plan-actions';

type CreateMode = 'blank' | 'simple' | 'template';

interface CreateBillingPlanDialogProps {
  readonly projectId: string;
  readonly contractId: string;
  readonly triggerLabel: string;
  readonly defaultOpen?: boolean;
  readonly simplified?: boolean;
  readonly orgTemplates?: readonly { id: string; name: string }[];
}

export function CreateBillingPlanDialog({
  projectId,
  contractId,
  triggerLabel,
  defaultOpen = false,
  simplified = false,
  orgTemplates = [],
}: CreateBillingPlanDialogProps) {
  const t = useTranslations('billingPlan');
  const tCommon = useTranslations('common');
  const router = useRouter();
  const [open, setOpen] = useState(defaultOpen);
  const [mode, setMode] = useState<CreateMode>(simplified ? 'simple' : 'blank');
  const [templateKey, setTemplateKey] = useState('small_works');
  const isOrgTemplate = templateKey.startsWith('org:');
  const selectedOrgTemplateId = isOrgTemplate ? templateKey.slice(4) : '';
  const [state, formAction, pending] = useActionState<BillingPlanActionState, FormData>(
    createBillingPlanAction,
    {},
  );
  const dialogOpen = state.success ? false : open;

  useEffect(() => {
    if (state.success) {
      router.refresh();
    }
  }, [state.success, router]);

  const templates = listProfessionStarterTemplates();

  return (
    <Dialog
      open={dialogOpen}
      onOpenChange={(next) => {
        if (!state.success) setOpen(next);
      }}
    >      <DialogTrigger asChild>
        <Button type="button">{triggerLabel}</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('create.title')}</DialogTitle>
          <DialogDescription>{t('create.description')}</DialogDescription>
        </DialogHeader>
        <form action={formAction}>
          <DialogBody className="flex flex-col gap-4">
            {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
            <input type="hidden" name="projectId" value={projectId} />
            <input type="hidden" name="contractId" value={contractId} />
            <input type="hidden" name="mode" value={mode} />
            <input type="hidden" name="activate" value="false" />

            <Field label={t('fields.name')}>
              {(control) => (
                <Input
                  {...control}
                  name="name"
                  placeholder={t('create.namePlaceholder')}
                  defaultValue={t('create.namePlaceholder')}
                />
              )}
            </Field>

            <fieldset className="flex flex-col gap-2">
              <legend className="text-sm font-medium">{t('create.title')}</legend>
              {(
                [
                  ['blank', t('create.modeBlank')],
                  ['simple', t('create.modeSimple')],
                  ['template', t('create.modeTemplate')],
                ] as const
              )
                .filter(([value]) => !(simplified && value === 'blank'))
                .map(([value, label]) => (
                  <label key={value} className="flex items-center gap-2 text-sm">
                    <input
                      type="radio"
                      name="modeRadio"
                      data-testid={`billing-plan-create-mode-${value}`}
                      checked={mode === value}
                      onChange={() => setMode(value)}
                    />
                    {label}
                  </label>
                ))}
            </fieldset>

            {mode === 'template' ? (
              <Field label={t('create.templateLabel')}>
                {(control) => (
                  <>
                    <input type="hidden" name="professionTemplateKey" value={isOrgTemplate ? '' : templateKey} />
                    <input type="hidden" name="templateId" value={selectedOrgTemplateId} />
                    <Select value={templateKey} onValueChange={setTemplateKey}>
                      <SelectTrigger id={control.id}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {templates.map((tpl) => (
                          <SelectItem key={tpl.key} value={tpl.key}>
                            {t(tpl.nameKey.replace(/^billingPlan\./, '') as never)}
                          </SelectItem>
                        ))}
                        {orgTemplates.map((tpl) => (
                          <SelectItem key={tpl.id} value={`org:${tpl.id}`}>
                            {tpl.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </>
                )}
              </Field>
            ) : null}
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              {tCommon('actions.cancel')}
            </Button>
            <Button type="submit" loading={pending}>
              {t('actions.createPlan')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
