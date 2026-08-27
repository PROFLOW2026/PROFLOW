'use client';

import { useActionState, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { ConfirmAction } from '@/components/patterns/confirm-action';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  localizePaymentTermName,
} from '@/modules/business-catalog/domain/payment-term-labels';
import { localizeVendorCategoryName } from '@/modules/business-catalog/domain/vendor-capability-labels';
import {
  parsePaymentTermMetadata,
  type BusinessCatalogKind,
  type PaymentTermStrategy,
} from '@/modules/business-catalog/domain/types';
import type { SettingsActionState } from '../actions';
import {
  createCatalogEntryAction,
  createDocumentRequirementAction,
  deactivateCatalogEntryAction,
  deactivateDocumentRequirementAction,
  setCostCodesEnabledAction,
  setDefaultPaymentTermKeyAction,
  updateCatalogEntryAction,
} from './actions';
import {
  BUSINESS_CATALOG_KINDS,
  DOC_REQ_CONTEXT_KINDS,
  PAYMENT_TERM_STRATEGIES,
  VENDOR_TYPE_CONTEXT_KEYS,
  type CatalogEntryView,
  type DocumentRequirementView,
} from './_lib/types';

export function BusinessCatalogsPanel({
  entriesByKind,
  documentRequirements,
  costCodesEnabled,
  defaultPaymentTermKey,
  canEdit,
}: {
  entriesByKind: Record<BusinessCatalogKind, CatalogEntryView[]>;
  documentRequirements: readonly DocumentRequirementView[];
  costCodesEnabled: boolean;
  defaultPaymentTermKey: string | null;
  canEdit: boolean;
}) {
  const t = useTranslations('settings.businessCatalogs');

  return (
    <div className="flex flex-col gap-8">
      <p className="text-sm text-[var(--pf-text-secondary)]">{t('subtitle')}</p>

      <Tabs defaultValue="client_type">
        <TabsList aria-label={t('tabsLabel')}>
          {BUSINESS_CATALOG_KINDS.map((kind) => (
            <TabsTrigger key={kind} value={kind}>
              {t(`kinds.${kind}`)}
            </TabsTrigger>
          ))}
        </TabsList>

        {BUSINESS_CATALOG_KINDS.map((kind) => (
          <TabsContent key={kind} value={kind}>
            <CatalogKindTab
              kind={kind}
              entries={entriesByKind[kind] ?? []}
              canEdit={canEdit}
              costCodesEnabled={costCodesEnabled}
              defaultPaymentTermKey={defaultPaymentTermKey}
            />
          </TabsContent>
        ))}
      </Tabs>

      <DocumentRequirementsSection items={documentRequirements} canEdit={canEdit} />
    </div>
  );
}

function CatalogKindTab({
  kind,
  entries,
  canEdit,
  costCodesEnabled,
  defaultPaymentTermKey,
}: {
  kind: BusinessCatalogKind;
  entries: readonly CatalogEntryView[];
  canEdit: boolean;
  costCodesEnabled: boolean;
  defaultPaymentTermKey: string | null;
}) {
  const t = useTranslations('settings.businessCatalogs');

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-[var(--pf-text-secondary)]">{t(`kindHints.${kind}`)}</p>

      {kind === 'cost_code' ? (
        <CostCodesEnabledToggle
          key={String(costCodesEnabled)}
          enabled={costCodesEnabled}
          canEdit={canEdit}
        />
      ) : null}

      {kind === 'payment_term' ? (
        <DefaultPaymentTermSetting
          key={defaultPaymentTermKey ?? 'unset'}
          entries={entries}
          defaultKey={defaultPaymentTermKey}
          canEdit={canEdit}
        />
      ) : null}

      {entries.length === 0 ? (
        <EmptyState title={t('emptyTitle')} description={t('emptyHint')} />
      ) : (
        <ul className="flex flex-col gap-2">
          {entries.map((entry) => (
            <CatalogEntryRow key={entry.id} entry={entry} canEdit={canEdit} />
          ))}
        </ul>
      )}

      {canEdit ? <AddCatalogEntryForm kind={kind} /> : null}
    </div>
  );
}

function CostCodesEnabledToggle({
  enabled,
  canEdit,
}: {
  enabled: boolean;
  canEdit: boolean;
}) {
  const t = useTranslations('settings.businessCatalogs');
  const tCommon = useTranslations('common');
  const formRef = useRef<HTMLFormElement>(null);
  const enabledRef = useRef<HTMLInputElement>(null);
  const [state, action, pending] = useActionState(
    setCostCodesEnabledAction,
    {} as SettingsActionState,
  );
  const [checked, setChecked] = useState(enabled);

  if (!canEdit) {
    return (
      <p className="text-sm text-[var(--pf-text-secondary)]">
        {t('costCodesOptionalNote')}{' '}
        <span className="font-medium">
          {checked ? t('costCodesEnabledOn') : t('costCodesEnabledOff')}
        </span>
      </p>
    );
  }

  return (
    <form
      ref={formRef}
      action={action}
      className="flex flex-col gap-2 rounded-md border border-[var(--pf-border-default)] p-3"
    >
      <input ref={enabledRef} type="hidden" name="enabled" defaultValue={String(checked)} />
      <div className="flex min-h-11 items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <Label className="text-sm">{t('costCodesEnabled')}</Label>
          <p className="mt-1 text-xs text-[var(--pf-text-muted)]">{t('costCodesOptionalNote')}</p>
        </div>
        <Switch
          checked={checked}
          disabled={pending}
          className="shrink-0"
          onCheckedChange={(next) => {
            setChecked(next);
            if (enabledRef.current) enabledRef.current.value = String(next);
            formRef.current?.requestSubmit();
          }}
          aria-label={t('costCodesEnabled')}
        />
      </div>
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      {state.ok ? (
        <Alert tone="success" role="status" aria-live="polite">
          {tCommon('states.saved')}
        </Alert>
      ) : null}
    </form>
  );
}

function DefaultPaymentTermSetting({
  entries,
  defaultKey,
  canEdit,
}: {
  entries: readonly CatalogEntryView[];
  defaultKey: string | null;
  canEdit: boolean;
}) {
  const t = useTranslations('settings.businessCatalogs');
  const tCommon = useTranslations('common');
  const locale = useLocale();
  const activeEntries = entries.filter((entry) => entry.isActive);
  const [state, action, pending] = useActionState(
    setDefaultPaymentTermKeyAction,
    {} as SettingsActionState,
  );
  const [selectedKey, setSelectedKey] = useState(defaultKey ?? '');

  const currentLabel = (() => {
    const entry = activeEntries.find((item) => item.key === defaultKey);
    if (entry) return localizePaymentTermName(entry.key, entry.name, locale);
    return defaultKey ?? t('defaultPaymentTermUnset');
  })();

  if (!canEdit) {
    return (
      <p className="text-sm text-[var(--pf-text-secondary)]">
        {t('defaultPaymentTermLabel')}: <span className="font-medium">{currentLabel}</span>
      </p>
    );
  }

  return (
    <form
      action={action}
      className="flex flex-col gap-2 rounded-md border border-[var(--pf-border-default)] p-3"
    >
      <Field label={t('defaultPaymentTermLabel')}>
        {(props) => (
          <Select
            name="defaultPaymentTermKey"
            value={selectedKey}
            onValueChange={setSelectedKey}
            disabled={pending}
          >
            <SelectTrigger {...props} aria-label={t('defaultPaymentTermLabel')}>
              <SelectValue placeholder={t('defaultPaymentTermPlaceholder')} />
            </SelectTrigger>
            <SelectContent>
              {activeEntries.map((entry) => (
                <SelectItem key={entry.id} value={entry.key}>
                  {localizePaymentTermName(entry.key, entry.name, locale)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </Field>
      <input type="hidden" name="defaultPaymentTermKey" value={selectedKey} />
      <p className="text-xs text-[var(--pf-text-muted)]">{t('defaultPaymentTermHint')}</p>
      <Button type="submit" size="sm" loading={pending} disabled={!selectedKey}>
        {tCommon('actions.save')}
      </Button>
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      {state.ok ? (
        <Alert tone="success" role="status" aria-live="polite">
          {tCommon('states.saved')}
        </Alert>
      ) : null}
    </form>
  );
}

function PaymentTermFields({
  strategy,
  onStrategyChange,
  netDays,
  eomOffsetDays,
}: {
  strategy: PaymentTermStrategy;
  onStrategyChange: (value: PaymentTermStrategy) => void;
  netDays?: number | '';
  eomOffsetDays?: number | '';
}) {
  const t = useTranslations('settings.businessCatalogs');

  return (
    <div className="grid w-full gap-3 sm:grid-cols-2">
      <Field label={t('strategy')}>
        {(props) => (
          <>
            <input type="hidden" name="strategy" value={strategy} />
            <Select
              value={strategy}
              onValueChange={(value) => onStrategyChange(value as PaymentTermStrategy)}
            >
              <SelectTrigger id={props.id} aria-describedby={props['aria-describedby']}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAYMENT_TERM_STRATEGIES.map((key) => (
                  <SelectItem key={key} value={key}>
                    {t(`strategies.${key}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </>
        )}
      </Field>

      {strategy === 'net_days' ? (
        <Field label={t('netDays')}>
          {(props) => (
            <Input
              {...props}
              name="netDays"
              type="number"
              min={0}
              dir="ltr"
              defaultValue={netDays ?? 30}
              required
            />
          )}
        </Field>
      ) : null}

      {strategy === 'eom_plus_days' ? (
        <Field label={t('eomOffsetDays')}>
          {(props) => (
            <Input
              {...props}
              name="eomOffsetDays"
              type="number"
              min={0}
              dir="ltr"
              defaultValue={eomOffsetDays ?? 30}
              required
            />
          )}
        </Field>
      ) : null}
    </div>
  );
}

function AddCatalogEntryForm({ kind }: { kind: BusinessCatalogKind }) {
  const t = useTranslations('settings.businessCatalogs');
  const tCommon = useTranslations('common');
  const [createState, createAction, createPending] = useActionState(
    createCatalogEntryAction,
    {} as SettingsActionState,
  );
  const [strategy, setStrategy] = useState<PaymentTermStrategy>('net_days');

  return (
    <form
      action={createAction}
      className="flex w-full max-w-xl flex-col gap-3 rounded-md border border-[var(--pf-border-default)] p-3"
    >
      <h3 className="font-medium">{t('addItem')}</h3>
      <input type="hidden" name="kind" value={kind} />
      {createState.error ? <Alert tone="danger">{createState.error}</Alert> : null}
      {createState.ok ? (
        <Alert tone="success" role="status" aria-live="polite">
          {tCommon('states.saved')}
        </Alert>
      ) : null}

      <Field label={tCommon('labels.name')} required>
        {(props) => <Input {...props} name="name" required />}
      </Field>

      {kind === 'payment_term' ? (
        <PaymentTermFields strategy={strategy} onStrategyChange={setStrategy} />
      ) : null}

      {kind === 'cost_code' ? (
        <Field label={t('code')} optionalLabel={tCommon('labels.optional')}>
          {(props) => <Input {...props} name="code" dir="ltr" />}
        </Field>
      ) : null}

      <Button type="submit" size="sm" loading={createPending}>
        {t('addItem')}
      </Button>
    </form>
  );
}

function CatalogEntryRow({
  entry,
  canEdit,
}: {
  entry: CatalogEntryView;
  canEdit: boolean;
}) {
  const t = useTranslations('settings.businessCatalogs');
  const tCommon = useTranslations('common');
  const locale = useLocale();
  const [updateState, updateAction, updatePending] = useActionState(
    updateCatalogEntryAction,
    {} as SettingsActionState,
  );
  const payment = parsePaymentTermMetadata(entry.metadata);
  const [strategy, setStrategy] = useState<PaymentTermStrategy>(
    payment?.strategy ?? 'custom',
  );
  const code =
    typeof entry.metadata.code === 'string' ? entry.metadata.code : entry.key;
  const displayName =
    entry.kind === 'payment_term'
      ? localizePaymentTermName(entry.key, entry.name, locale)
      : entry.kind === 'vendor_category'
        ? localizeVendorCategoryName(entry.key, entry.name, locale, entry.isSystem)
        : entry.name;

  async function handleDeactivate() {
    const result = await deactivateCatalogEntryAction(entry.id);
    if (result.error) return { error: result.error };
    return { ok: true };
  }

  const metaSummary =
    entry.kind === 'payment_term' && payment
      ? t(`strategies.${payment.strategy}`) +
        (payment.netDays != null ? ` · ${payment.netDays}` : '') +
        (payment.eomOffsetDays != null ? ` · +${payment.eomOffsetDays}` : '')
      : entry.kind === 'cost_code'
        ? code
        : null;

  return (
    <li className="flex flex-col gap-2 rounded-md border border-[var(--pf-border-default)] px-3 py-2">
      {canEdit ? (
        <form action={updateAction} className="flex flex-col gap-3">
          <input type="hidden" name="id" value={entry.id} />
          <input type="hidden" name="kind" value={entry.kind} />
          <div className="flex flex-wrap items-center gap-2">
            {entry.kind === 'payment_term' && entry.isSystem ? (
              <>
                <input type="hidden" name="name" value={entry.name} />
                <span className="min-w-0 flex-1 text-sm font-medium">{displayName}</span>
              </>
            ) : (
              <Input
                name="name"
                defaultValue={entry.name}
                className="min-w-0 w-full max-w-xs flex-1"
                aria-label={displayName}
              />
            )}
            {!entry.isActive ? (
              <span className="text-xs text-[var(--pf-text-muted)]">{t('inactive')}</span>
            ) : null}
            <Button type="submit" size="sm" variant="secondary" loading={updatePending}>
              {tCommon('actions.save')}
            </Button>
            {!entry.isSystem ? (
              <ConfirmAction
                title={t('deactivate')}
                description={<p>{t('deactivateQuestion', { name: displayName })}</p>}
                confirmLabel={t('deactivate')}
                successMessage={t('deactivateSuccess')}
                onConfirm={handleDeactivate}
                trigger={
                  <Button type="button" size="sm" variant="ghost">
                    {t('deactivate')}
                  </Button>
                }
              />
            ) : null}
          </div>

          {entry.kind === 'payment_term' ? (
            <PaymentTermFields
              strategy={strategy}
              onStrategyChange={setStrategy}
              netDays={payment?.netDays ?? ''}
              eomOffsetDays={payment?.eomOffsetDays ?? ''}
            />
          ) : null}

          {entry.kind === 'cost_code' ? (
            <Field label={t('code')} optionalLabel={tCommon('labels.optional')}>
              {(props) => (
                <Input {...props} name="code" dir="ltr" defaultValue={code} className="max-w-xs" />
              )}
            </Field>
          ) : null}

          {updateState.error ? <Alert tone="danger">{updateState.error}</Alert> : null}
        </form>
      ) : (
        <div className="flex flex-wrap items-baseline gap-2">
          <span className="text-sm font-medium">{displayName}</span>
          {metaSummary ? (
            <span className="text-xs text-[var(--pf-text-muted)]">{metaSummary}</span>
          ) : null}
          {!entry.isActive ? (
            <span className="text-xs text-[var(--pf-text-muted)]">{t('inactive')}</span>
          ) : null}
        </div>
      )}
    </li>
  );
}

function DocumentRequirementsSection({
  items,
  canEdit,
}: {
  items: readonly DocumentRequirementView[];
  canEdit: boolean;
}) {
  const t = useTranslations('settings.businessCatalogs');
  const tCommon = useTranslations('common');
  const [createState, createAction, createPending] = useActionState(
    createDocumentRequirementAction,
    {} as SettingsActionState,
  );
  const [contextKind, setContextKind] = useState<(typeof DOC_REQ_CONTEXT_KINDS)[number]>(
    'vendor_type',
  );
  const [contextKey, setContextKey] = useState<(typeof VENDOR_TYPE_CONTEXT_KEYS)[number]>(
    'subcontractor',
  );

  return (
    <section className="flex flex-col gap-3 border-t border-[var(--pf-border-default)] pt-6">
      <div>
        <h2 className="text-base font-semibold">{t('docReqsTitle')}</h2>
        <p className="mt-1 text-sm text-[var(--pf-text-secondary)]">{t('docReqsHint')}</p>
      </div>

      {items.length === 0 ? (
        <EmptyState title={t('docReqsEmpty')} description={t('docReqsHint')} />
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((item) => (
            <DocumentRequirementRow key={item.id} item={item} canEdit={canEdit} />
          ))}
        </ul>
      )}

      {canEdit ? (
        <form
          action={createAction}
          className="flex w-full max-w-xl flex-col gap-3 rounded-md border border-[var(--pf-border-default)] p-3"
        >
          {createState.error ? <Alert tone="danger">{createState.error}</Alert> : null}
          {createState.ok ? (
            <Alert tone="success" role="status" aria-live="polite">
              {tCommon('states.saved')}
            </Alert>
          ) : null}

          <Field label={t('contextKind')}>
            {(props) => (
              <>
                <input type="hidden" name="contextKind" value={contextKind} />
                <Select
                  value={contextKind}
                  onValueChange={(value) =>
                    setContextKind(value as (typeof DOC_REQ_CONTEXT_KINDS)[number])
                  }
                >
                  <SelectTrigger id={props.id} aria-describedby={props['aria-describedby']}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DOC_REQ_CONTEXT_KINDS.map((key) => (
                      <SelectItem key={key} value={key}>
                        {t(`contextKinds.${key}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </>
            )}
          </Field>

          {contextKind === 'vendor_type' ? (
            <Field label={t('contextKey')}>
              {(props) => (
                <>
                  <input type="hidden" name="contextKey" value={contextKey} />
                  <Select
                    value={contextKey}
                    onValueChange={(value) =>
                      setContextKey(value as (typeof VENDOR_TYPE_CONTEXT_KEYS)[number])
                    }
                  >
                    <SelectTrigger id={props.id} aria-describedby={props['aria-describedby']}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {VENDOR_TYPE_CONTEXT_KEYS.map((key) => (
                        <SelectItem key={key} value={key}>
                          {t(`vendorTypes.${key}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </>
              )}
            </Field>
          ) : null}

          <Field label={t('documentTypeKey')} required>
            {(props) => <Input {...props} name="documentTypeKey" dir="ltr" required />}
          </Field>

          <Field label={t('label')} optionalLabel={tCommon('labels.optional')}>
            {(props) => <Input {...props} name="label" />}
          </Field>

          <Button type="submit" size="sm" loading={createPending}>
            {t('addDocReq')}
          </Button>
        </form>
      ) : null}
    </section>
  );
}

function DocumentRequirementRow({
  item,
  canEdit,
}: {
  item: DocumentRequirementView;
  canEdit: boolean;
}) {
  const t = useTranslations('settings.businessCatalogs');
  const display =
    item.label?.trim() ||
    item.documentTypeKey +
      (item.contextKey ? ` · ${item.contextKey}` : '') +
      ` · ${item.contextKind}`;

  async function handleDeactivate() {
    const result = await deactivateDocumentRequirementAction(item.id);
    if (result.error) return { error: result.error };
    return { ok: true };
  }

  return (
    <li className="flex flex-wrap items-center gap-2 rounded-md border border-[var(--pf-border-default)] px-3 py-2">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{display}</p>
        <p className="text-xs text-[var(--pf-text-muted)]">
          {t(`contextKinds.${item.contextKind}`)}
          {item.contextKey
            ? ` · ${(VENDOR_TYPE_CONTEXT_KEYS as readonly string[]).includes(item.contextKey) ? t(`vendorTypes.${item.contextKey as (typeof VENDOR_TYPE_CONTEXT_KEYS)[number]}`) : item.contextKey}`
            : null}
          {' · '}
          <span dir="ltr">{item.documentTypeKey}</span>
          {!item.isActive ? ` · ${t('inactive')}` : null}
        </p>
      </div>
      {canEdit ? (
        <ConfirmAction
          title={t('deactivate')}
          description={<p>{t('deactivateDocReqQuestion', { name: display })}</p>}
          confirmLabel={t('deactivate')}
          successMessage={t('deactivateSuccess')}
          onConfirm={handleDeactivate}
          trigger={
            <Button type="button" size="sm" variant="ghost">
              {t('deactivate')}
            </Button>
          }
        />
      ) : null}
    </li>
  );
}
