'use client';

import { useMemo, useState, useActionState } from 'react';
import { useTranslations } from 'next-intl';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
  FORM_FIELD_TYPES,
  type FormFieldDefinition,
  type FormFieldType,
  type FormTemplateRecord,
} from '@/modules/forms/domain/types';
import {
  archiveTemplateAction,
  createTemplateAction,
  setTemplateEnabledAction,
  type FormsActionState,
} from './forms-settings-actions';

function slugifyKey(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/^([^a-z])/, 'f_$1')
    .slice(0, 64) || 'field';
}

export function FormTemplatesPanel({
  templates,
  canEdit,
}: {
  templates: FormTemplateRecord[];
  canEdit: boolean;
}) {
  const t = useTranslations('forms');
  const [fields, setFields] = useState<FormFieldDefinition[]>([]);
  const [draftType, setDraftType] = useState<FormFieldType>('text');
  const [draftLabel, setDraftLabel] = useState('');
  const [draftKey, setDraftKey] = useState('');
  const [draftRequired, setDraftRequired] = useState(false);
  const [draftItems, setDraftItems] = useState('');

  const [createState, createAction, createPending] = useActionState(
    createTemplateAction,
    {} as FormsActionState,
  );
  const [archiveState, archiveAction, archivePending] = useActionState(
    archiveTemplateAction,
    {} as FormsActionState,
  );
  const [enableState, enableAction, enablePending] = useActionState(
    setTemplateEnabledAction,
    {} as FormsActionState,
  );

  const schemaJson = useMemo(
    () => JSON.stringify({ version: 1, fields }),
    [fields],
  );

  function addField() {
    const label = draftLabel.trim();
    if (!label) return;
    const key = (draftKey.trim() || slugifyKey(label)).slice(0, 64);
    if (fields.some((field) => field.key === key)) return;

    const next: FormFieldDefinition = {
      key,
      type: draftType,
      label,
      required: draftRequired,
      ...(draftType === 'checklist'
        ? {
            items: draftItems
              .split(',')
              .map((part) => part.trim())
              .filter(Boolean)
              .map((itemLabel, index) => ({
                key: `item_${index + 1}`,
                label: itemLabel,
              })),
          }
        : {}),
    };
    if (draftType === 'checklist' && !(next.items && next.items.length > 0)) return;

    setFields((prev) => [...prev, next]);
    setDraftLabel('');
    setDraftKey('');
    setDraftRequired(false);
    setDraftItems('');
  }

  return (
    <div className="flex w-full min-w-0 flex-col gap-6">
      <div>
        <p className="text-start text-sm text-[var(--pf-text-secondary)]">{t('settings.subtitle')}</p>
        <Alert tone="info" className="mt-3">
          {t('acknowledgementDisclaimer')}
        </Alert>
      </div>

      {canEdit ? (
        <section className="min-w-0 rounded-lg border border-[var(--pf-border-default)] p-4">
          <h2 className="text-start font-medium">{t('settings.addTemplate')}</h2>
          <form action={createAction} className="mt-3 flex w-full max-w-lg flex-col gap-3">
            {createState.error ? <Alert tone="danger">{createState.error}</Alert> : null}
            {createState.ok ? (
              <Alert tone="success" role="status">
                {t('settings.saved')}
              </Alert>
            ) : null}

            <Field label={t('settings.fields.name')} required>
              {(props) => <Input {...props} name="name" required maxLength={200} />}
            </Field>
            <Field label={t('settings.fields.description')}>
              {(props) => <Textarea {...props} name="description" rows={2} />}
            </Field>
            <Field label={t('settings.fields.category')}>
              {(props) => <Input {...props} name="category" maxLength={100} />}
            </Field>

            <div className="rounded-md border border-[var(--pf-border-default)] p-3">
              <p className="mb-2 text-sm font-medium">{t('settings.fields.addField')}</p>
              <div className="flex flex-col gap-2">
                <Field label={t('settings.fields.fieldLabel')} required>
                  {(props) => (
                    <Input
                      {...props}
                      value={draftLabel}
                      onChange={(event) => setDraftLabel(event.target.value)}
                    />
                  )}
                </Field>
                <Field label={t('settings.fields.fieldKey')}>
                  {(props) => (
                    <Input
                      {...props}
                      value={draftKey}
                      onChange={(event) => setDraftKey(event.target.value)}
                      placeholder={slugifyKey(draftLabel) || 'site_check'}
                      dir="ltr"
                      className="font-mono text-sm"
                    />
                  )}
                </Field>
                <Field label={t('settings.fields.fieldType')} required>
                  {(props) => (
                    <Select
                      value={draftType}
                      onValueChange={(value) => setDraftType(value as FormFieldType)}
                    >
                      <SelectTrigger id={props.id}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {FORM_FIELD_TYPES.map((type) => (
                          <SelectItem key={type} value={type}>
                            {t(`fieldTypes.${type}`)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </Field>
                {draftType === 'checklist' ? (
                  <Field label={t('settings.fields.checklistItems')} required>
                    {(props) => (
                      <Input
                        {...props}
                        value={draftItems}
                        onChange={(event) => setDraftItems(event.target.value)}
                        placeholder="PPE, Scaffolding, Access"
                      />
                    )}
                  </Field>
                ) : null}
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={draftRequired}
                    onChange={(event) => setDraftRequired(event.target.checked)}
                  />
                  {t('settings.fields.required')}
                </label>
                <Button type="button" variant="secondary" onClick={addField}>
                  {t('settings.fields.addField')}
                </Button>
              </div>
            </div>

            <div>
              <p className="mb-1 text-sm font-medium">{t('settings.fields.schemaPreview')}</p>
              {fields.length === 0 ? (
                <p className="text-sm text-[var(--pf-text-secondary)]">—</p>
              ) : (
                <ul className="flex flex-col gap-1 text-sm">
                  {fields.map((field) => (
                    <li key={field.key} className="flex flex-wrap items-center justify-between gap-2">
                      <span>
                        {field.label}{' '}
                        <span className="text-[var(--pf-text-secondary)]">
                          ({t(`fieldTypes.${field.type}`)}
                          {field.required ? ', *' : ''})
                        </span>
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          setFields((prev) => prev.filter((item) => item.key !== field.key))
                        }
                      >
                        ×
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <input type="hidden" name="schemaJson" value={schemaJson} />
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="enabled" value="true" defaultChecked />
              {t('settings.fields.enabled')}
            </label>

            <Button type="submit" loading={createPending} disabled={fields.length === 0}>
              {t('settings.addTemplate')}
            </Button>
          </form>
        </section>
      ) : null}

      {templates.length === 0 ? (
        <EmptyState title={t('settings.empty')} description={t('settings.emptyBody')} />
      ) : (
        <ul className="flex flex-col gap-3">
          {archiveState.error || enableState.error ? (
            <Alert tone="danger">{archiveState.error ?? enableState.error}</Alert>
          ) : null}
          {templates.map((template) => (
            <li
              key={template.id}
              className="rounded-lg border border-[var(--pf-border-default)] p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="font-medium">{template.name}</h3>
                  {template.description ? (
                    <p className="mt-1 text-sm text-[var(--pf-text-secondary)]">
                      {template.description}
                    </p>
                  ) : null}
                  <p className="mt-2 text-xs text-[var(--pf-text-secondary)]">
                    {template.schema.fields.length} ·{' '}
                    {template.enabled ? t('settings.enable') : t('settings.disable')}
                    {template.category ? ` · ${template.category}` : ''}
                  </p>
                  <ul className="mt-2 flex flex-wrap gap-2 text-xs text-[var(--pf-text-secondary)]">
                    {template.schema.fields.map((field) => (
                      <li
                        key={field.key}
                        className="rounded border border-[var(--pf-border-default)] px-2 py-0.5"
                      >
                        {field.label} ({t(`fieldTypes.${field.type}`)})
                      </li>
                    ))}
                  </ul>
                </div>
                {canEdit && !template.archivedAt ? (
                  <div className="flex flex-wrap gap-2">
                    <form action={enableAction}>
                      <input type="hidden" name="templateId" value={template.id} />
                      <input
                        type="hidden"
                        name="enabled"
                        value={template.enabled ? 'false' : 'true'}
                      />
                      <Button type="submit" variant="secondary" size="sm" loading={enablePending}>
                        {template.enabled ? t('settings.disable') : t('settings.enable')}
                      </Button>
                    </form>
                    <form action={archiveAction}>
                      <input type="hidden" name="templateId" value={template.id} />
                      <Button type="submit" variant="ghost" size="sm" loading={archivePending}>
                        {t('settings.archive')}
                      </Button>
                    </form>
                  </div>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
