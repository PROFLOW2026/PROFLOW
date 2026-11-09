'use client';

import { Copy } from 'lucide-react';
import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { createSupplierRfqAccessLinkAction } from '../../actions';
import type { QuoteVendorOption } from './quote-capture-form';

const NONE = '__none__';

export function RfqSupplierLinkPanel({
  rfqId,
  rfqStatus,
  vendors,
  appOrigin,
  locale,
}: {
  rfqId: string;
  rfqStatus: string;
  vendors: readonly QuoteVendorOption[];
  appOrigin: string;
  locale: string;
}) {
  const t = useTranslations('procurement.supplierRfqLink.staff');
  const [vendorId, setVendorId] = useState('');
  const [linkUrl, setLinkUrl] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const disabled = rfqStatus !== 'sent' || vendors.length === 0;

  const createLink = () => {
    if (!vendorId) return;
    startTransition(async () => {
      setError(null);
      setMessage(null);
      setLinkUrl(null);
      const result = await createSupplierRfqAccessLinkAction({ rfqId, vendorId });
      if (result.error) {
        setError(result.error);
        return;
      }
      if (!result.rawToken) {
        setError(t('createFailed'));
        return;
      }
      const url = `${appOrigin.replace(/\/$/, '')}/${locale}/supplier-rfq/${encodeURIComponent(result.rawToken)}`;
      setLinkUrl(url);
      setExpiresAt(result.expiresAt ?? null);
      setMessage(t('created'));
    });
  };

  const copyUrl = async () => {
    if (!linkUrl) return;
    try {
      await navigator.clipboard.writeText(linkUrl);
      setMessage(t('copied'));
    } catch {
      setMessage(t('copyFailed'));
    }
  };

  return (
    <div className="flex w-full min-w-0 flex-col gap-4 rounded-lg border border-[var(--pf-border-default)] p-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-sm font-semibold">{t('title')}</h2>
        <p className="text-xs text-[var(--pf-text-secondary)]">{t('description')}</p>
      </div>

      {rfqStatus !== 'sent' ? <Alert tone="warning">{t('rfqMustBeSent')}</Alert> : null}
      {error ? <Alert tone="danger">{error}</Alert> : null}
      {message ? <Alert tone="success">{message}</Alert> : null}

      <Field label={t('vendorLabel')} required>
        {(control) => (
          <Select
            value={vendorId || NONE}
            onValueChange={(value) => setVendorId(value === NONE ? '' : value)}
            disabled={disabled || pending}
          >
            <SelectTrigger {...control}>
              <SelectValue placeholder={t('vendorPlaceholder')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>{t('vendorPlaceholder')}</SelectItem>
              {vendors.map((vendor) => (
                <SelectItem key={vendor.id} value={vendor.id}>
                  {vendor.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </Field>

      <Button
        type="button"
        size="sm"
        variant="secondary"
        loading={pending}
        disabled={disabled || !vendorId}
        onClick={createLink}
      >
        {t('createLink')}
      </Button>

      {linkUrl ? (
        <div className="flex flex-col gap-2 rounded-lg bg-[var(--pf-bg-subtle)] p-3 text-sm">
          <p className="font-medium">{t('linkReady')}</p>
          {expiresAt ? (
            <p className="text-xs text-[var(--pf-text-secondary)]">
              {t('expiresAt')}: <span dir="ltr">{expiresAt}</span>
            </p>
          ) : null}
          <p className="break-all font-mono text-xs" dir="ltr">
            {linkUrl}
          </p>
          <Button type="button" size="sm" variant="ghost" onClick={copyUrl} className="self-start">
            <Copy aria-hidden className="size-4" />
            {t('copy')}
          </Button>
          <p className="text-xs text-[var(--pf-text-secondary)]">{t('oneTimeHint')}</p>
        </div>
      ) : null}
    </div>
  );
}
