'use client';

import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useRouter } from '@/shared/i18n/navigation';
import { createProjectDeliveryAction } from '../actions/internal-actions';

export function DeliveryCreateForm({ projectId, cancelHref }: { projectId: string; cancelHref: string }) {
  const t = useTranslations('deliveries');
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [itemName, setItemName] = useState('');
  const [expectedDate, setExpectedDate] = useState('');

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('create.title')}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {error ? <p className="text-sm text-[var(--pf-danger)]">{error}</p> : null}
        <label className="flex flex-col gap-1 text-sm">
          <span>{t('fields.itemName')}</span>
          <Input value={itemName} onChange={(e) => setItemName(e.target.value)} required />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span>{t('fields.expectedDate')}</span>
          <Input type="date" value={expectedDate} onChange={(e) => setExpectedDate(e.target.value)} />
        </label>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="primary"
            disabled={pending || !itemName.trim()}
            onClick={() => {
              setError(null);
              startTransition(async () => {
                const result = await createProjectDeliveryAction({
                  projectId,
                  itemName: itemName.trim(),
                  expectedDate: expectedDate || null,
                });
                if (!result.ok) setError(result.error);
                else router.push(cancelHref);
              });
            }}
          >
            {t('create.submit')}
          </Button>
          <Button type="button" variant="secondary" disabled={pending} onClick={() => router.push(cancelHref)}>
            {t('create.cancel')}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
