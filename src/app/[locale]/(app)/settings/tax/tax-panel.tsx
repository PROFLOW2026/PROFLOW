'use client';

import { useActionState, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatBusinessDate } from '@/shared/dates/format';
import { todayInTimeZone } from '@/shared/dates';
import type { TaxRuleRecord } from '@/modules/tax';
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
  const locale = useLocale();
  const [isDefault, setIsDefault] = useState(false);
  const [state, action, pending] = useActionState(createTaxRuleAction, {} as SettingsActionState);

  const packRules = rules.filter((rule) => rule.organizationId === null);
  const orgRules = rules.filter((rule) => rule.organizationId !== null);

  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm text-[var(--pf-text-secondary)]">{t('subtitle')}</p>

      {currentRateLabel ? (
        <p className="text-sm">
          {t('currentRate', {
            rate: `\u2066${currentRateLabel}\u2069`,
            date: `\u2066${formatBusinessDate(todayInTimeZone(timezone), locale)}\u2069`,
          })}
        </p>
      ) : null}

      <section>
        <h2 className="text-sm font-semibold">{t('countryPackTitle', { country: countryCode })}</h2>
        <p className="text-xs text-[var(--pf-text-muted)]">{t('countryPackHint')}</p>
        <TaxRulesTable rules={packRules} t={t} locale={locale} />
      </section>

      <section>
        <h2 className="text-sm font-semibold">{t('orgRulesTitle')}</h2>
        <TaxRulesTable rules={orgRules} t={t} locale={locale} />
      </section>

      {canEdit ? (
        <section className="rounded-lg border border-[var(--pf-border-default)] p-4">
          <h2 className="font-medium">{t('addRule')}</h2>
          <form action={action} className="mt-3 flex max-w-lg flex-col gap-3">
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
                <Input {...props} name="ratePercent" type="text" inputMode="decimal" placeholder="18" required />
              )}
            </Field>

            <input type="hidden" name="method" value="percentage" />

            <Field label={t('fields.validFrom')} required>
              {(props) => <Input {...props} name="validFrom" type="date" required />}
            </Field>

            <Field label={t('fields.validTo')} optionalLabel={tCommon('labels.optional')}>
              {(props) => <Input {...props} name="validTo" type="date" />}
            </Field>

            <div className="flex items-center gap-2">
              <Checkbox
                id="tax-is-default"
                checked={isDefault}
                onCheckedChange={(checked) => setIsDefault(checked === true)}
              />
              <input type="hidden" name="isDefault" value={isDefault ? 'true' : 'false'} />
              <Label htmlFor="tax-is-default" className="text-sm font-normal">
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
}: {
  rules: TaxRuleRecord[];
  t: ReturnType<typeof useTranslations<'tax'>>;
  locale: string;
}) {
  if (rules.length === 0) {
    return <p className="mt-2 text-sm text-[var(--pf-text-muted)]">{t('empty')}</p>;
  }

  return (
    <div className="mt-3 overflow-x-auto rounded-lg border border-[var(--pf-border-default)]">
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
  );
}
