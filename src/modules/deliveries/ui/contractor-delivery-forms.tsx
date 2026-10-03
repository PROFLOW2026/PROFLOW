'use client';

import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useRouter } from '@/shared/i18n/navigation';
import { createDeliveryFromPortalAction, reportDeliveryFromPortalAction } from '../actions/external-actions';
import type { DeliveryWithStatus } from '../domain/types';

export function ContractorDeliveryCreateForm({
  organizationId,
  projectId,
}: {
  organizationId: string;
  projectId: string;
}) {
  const t = useTranslations('deliveries');
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [itemName, setItemName] = useState('');
  const [expectedDate, setExpectedDate] = useState('');

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('portal.registerTitle')}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {error ? <p className="text-sm text-[var(--pf-danger)]">{error}</p> : null}
        <label className="flex flex-col gap-1 text-sm">
          <span>{t('fields.itemName')}</span>
          <Input value={itemName} onChange={(e) => setItemName(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span>{t('fields.expectedDate')}</span>
          <Input type="date" value={expectedDate} onChange={(e) => setExpectedDate(e.target.value)} />
        </label>
        <Button
          type="button"
          variant="primary"
          disabled={pending || !itemName.trim()}
          onClick={() => {
            setError(null);
            startTransition(async () => {
              const result = await createDeliveryFromPortalAction({
                organizationId,
                projectId,
                itemName: itemName.trim(),
                expectedDate: expectedDate || null,
              });
              if (!result.ok) setError(result.error);
              else router.refresh();
            });
          }}
        >
          {t('portal.registerSubmit')}
        </Button>
      </CardContent>
    </Card>
  );
}

export function ContractorDeliveryReportButton({
  organizationId,
  projectId,
  item,
}: {
  organizationId: string;
  projectId: string;
  item: DeliveryWithStatus;
}) {
  const t = useTranslations('deliveries');
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  if (item.state === 'delivered' || item.state === 'cancelled' || item.state === 'rejected') return null;

  return (
    <Button
      type="button"
      variant="secondary"
      size="sm"
      disabled={pending}
      onClick={() => {
        startTransition(async () => {
          await reportDeliveryFromPortalAction({
            organizationId,
            projectId,
            deliveryItemId: item.id,
            reportKind: 'delay_notice',
            newExpectedDate: item.expectedDate ?? undefined,
            note: t('portal.delayNote'),
          });
          router.refresh();
        });
      }}
    >
      {t('portal.reportDelay')}
    </Button>
  );
}
