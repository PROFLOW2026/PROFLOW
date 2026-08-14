'use client';

import { useActionState, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { EmptyState } from '@/components/ui/empty-state';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ResponsiveTable } from '@/components/patterns/responsive-table';
import { formatBusinessDate } from '@/shared/dates/format';
import { todayInTimeZone } from '@/shared/dates';
import type { TaxRuleRecord } from '@/modules/tax/domain/types';
import { createTaxRuleAction, type SettingsActionState } from '../actions';

export function TaxSettingsPanel({
  rules,
  countryCode,
  timezone,
  canEdit,
  currentRateLabel,
}: {
  rules: TaxRuleRecord[];
  countryCode: string;
  timezone: string;
  canEdit: boolean;
  currentRateLabel: string | null;
}) {
  const t = useTranslations('tax');
  const tCommon = useTranslations('common');
  const tCountries = useTranslations('onboarding.countries');
  const locale = useLocale();
  const [isDefault, setIsDefault] = useState(false);
  const [state, action, pending] = useActionState(createTaxRuleAction, {} as SettingsActionState);

  const packRules = rules.filter((rule) => rule.organizationId === null);
  const orgRules = rules.filter((rule) => rule.organizationId !== null);
  const hasCountryPack =
    countryCode === 'IL' || countryCode === 'US' || countryCode === 'GB';
  const countryLabel =
    hasCountryPack ? tCountries(countryCode as 'IL' | 'US' | 'GB') : countryCode;

  return (
    <div className="flex w-full min-w-0 flex-col gap-6">
      <p className="text-start text-sm text-[var(--pf-text-secondary)]">{t('subtitle')}</p>
      <p className="text-start text-xs text-[var(--pf-text-muted)]">{t('supportedPacks')}</p>

      {currentRateLabel ? (
        <p className="text-start text-sm">
          {t('currentRate', {
            rate: `\u2066${currentRateLabel}\u2069`,
            date: `\u2066${formatBusinessDate(todayInTimeZone(timezone), locale)}\u2069`,
          })}
        </p>
      ) : null}

      <section className="min-w-0">
        <h2 className="text-start text-sm font-semibold">
          {hasCountryPack
            ? t('countryPackTitle', { country: countryLabel })
            : t('unsupportedCountryTitle', { country: countryLabel })}
        </h2>
        <p className="text-start text-xs text-[var(--pf-text-muted)]">
          {hasCountryPack
            ? t('countryPackHint')
            : t('unsupportedCountry', { country: countryLabel })}
        </p>
        <TaxRulesTable
          rules={packRules}
          t={t}
          locale={locale}
          emptyTitle={hasCountryPack ? t('empty') : t('unsupportedCountryTitle', { country: countryLabel })}
          emptyHint={hasCountryPack ? t('emptyHint') : t('emptyHintNoPack')}
        />
      </section>

      <section className="min-w-0">
        <h2 className="text-start text-sm font-semibold">{t('orgRulesTitle')}</h2>
        <TaxRulesTable
          rules={orgRules}
          t={t}
          locale={locale}
          emptyTitle={t('empty')}
          emptyHint={hasCountryPack ? t('emptyHint') : t('emptyHintNoPack')}
        />
      </section>

      {canEdit ? (
        <section className="min-w-0 rounded-lg border border-[var(--pf-border-default)] p-4">
          <h2 className="text-start font-medium">{t('addRule')}</h2>
          <form action={action} className="mt-3 flex w-full max-w-lg flex-col gap-3">
            {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
            {state.ok ? (
              <Alert tone="success" role="status" aria-live="polite">
                {t('saved')}
              </Alert>
            ) : null}

            <Field label={t('fields.name')} required>
              {(props) => <Input {...props} name="name" required />}
            </Field>

            <Field label={t('fields.rate')} required>
              {(props) => (
                <Input
                  {...props}
                  name="ratePercent"
                  type="text"
                  inputMode="decimal"
                  numeric
                  placeholder="18"
                  required
                />
              )}
            </Field>

            <input type="hidden" name="method" value="percentage" />

            <Field label={t('fields.validFrom')} required>
              {(props) => <Input {...props} name="validFrom" type="date" required dir="ltr" />}
            </Field>

            <Field label={t('fields.validTo')} optionalLabel={tCommon('labels.optional')}>
              {(props) => <Input {...props} name="validTo" type="date" dir="ltr" />}
            </Field>

            <div className="flex items-center gap-2">
              <Checkbox
                id="tax-is-default"
                checked={isDefault}
                onCheckedChange={(checked) => setIsDefault(checked === true)}
              />
              <input type="hidden" name="isDefault" value={isDefault ? 'true' : 'false'} />
              <Label htmlFor="tax-is-default" className="text-start text-sm font-normal">
                {t('fields.isDefault')}
              </Label>
            </div>

            <Button type="submit" loading={pending}>
              {t('addRule')}
            </Button>
          </form>
        </section>
      ) : null}
    </div>
  );
}

function TaxRulesTable({
  rules,
  t,
  locale,
  emptyTitle,
  emptyHint,
}: {
  rules: TaxRuleRecord[];
  t: ReturnType<typeof useTranslations<'tax'>>;
  locale: string;
  emptyTitle?: string;
  emptyHint?: string;
}) {
  if (rules.length === 0) {
    return (
      <EmptyState
        size="sm"
        title={emptyTitle ?? t('empty')}
        description={emptyHint ?? t('emptyHint')}
        className="mt-2"
      />
    );
  }

  return (
    <div className="mt-3">
      <ResponsiveTable
        items={rules}
        getRowKey={(rule) => rule.id}
        desktop={
          <div className="overflow-x-auto rounded-lg border border-[var(--pf-border-default)]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('columns.name')}</TableHead>
                  <TableHead>{t('columns.rate')}</TableHead>
                  <TableHead>{t('columns.validFrom')}</TableHead>
                  <TableHead>{t('columns.validTo')}</TableHead>
                  <TableHead>{t('columns.scope')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rules.map((rule) => (
                  <TableRow key={rule.id}>
                    <TableCell>{rule.name}</TableCell>
                    <TableCell>
                      {rule.ratePercent ? (
                        <span dir="ltr" className="pf-numeric">
                          {rule.ratePercent}%
                        </span>
                      ) : (
                        '—'
                      )}
                    </TableCell>
                    <TableCell>
                      <span dir="ltr" className="pf-numeric">
                        {formatBusinessDate(rule.validFrom, locale)}
                      </span>
                    </TableCell>
                    <TableCell>
                      {rule.validTo ? (
                        <span dir="ltr" className="pf-numeric">
                          {formatBusinessDate(rule.validTo, locale)}
                        </span>
                      ) : (
                        t('openEnded')
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge tone="neutral">
                        {rule.organizationId ? t('scope.organization') : t('scope.countryPack')}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        }
        renderMobileCard={(rule) => (
          <div className="rounded-lg border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] p-4">
            <p className="text-sm font-medium">{rule.name}</p>
            <p className="mt-1 text-sm" dir="ltr">
              {rule.ratePercent ? `${rule.ratePercent}%` : '—'}
            </p>
            <p className="mt-1 text-xs text-[var(--pf-text-secondary)]" dir="ltr">
              {formatBusinessDate(rule.validFrom, locale)}
              {' → '}
              {rule.validTo ? formatBusinessDate(rule.validTo, locale) : t('openEnded')}
            </p>
            <p className="mt-2 text-xs text-[var(--pf-text-muted)]">
              {rule.organizationId ? t('scope.organization') : t('scope.countryPack')}
            </p>
          </div>
        )}
      />
    </div>
  );
}
