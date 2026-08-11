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
import {
  archiveEquipmentUsageAction,
  archiveMaterialUsageAction,
  recordEquipmentUsageAction,
  recordMaterialUsageAction,
  type AssetsFormState,
} from '@/app/[locale]/(app)/assets/actions';

const NONE = '__none__';

export interface UsageOption {
  readonly id: string;
  readonly name: string;
  readonly subtitle?: string | null;
}

export function MaterialUsageForm({
  projectId,
  defaultDate,
  materials = [],
  inventoryItems = [],
  employees = [],
  defaultInventoryItemId,
  projects,
}: {
  readonly projectId?: string;
  readonly defaultDate: string;
  readonly materials?: readonly UsageOption[];
  readonly inventoryItems?: readonly UsageOption[];
  readonly employees?: readonly UsageOption[];
  readonly defaultInventoryItemId?: string;
  /** When recording from inventory detail — pick project/job/WO. */
  readonly projects?: readonly UsageOption[];
}) {
  const t = useTranslations('assets.usage');
  const tCommon = useTranslations('common');
  const [resolvedProjectId, setResolvedProjectId] = useState<string>(
    projectId ?? projects?.[0]?.id ?? '',
  );
  const [materialId, setMaterialId] = useState<string>(NONE);
  const [inventoryItemId, setInventoryItemId] = useState<string>(
    defaultInventoryItemId ?? NONE,
  );
  const [employeeId, setEmployeeId] = useState<string>(NONE);
  const [state, formAction, pending] = useActionState<AssetsFormState, FormData>(
    recordMaterialUsageAction,
    {},
  );

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <p className="text-sm text-[var(--pf-text-secondary)]">{t('notActualHint')}</p>
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      {state.success ? <Alert tone="success">{t('materialSaved')}</Alert> : null}

      {projects && projects.length > 0 ? (
        <Field label={t('projectLabel')} required>
          {(control) => (
            <>
              <input type="hidden" name="projectId" value={resolvedProjectId} />
              <Select value={resolvedProjectId} onValueChange={setResolvedProjectId}>
                <SelectTrigger id={control.id} aria-describedby={control['aria-describedby']}>
                  <SelectValue placeholder={t('projectPlaceholder')} />
                </SelectTrigger>
                <SelectContent>
                  {projects.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </>
          )}
        </Field>
      ) : (
        <input type="hidden" name="projectId" value={projectId ?? ''} />
      )}

      <Field label={t('descriptionLabel')} required>
        {(control) => (
          <Input
            {...control}
            name="description"
            required
            maxLength={500}
            placeholder={t('descriptionPlaceholder')}
          />
        )}
      </Field>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t('quantityLabel')} required>
          {(control) => (
            <Input {...control} name="quantity" inputMode="decimal" required dir="ltr" />
          )}
        </Field>
        <Field label={t('unitLabel')}>
          {(control) => <Input {...control} name="unit" maxLength={32} />}
        </Field>
      </div>

      <Field label={t('usageDateLabel')} required>
        {(control) => (
          <Input
            {...control}
            name="usageDate"
            type="date"
            required
            defaultValue={defaultDate}
            dir="ltr"
          />
        )}
      </Field>

      {materials.length > 0 ? (
        <Field label={t('materialLabel')}>
          {(control) => (
            <>
              <input
                type="hidden"
                name="materialId"
                value={materialId === NONE ? '' : materialId}
              />
              <Select value={materialId} onValueChange={setMaterialId}>
                <SelectTrigger id={control.id} aria-describedby={control['aria-describedby']}>
                  <SelectValue placeholder={t('materialNone')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>{t('materialNone')}</SelectItem>
                  {materials.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.name}
                      {item.subtitle ? ` · ${item.subtitle}` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </>
          )}
        </Field>
      ) : null}

      {inventoryItems.length > 0 ? (
        <Field label={t('inventoryLabel')}>
          {(control) => (
            <>
              <input
                type="hidden"
                name="inventoryItemId"
                value={inventoryItemId === NONE ? '' : inventoryItemId}
              />
              <Select value={inventoryItemId} onValueChange={setInventoryItemId}>
                <SelectTrigger id={control.id} aria-describedby={control['aria-describedby']}>
                  <SelectValue placeholder={t('inventoryNone')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>{t('inventoryNone')}</SelectItem>
                  {inventoryItems.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.name}
                      {item.subtitle ? ` · ${item.subtitle}` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </>
          )}
        </Field>
      ) : null}

      {employees.length > 0 ? (
        <Field label={t('employeeLabel')}>
          {(control) => (
            <>
              <input
                type="hidden"
                name="employeeId"
                value={employeeId === NONE ? '' : employeeId}
              />
              <Select value={employeeId} onValueChange={setEmployeeId}>
                <SelectTrigger id={control.id} aria-describedby={control['aria-describedby']}>
                  <SelectValue placeholder={t('employeeNone')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>{t('employeeNone')}</SelectItem>
                  {employees.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </>
          )}
        </Field>
      ) : null}

      <Field label={t('notesLabel')}>
        {(control) => <Textarea {...control} name="notes" rows={2} maxLength={4000} />}
      </Field>

      <Button
        type="submit"
        disabled={pending || (!projectId && !resolvedProjectId)}
        className="self-start"
      >
        {pending ? tCommon('states.saving') : t('submitMaterial')}
      </Button>
    </form>
  );
}

export function EquipmentUsageForm({
  projectId,
  defaultDate,
  assets = [],
  employees = [],
  defaultAssetId,
  projects,
}: {
  readonly projectId?: string;
  readonly defaultDate: string;
  readonly assets?: readonly UsageOption[];
  readonly employees?: readonly UsageOption[];
  readonly defaultAssetId?: string;
  /** When recording from asset detail — pick project. */
  readonly projects?: readonly UsageOption[];
}) {
  const t = useTranslations('assets.usage');
  const tCommon = useTranslations('common');
  const [assetId, setAssetId] = useState<string>(defaultAssetId ?? assets[0]?.id ?? '');
  const [resolvedProjectId, setResolvedProjectId] = useState<string>(
    projectId ?? projects?.[0]?.id ?? '',
  );
  const [employeeId, setEmployeeId] = useState<string>(NONE);
  const [state, formAction, pending] = useActionState<AssetsFormState, FormData>(
    recordEquipmentUsageAction,
    {},
  );

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <p className="text-sm text-[var(--pf-text-secondary)]">{t('notActualHint')}</p>
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      {state.success ? <Alert tone="success">{t('equipmentSaved')}</Alert> : null}

      {projects && projects.length > 0 ? (
        <Field label={t('projectLabel')} required>
          {(control) => (
            <>
              <input type="hidden" name="projectId" value={resolvedProjectId} />
              <Select value={resolvedProjectId} onValueChange={setResolvedProjectId}>
                <SelectTrigger id={control.id} aria-describedby={control['aria-describedby']}>
                  <SelectValue placeholder={t('projectPlaceholder')} />
                </SelectTrigger>
                <SelectContent>
                  {projects.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </>
          )}
        </Field>
      ) : (
        <input type="hidden" name="projectId" value={projectId ?? ''} />
      )}

      {defaultAssetId ? (
        <input type="hidden" name="assetId" value={defaultAssetId} />
      ) : (
        <Field label={t('assetLabel')} required>
          {(control) => (
            <>
              <input type="hidden" name="assetId" value={assetId} />
              <Select value={assetId} onValueChange={setAssetId}>
                <SelectTrigger id={control.id} aria-describedby={control['aria-describedby']}>
                  <SelectValue placeholder={t('assetPlaceholder')} />
                </SelectTrigger>
                <SelectContent>
                  {assets.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.name}
                      {item.subtitle ? ` · ${item.subtitle}` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </>
          )}
        </Field>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t('usageDateLabel')} required>
          {(control) => (
            <Input
              {...control}
              name="usageDate"
              type="date"
              required
              defaultValue={defaultDate}
              dir="ltr"
            />
          )}
        </Field>
        <Field label={t('endDateLabel')}>
          {(control) => <Input {...control} name="endDate" type="date" dir="ltr" />}
        </Field>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Field label={t('hoursLabel')}>
          {(control) => <Input {...control} name="hours" inputMode="decimal" dir="ltr" />}
        </Field>
        <Field label={t('daysLabel')}>
          {(control) => <Input {...control} name="days" inputMode="decimal" dir="ltr" />}
        </Field>
        <Field label={t('mileageLabel')}>
          {(control) => <Input {...control} name="mileage" inputMode="decimal" dir="ltr" />}
        </Field>
      </div>

      {employees.length > 0 ? (
        <Field label={t('employeeLabel')}>
          {(control) => (
            <>
              <input
                type="hidden"
                name="employeeId"
                value={employeeId === NONE ? '' : employeeId}
              />
              <Select value={employeeId} onValueChange={setEmployeeId}>
                <SelectTrigger id={control.id} aria-describedby={control['aria-describedby']}>
                  <SelectValue placeholder={t('employeeNone')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>{t('employeeNone')}</SelectItem>
                  {employees.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </>
          )}
        </Field>
      ) : null}

      <Field label={t('notesLabel')}>
        {(control) => <Textarea {...control} name="notes" rows={2} maxLength={4000} />}
      </Field>

      <Button type="submit" disabled={pending || (!projectId && !resolvedProjectId)} className="self-start">
        {pending ? tCommon('states.saving') : t('submitEquipment')}
      </Button>
    </form>
  );
}

export function ArchiveMaterialUsageButton({ materialUsageId }: { readonly materialUsageId: string }) {
  const t = useTranslations('assets.usage');
  const tCommon = useTranslations('common');
  const [state, formAction, pending] = useActionState<AssetsFormState, FormData>(
    archiveMaterialUsageAction,
    {},
  );

  return (
    <form action={formAction}>
      <input type="hidden" name="materialUsageId" value={materialUsageId} />
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      <Button type="submit" size="sm" variant="ghost" disabled={pending}>
        {pending ? tCommon('states.saving') : t('archive')}
      </Button>
    </form>
  );
}

export function ArchiveEquipmentUsageButton({
  equipmentUsageId,
}: {
  readonly equipmentUsageId: string;
}) {
  const t = useTranslations('assets.usage');
  const tCommon = useTranslations('common');
  const [state, formAction, pending] = useActionState<AssetsFormState, FormData>(
    archiveEquipmentUsageAction,
    {},
  );

  return (
    <form action={formAction}>
      <input type="hidden" name="equipmentUsageId" value={equipmentUsageId} />
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      <Button type="submit" size="sm" variant="ghost" disabled={pending}>
        {pending ? tCommon('states.saving') : t('archive')}
      </Button>
    </form>
  );
}
