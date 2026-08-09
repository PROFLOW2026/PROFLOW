'use client';

import { useActionState, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { InventoryMovementType } from '@/modules/assets/domain/types';
import { recordInventoryMovementAction, type AssetsFormState } from '../actions';

const NONE = '__none__';

export function InventoryMovementForm({
  inventoryItemId,
  movementType,
  defaultDate,
  projects = [],
  compact = false,
}: {
  inventoryItemId: string;
  movementType: InventoryMovementType;
  defaultDate: string;
  projects?: readonly { id: string; name: string }[];
  compact?: boolean;
}) {
  const t = useTranslations('assets.inventory');
  const tCommon = useTranslations('common');
  const [state, formAction, pending] = useActionState<AssetsFormState, FormData>(
    recordInventoryMovementAction,
    {},
  );
  const [projectId, setProjectId] = useState(NONE);

  const labelKey =
    movementType === 'receive'
      ? 'receive'
      : movementType === 'issue'
        ? 'issue'
        : movementType === 'return'
          ? 'return'
          : 'adjust';

  return (
    <form
      action={formAction}
      className={
        compact
          ? 'flex flex-wrap items-end gap-2'
          : 'flex max-w-xl flex-col gap-3 rounded-lg border border-[var(--pf-border-default)] p-3'
      }
    >
      <input type="hidden" name="inventoryItemId" value={inventoryItemId} />
      <input type="hidden" name="movementType" value={movementType} />
      <input type="hidden" name="projectId" value={projectId} />

      {!compact ? <p className="text-sm font-medium">{t(labelKey)}</p> : null}

      <div className={compact ? 'contents' : 'grid gap-3 sm:grid-cols-2'}>
        <Field label={t('movementQuantity')} className={compact ? 'w-24' : undefined}>
          {(control) => (
            <Input
              {...control}
              name="quantity"
              inputMode="decimal"
              numeric
              required
              defaultValue={movementType === 'adjust' ? '-1' : '1'}
            />
          )}
        </Field>
        <Field label={t('occurredOn')} className={compact ? 'w-40' : undefined}>
          {(control) => (
            <Input {...control} type="date" name="occurredOn" required defaultValue={defaultDate} />
          )}
        </Field>
      </div>

      {!compact && projects.length > 0 ? (
        <Field label={t('projectLabel')} optionalLabel={tCommon('labels.optional')}>
          {(control) => (
            <Select value={projectId} onValueChange={setProjectId}>
              <SelectTrigger id={control.id}>
                <SelectValue placeholder={t('projectNone')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>{t('projectNone')}</SelectItem>
                {projects.map((project) => (
                  <SelectItem key={project.id} value={project.id}>
                    {project.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </Field>
      ) : null}

      {!compact ? (
        <Field label={t('movementNotes')} optionalLabel={tCommon('labels.optional')}>
          {(control) => <Textarea {...control} name="notes" rows={2} />}
        </Field>
      ) : null}

      {movementType === 'adjust' && !compact ? (
        <p className="text-xs text-[var(--pf-text-secondary)]">{t('adjustQuantityHint')}</p>
      ) : null}

      <Button type="submit" size="sm" variant="secondary" disabled={pending} className="min-h-11 md:min-h-8">
        {pending ? t('pending') : compact ? t(labelKey) : t('submitMovement')}
      </Button>
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      {state.success && !compact ? (
        <Alert tone="success">{tCommon('states.saved')}</Alert>
      ) : null}
    </form>
  );
}
