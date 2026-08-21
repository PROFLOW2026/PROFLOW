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
  type ApprovalRuleWithSteps,
  type ApproverStrategy,
} from '@/modules/approvals/domain/types';
import { money } from '@/shared/money';
import {
  createApprovalRuleAction,
  replaceApprovalRuleStepsAction,
  toggleApprovalRuleAction,
  type ApprovalsActionState,
} from '../../approvals/actions';

/** Local copy so this client panel never imports the approvals server barrel. */
const APPROVER_STRATEGIES = ['role_template', 'permission', 'user'] as const;

type DraftStep = {
  strategy: ApproverStrategy;
  roleTemplateKey: string;
  permissionKey: string;
  userId: string;
  name: string;
};

function emptyStep(): DraftStep {
  return {
    strategy: 'role_template',
    roleTemplateKey: 'manager',
    permissionKey: 'approvals.decide',
    userId: '',
    name: '',
  };
}

function RuleRow({ rule }: { rule: ApprovalRuleWithSteps }) {
  const t = useTranslations('approvals');
  const [state, action, pending] = useActionState(toggleApprovalRuleAction, {} as ApprovalsActionState);
  const [stepsState, stepsAction, stepsPending] = useActionState(
    replaceApprovalRuleStepsAction,
    {} as ApprovalsActionState,
  );
  const [draftSteps, setDraftSteps] = useState<DraftStep[]>(
    rule.steps.length > 0
      ? rule.steps.map((step) => ({
          strategy: step.approverStrategy,
          roleTemplateKey: step.roleTemplateKey ?? 'manager',
          permissionKey: step.permissionKey ?? 'approvals.decide',
          userId: step.userId ?? '',
          name: step.name ?? '',
        }))
      : [],
  );

  return (
    <li className="border-b border-[var(--pf-border-default)] py-4 last:border-0">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
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
            {' · '}
            {rule.steps.length === 0
              ? t('steps.legacySingle')
              : t('steps.count', { count: rule.steps.length })}
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
      </div>

      <form action={stepsAction} className="mt-3 flex flex-col gap-3 rounded-md border border-[var(--pf-border-default)] p-3">
        <input type="hidden" name="ruleId" value={rule.id} />
        <input type="hidden" name="stepsJson" value={JSON.stringify(draftSteps)} />
        <p className="text-sm font-medium">{t('steps.title')}</p>
        <p className="text-xs text-[var(--pf-text-muted)]">{t('steps.hint')}</p>
        {draftSteps.map((step, index) => (
          <div key={index} className="grid gap-2 rounded-md bg-[var(--pf-bg-muted)] p-3 sm:grid-cols-2">
            <Field label={t('steps.order')}>
              {(props) => <Input {...props} value={String(index + 1)} readOnly />}
            </Field>
            <Field label={t('steps.strategy')}>
              {(props) => (
                <select
                  {...props}
                  className="flex h-11 w-full rounded-md border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] px-3 text-sm"
                  value={step.strategy}
                  onChange={(event) => {
                    const next = [...draftSteps];
                    next[index] = {
                      ...step,
                      strategy: event.target.value as ApproverStrategy,
                    };
                    setDraftSteps(next);
                  }}
                >
                  {APPROVER_STRATEGIES.map((strategy) => (
                    <option key={strategy} value={strategy}>
                      {t(`steps.strategies.${strategy}`)}
                    </option>
                  ))}
                </select>
              )}
            </Field>
            {step.strategy === 'role_template' ? (
              <Field label={t('steps.roleTemplate')}>
                {(props) => (
                  <select
                    {...props}
                    className="flex h-11 w-full rounded-md border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] px-3 text-sm"
                    value={step.roleTemplateKey}
                    onChange={(event) => {
                      const next = [...draftSteps];
                      next[index] = { ...step, roleTemplateKey: event.target.value };
                      setDraftSteps(next);
                    }}
                  >
                    {['owner', 'manager', 'finance', 'worker'].map((key) => (
                      <option key={key} value={key}>
                        {key}
                      </option>
                    ))}
                  </select>
                )}
              </Field>
            ) : null}
            {step.strategy === 'permission' ? (
              <Field label={t('steps.permission')}>
                {(props) => (
                  <Input
                    {...props}
                    value={step.permissionKey}
                    onChange={(event) => {
                      const next = [...draftSteps];
                      next[index] = { ...step, permissionKey: event.target.value };
                      setDraftSteps(next);
                    }}
                  />
                )}
              </Field>
            ) : null}
            {step.strategy === 'user' ? (
              <Field label={t('steps.userId')}>
                {(props) => (
                  <Input
                    {...props}
                    value={step.userId}
                    onChange={(event) => {
                      const next = [...draftSteps];
                      next[index] = { ...step, userId: event.target.value };
                      setDraftSteps(next);
                    }}
                  />
                )}
              </Field>
            ) : null}
            <div className="sm:col-span-2">
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => setDraftSteps(draftSteps.filter((_, i) => i !== index))}
              >
                {t('steps.remove')}
              </Button>
            </div>
          </div>
        ))}
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="secondary" onClick={() => setDraftSteps([...draftSteps, emptyStep()])}>
            {t('steps.add')}
          </Button>
          <Button type="submit" size="sm" loading={stepsPending}>
            {t('steps.save')}
          </Button>
        </div>
        {stepsState.error ? <Alert tone="danger">{stepsState.error}</Alert> : null}
        {stepsState.ok ? (
          <Alert tone="success" role="status">
            {t('saved')}
          </Alert>
        ) : null}
      </form>
    </li>
  );
}

export function ApprovalRulesPanel({
  rules,
  canEdit,
  defaultCurrency,
}: {
  rules: readonly ApprovalRuleWithSteps[];
  canEdit: boolean;
  defaultCurrency: string;
}) {
  const t = useTranslations('approvals');
  const tCommon = useTranslations('common');
  const [enabled, setEnabled] = useState(true);
  const [entityType, setEntityType] = useState<(typeof APPROVAL_ENTITY_TYPES)[number]>('expense');
  const [createSteps, setCreateSteps] = useState<DraftStep[]>([]);
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
          <input type="hidden" name="stepsJson" value={JSON.stringify(createSteps)} />
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

          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium">{t('steps.title')}</p>
            <p className="text-xs text-[var(--pf-text-muted)]">{t('steps.createHint')}</p>
            {createSteps.map((step, index) => (
              <div key={index} className="grid gap-2 rounded-md bg-[var(--pf-bg-muted)] p-3 sm:grid-cols-2">
                <Field label={t('steps.strategy')}>
                  {(props) => (
                    <select
                      {...props}
                      className="flex h-11 w-full rounded-md border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] px-3 text-sm"
                      value={step.strategy}
                      onChange={(event) => {
                        const next = [...createSteps];
                        next[index] = { ...step, strategy: event.target.value as ApproverStrategy };
                        setCreateSteps(next);
                      }}
                    >
                      {APPROVER_STRATEGIES.map((strategy) => (
                        <option key={strategy} value={strategy}>
                          {t(`steps.strategies.${strategy}`)}
                        </option>
                      ))}
                    </select>
                  )}
                </Field>
                {step.strategy === 'role_template' ? (
                  <Field label={t('steps.roleTemplate')}>
                    {(props) => (
                      <select
                        {...props}
                        className="flex h-11 w-full rounded-md border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] px-3 text-sm"
                        value={step.roleTemplateKey}
                        onChange={(event) => {
                          const next = [...createSteps];
                          next[index] = { ...step, roleTemplateKey: event.target.value };
                          setCreateSteps(next);
                        }}
                      >
                        {['owner', 'manager', 'finance', 'worker'].map((key) => (
                          <option key={key} value={key}>
                            {key}
                          </option>
                        ))}
                      </select>
                    )}
                  </Field>
                ) : null}
                {step.strategy === 'permission' ? (
                  <Field label={t('steps.permission')}>
                    {(props) => (
                      <Input
                        {...props}
                        value={step.permissionKey}
                        onChange={(event) => {
                          const next = [...createSteps];
                          next[index] = { ...step, permissionKey: event.target.value };
                          setCreateSteps(next);
                        }}
                      />
                    )}
                  </Field>
                ) : null}
                {step.strategy === 'user' ? (
                  <Field label={t('steps.userId')}>
                    {(props) => (
                      <Input
                        {...props}
                        value={step.userId}
                        onChange={(event) => {
                          const next = [...createSteps];
                          next[index] = { ...step, userId: event.target.value };
                          setCreateSteps(next);
                        }}
                      />
                    )}
                  </Field>
                ) : null}
                <div className="sm:col-span-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() => setCreateSteps(createSteps.filter((_, i) => i !== index))}
                  >
                    {t('steps.remove')}
                  </Button>
                </div>
              </div>
            ))}
            <Button type="button" size="sm" variant="secondary" onClick={() => setCreateSteps([...createSteps, emptyStep()])}>
              {t('steps.add')}
            </Button>
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
