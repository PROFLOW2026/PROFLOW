'use client';

import { useActionState, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { InventoryReservationRecord } from '@/modules/assets';
import {
  releaseInventoryReservationAction,
  reserveInventoryAction,
  type AssetsFormState,
} from '../actions';

const NONE = '__none__';

export function InventoryReservationsPanel({
  items,
  reservations,
  projects,
  workOrders,
  canManage,
}: {
  items: readonly { id: string; name: string; unit: string }[];
  reservations: readonly (InventoryReservationRecord & { itemName?: string })[];
  projects: readonly { id: string; name: string }[];
  workOrders: readonly { id: string; name: string }[];
  canManage: boolean;
}) {
  const t = useTranslations('assets.inventory');
  const tCommon = useTranslations('common');
  const [state, formAction, pending] = useActionState<AssetsFormState, FormData>(
    reserveInventoryAction,
    {},
  );
  const [itemId, setItemId] = useState(items[0]?.id ?? '');
  const [projectId, setProjectId] = useState(NONE);
  const [workOrderId, setWorkOrderId] = useState(NONE);

  return (
    <section className="flex min-w-0 flex-col gap-3 rounded-lg border border-[var(--pf-border-default)] p-4">
      <div>
        <h2 className="text-lg font-semibold">{t('reservationsTitle')}</h2>
        <p className="text-sm text-[var(--pf-text-secondary)]">{t('reservationsHint')}</p>
      </div>

      {canManage && items.length > 0 ? (
        <form action={formAction} className="grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {state.error ? (
            <Alert tone="danger" className="sm:col-span-2 lg:col-span-4">
              {state.error}
            </Alert>
          ) : null}
          <Field label={t('nameLabel')} required>
            {(control) => (
              <>
                <input type="hidden" name="inventoryItemId" value={itemId} />
                <Select value={itemId} onValueChange={setItemId}>
                  <SelectTrigger id={control.id}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {items.map((item) => (
                      <SelectItem key={item.id} value={item.id}>
                        {item.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </>
            )}
          </Field>
          <Field label={t('reservationQuantity')} required>
            {(control) => (
              <Input {...control} name="quantity" inputMode="decimal" numeric required defaultValue="1" />
            )}
          </Field>
          <Field label={t('projectLabel')} optionalLabel={tCommon('labels.optional')}>
            {(control) => (
              <>
                <input type="hidden" name="projectId" value={projectId} />
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
              </>
            )}
          </Field>
          <Field label={t('workOrderLabel')} optionalLabel={tCommon('labels.optional')}>
            {(control) => (
              <>
                <input type="hidden" name="workOrderId" value={workOrderId} />
                <Select value={workOrderId} onValueChange={setWorkOrderId}>
                  <SelectTrigger id={control.id}>
                    <SelectValue placeholder={t('workOrderNone')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>{t('workOrderNone')}</SelectItem>
                    {workOrders.map((workOrder) => (
                      <SelectItem key={workOrder.id} value={workOrder.id}>
                        {workOrder.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </>
            )}
          </Field>
          <div className="flex items-end sm:col-span-2 lg:col-span-4">
            <Button type="submit" size="sm" loading={pending} className="min-h-11 md:min-h-8">
              {pending ? tCommon('states.saving') : t('reserveSubmit')}
            </Button>
          </div>
        </form>
      ) : null}

      {reservations.length === 0 ? (
        <p className="text-sm text-[var(--pf-text-secondary)]">{t('reservationsEmpty')}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {reservations.map((reservation) => (
            <ReservationRow
              key={reservation.id}
              reservation={reservation}
              canManage={canManage}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function ReservationRow({
  reservation,
  canManage,
}: {
  reservation: InventoryReservationRecord & { itemName?: string };
  canManage: boolean;
}) {
  const t = useTranslations('assets.inventory');
  const [state, formAction, pending] = useActionState<AssetsFormState, FormData>(
    releaseInventoryReservationAction,
    {},
  );

  return (
    <li className="flex min-w-0 flex-col gap-2 rounded-lg border border-[var(--pf-border-default)] p-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="font-medium">{reservation.itemName ?? reservation.inventoryItemId}</p>
        <p className="text-sm text-[var(--pf-text-secondary)]">
          <span dir="ltr">{reservation.quantity}</span>
          {' · '}
          {t(`reservationStatus.${reservation.status}`)}
        </p>
      </div>
      {canManage && reservation.status === 'active' ? (
        <form action={formAction}>
          <input type="hidden" name="reservationId" value={reservation.id} />
          <Button type="submit" size="sm" variant="ghost" loading={pending} className="min-h-11 md:min-h-8">
            {t('releaseReservation')}
          </Button>
          {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
        </form>
      ) : null}
    </li>
  );
}
