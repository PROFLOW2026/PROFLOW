'use client';

import { useActionState, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { EmptyState } from '@/components/ui/empty-state';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { MoneyText } from '@/components/patterns/money-text';
import {
  APPROVAL_ENTITY_TYPES,
  type ApprovalRuleRecord,
} from '@/modules/approvals/domain/types';
import { money } from '@/shared/money';
import {
  createApprovalRuleAction,
  toggleApprovalRuleAction,
  type ApprovalsActionState,
} from '../../approvals/actions';

function RuleRow({ rule }: { rule: ApprovalRuleRecord }) {
  const t = useTranslations('approvals');
  const [state, action, pending] = useActionState(toggleApprovalRuleAction, {} as ApprovalsActionState);

  return (
    <li className="flex flex-col gap-2 border-b border-[var(--pf-border-default)] py-3 last:border-0 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="font-medium">{rule.name}</p>
        <p className="text-sm text-[var(--pf-text-secondary)]">
          {t(`entityTypes.${rule.entityType}`)}
          {' · '}
          {rule.thresholdAmount && rule.currency ? (
            <MoneyText value={money(rule.thresholdAmount, rule.currency)} />
          ) : (
            t('fields.noThreshold')
          )}
          {!rule.enabled ? ` · ${t('fields.enabled')}: ${t('toggle.off')}` : null}
        </p>
      </div>
      <form action={action} className="flex flex-wrap items-center gap-2">
        <input type="hidden" name="ruleId" value={rule.id} />
        <input type="hidden" name="enabled" value={rule.enabled ? 'false' : 'true'} />
        <Button type="submit" size="sm" variant="secondary" loading={pending}>
          {rule.enabled ? t('toggle.disable') : t('toggle.enable')}
        </Button>
        {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      </form>
    </li>
  );
}

export function ApprovalRulesPanel({
  rules,
  canEdit,
  defaultCurrency,
}: {
  rules: readonly ApprovalRuleRecord[];
  canEdit: boolean;
  defaultCurrency: string;
}) {
  const t = useTranslations('approvals');
  const tCommon = useTranslations('common');
  const [enabled, setEnabled] = useState(true);
  const [entityType, setEntityType] = useState<(typeof APPROVAL_ENTITY_TYPES)[number]>('expense');
  const [state, action, pending] = useActionState(createApprovalRuleAction, {} as ApprovalsActionState);

  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm text-[var(--pf-text-secondary)]">{t('rulesDescription')}</p>

      {rules.length === 0 ? (
        <EmptyState title={t('rulesEmpty.title')} description={t('rulesEmpty.body')} />
      ) : (
        <ul className="rounded-lg border border-[var(--pf-border-default)] px-4">
          {rules.map((rule) => (
            <RuleRow key={rule.id} rule={rule} />
          ))}
        </ul>
      )}

      {canEdit ? (
        <form action={action} className="flex flex-col gap-4 rounded-lg border border-[var(--pf-border-default)] p-4">
          <h3 className="font-semibold">{t('addRule')}</h3>
          <Field label={t('fields.name')} required>
            {(props) => <Input {...props} name="name" required minLength={2} maxLength={120} />}
          </Field>
          <Field label={t('fields.entityType')} required>
            {(props) => (
              <>
                <input type="hidden" name="entityType" value={entityType} />
                <select
                  {...props}
                  className="flex h-11 w-full rounded-md border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] px-3 text-sm"
                  value={entityType}
                  onChange={(event) =>
                    setEntityType(event.target.value as (typeof APPROVAL_ENTITY_TYPES)[number])
                  }
                >
                  {APPROVAL_ENTITY_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {t(`entityTypes.${type}`)}
                    </option>
                  ))}
                </select>
              </>
            )}
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('fields.thresholdAmount')} optionalLabel={tCommon('labels.optional')}>
              {(props) => (
                <Input {...props} name="thresholdAmount" inputMode="decimal" placeholder="1000" />
              )}
            </Field>
            <Field label={t('fields.currency')} optionalLabel={tCommon('labels.optional')}>
              {(props) => (
                <Input
                  {...props}
                  name="currency"
                  defaultValue={defaultCurrency}
                  maxLength={3}
                  className="uppercase"
                />
              )}
            </Field>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id="approval-rule-enabled"
              checked={enabled}
              onCheckedChange={(checked) => setEnabled(checked === true)}
            />
            <input type="hidden" name="enabled" value={enabled ? 'true' : 'false'} />
            <Label htmlFor="approval-rule-enabled" className="text-sm font-normal">
              {t('fields.enabled')}
            </Label>
          </div>
          <Button type="submit" loading={pending}>
            {tCommon('actions.save')}
          </Button>
          {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
          {state.ok ? (
            <Alert tone="success" role="status">
              {t('saved')}
            </Alert>
          ) : null}
        </form>
      ) : null}
    </div>
  );
}
