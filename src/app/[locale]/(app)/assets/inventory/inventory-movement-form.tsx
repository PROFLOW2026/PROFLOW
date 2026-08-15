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
import { LocationSelect } from './inventory-locations-panel';

const NONE = '__none__';

export function InventoryMovementForm({
  inventoryItemId,
  movementType,
  defaultDate,
  projects = [],
  reservations = [],
  locations = [],
  defaultLocationId,
  compact = false,
}: {
  inventoryItemId: string;
  movementType: InventoryMovementType;
  defaultDate: string;
  projects?: readonly { id: string; name: string }[];
  reservations?: readonly { id: string; quantity: string }[];
  locations?: readonly { id: string; name: string; code: string | null }[];
  defaultLocationId?: string;
  compact?: boolean;
}) {
  const t = useTranslations('assets.inventory');
  const tCommon = useTranslations('common');
  const [state, formAction, pending] = useActionState<AssetsFormState, FormData>(
    recordInventoryMovementAction,
    {},
  );
  const [projectId, setProjectId] = useState(NONE);
  const [reservationId, setReservationId] = useState(NONE);
  const fallbackLocation = defaultLocationId ?? locations[0]?.id ?? '';
  const [fromLocationId, setFromLocationId] = useState(fallbackLocation);
  const [toLocationId, setToLocationId] = useState(
    movementType === 'transfer'
      ? (locations.find((location) => location.id !== fallbackLocation)?.id ?? '')
      : fallbackLocation,
  );
  const [locationId, setLocationId] = useState(fallbackLocation);

  const labelKey =
    movementType === 'receive'
      ? 'receive'
      : movementType === 'issue'
        ? 'issue'
        : movementType === 'return'
          ? 'return'
          : movementType === 'transfer'
            ? 'transfer'
            : 'adjust';

  const showProject = movementType === 'issue' && !compact && projects.length > 0;
  const showFrom = movementType === 'issue' || movementType === 'transfer';
  const showTo =
    movementType === 'receive' || movementType === 'return' || movementType === 'transfer';
  const showSingleLocation = movementType === 'adjust';

  return (
    <form
      action={formAction}
      className={
        compact
          ? 'flex min-w-0 flex-wrap items-end gap-2'
          : 'flex w-full min-w-0 max-w-xl flex-col gap-3 rounded-lg border border-[var(--pf-border-default)] p-3'
      }
    >
      <input type="hidden" name="inventoryItemId" value={inventoryItemId} />
      <input type="hidden" name="movementType" value={movementType} />
      <input type="hidden" name="projectId" value={projectId} />
      <input type="hidden" name="reservationId" value={reservationId} />

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
        <Field label={t('occurredOn')} className={compact ? 'w-40 min-w-0' : undefined}>
          {(control) => (
            <Input
              {...control}
              type="date"
              name="occurredOn"
              required
              defaultValue={defaultDate}
              dir="ltr"
            />
          )}
        </Field>
      </div>

      {!compact && locations.length > 0 && showFrom ? (
        <Field label={t('fromLocation')} required={movementType === 'transfer'}>
          {(control) => (
            <LocationSelect
              id={control.id}
              name="fromLocationId"
              locations={locations}
              value={fromLocationId}
              onValueChange={setFromLocationId}
              placeholder={t('fromLocation')}
            />
          )}
        </Field>
      ) : null}

      {!compact && locations.length > 0 && showTo ? (
        <Field label={t('toLocation')} required={movementType === 'transfer'}>
          {(control) => (
            <LocationSelect
              id={control.id}
              name="toLocationId"
              locations={locations}
              value={toLocationId}
              onValueChange={setToLocationId}
              placeholder={t('toLocation')}
            />
          )}
        </Field>
      ) : null}

      {!compact && locations.length > 0 && showSingleLocation ? (
        <Field label={t('locationLabel')}>
          {(control) => (
            <LocationSelect
              id={control.id}
              name="locationId"
              locations={locations}
              value={locationId}
              onValueChange={setLocationId}
              placeholder={t('locationLabel')}
            />
          )}
        </Field>
      ) : null}

      {showProject ? (
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

      {movementType === 'issue' && !compact && reservations.length > 0 ? (
        <Field label={t('reservationLabel')} optionalLabel={tCommon('labels.optional')}>
          {(control) => (
            <Select value={reservationId} onValueChange={setReservationId}>
              <SelectTrigger id={control.id}>
                <SelectValue placeholder={t('reservationNone')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>{t('reservationNone')}</SelectItem>
                {reservations.map((reservation) => (
                  <SelectItem key={reservation.id} value={reservation.id}>
                    {reservation.quantity}
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

      {!compact ? (
        <p className="text-xs text-[var(--pf-text-secondary)]">{t('movementNotExpense')}</p>
      ) : null}

      <Button type="submit" size="sm" variant="secondary" loading={pending} className="min-h-11 md:min-h-8">
        {pending ? t('pending') : compact ? t(labelKey) : t('submitMovement')}
      </Button>
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      {state.success && !compact ? (
        <Alert tone="success">{tCommon('states.saved')}</Alert>
      ) : null}
    </form>
  );
}
