'use client';

import { useActionState } from 'react';
import { useTranslations } from 'next-intl';
import { ResponsiveTable } from '@/components/patterns/responsive-table';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  CUSTOM_FIELD_ENTITY_TYPES,
  CUSTOM_FIELD_TYPES,
  type CustomFieldDefinitionRecord,
} from '@/modules/custom-fields/domain/types';
import {
  archiveDefinitionAction,
  createDefinitionAction,
  type CustomFieldsActionState,
} from './actions';

export function CustomFieldsPanel({
  definitions,
  canEdit,
}: {
  definitions: CustomFieldDefinitionRecord[];
  canEdit: boolean;
}) {
  const t = useTranslations('customFields');
  const [createState, createAction, createPending] = useActionState(
    createDefinitionAction,
    {} as CustomFieldsActionState,
  );
  const [archiveState, archiveAction, archivePending] = useActionState(
    archiveDefinitionAction,
    {} as CustomFieldsActionState,
  );

  return (
    <div className="flex w-full min-w-0 flex-col gap-6">
      <div>
        <p className="text-start text-sm text-[var(--pf-text-secondary)]">{t('subtitle')}</p>
        <Alert tone="info" className="mt-3">
          {t('reportingNote')}
        </Alert>
      </div>

      {canEdit ? (
        <section className="min-w-0 rounded-lg border border-[var(--pf-border-default)] p-4">
          <h2 className="text-start font-medium">{t('addDefinition')}</h2>
          <form action={createAction} className="mt-3 flex w-full max-w-lg flex-col gap-3">
            {createState.error ? <Alert tone="danger">{createState.error}</Alert> : null}
            {createState.ok ? (
              <Alert tone="success" role="status">
                {t('saved')}
              </Alert>
            ) : null}

            <Field label={t('fields.entityType')} required>
              {(props) => (
                <Select name="entityType" defaultValue="client">
                  <SelectTrigger id={props.id}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CUSTOM_FIELD_ENTITY_TYPES.map((entityType) => (
                      <SelectItem key={entityType} value={entityType}>
                        {t(`entityTypes.${entityType}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </Field>

            <Field label={t('fields.key')} required>
              {(props) => (
                <Input
                  {...props}
                  name="key"
                  placeholder="site_floor"
                  required
                  pattern="[a-z][a-z0-9_]*"
                  dir="ltr"
                  className="font-mono text-sm"
                />
              )}
            </Field>

            <Field label={t('fields.label')} required>
              {(props) => <Input {...props} name="label" required />}
            </Field>

            <Field label={t('fields.fieldType')} required>
              {(props) => (
                <Select name="fieldType" defaultValue="text">
                  <SelectTrigger id={props.id}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CUSTOM_FIELD_TYPES.map((fieldType) => (
                      <SelectItem key={fieldType} value={fieldType}>
                        {t(`fieldTypes.${fieldType}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </Field>

            <Field label={t('fields.options')} optionalLabel={t('fields.optionsOptional')}>
              {(props) => (
                <Input
                  {...props}
                  name="options"
                  placeholder={t('fields.optionsPlaceholder')}
                />
              )}
            </Field>
            <p className="text-start text-xs text-[var(--pf-text-muted)]">{t('fields.optionsHint')}</p>

            <label className="flex min-h-11 items-center gap-3 text-start text-sm">
              <input
                type="checkbox"
                name="required"
                value="true"
                className="size-5 shrink-0 rounded border-[var(--pf-border-strong)]"
              />
              {t('fields.required')}
            </label>

            <Button type="submit" loading={createPending}>
              {t('addDefinition')}
            </Button>
          </form>
        </section>
      ) : null}

      <section className="min-w-0">
        <h2 className="text-start text-sm font-semibold">{t('listTitle')}</h2>
        {archiveState.error ? <Alert tone="danger">{archiveState.error}</Alert> : null}
        {definitions.length === 0 ? (
          <EmptyState size="sm" title={t('empty')} description={t('emptyHint')} className="mt-2" />
        ) : (
          <div className="mt-3 min-w-0">
            <ResponsiveTable
              items={definitions}
              getRowKey={(definition) => definition.id}
              desktop={
                <div className="overflow-x-auto rounded-lg border border-[var(--pf-border-default)]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t('columns.label')}</TableHead>
                        <TableHead>{t('columns.key')}</TableHead>
                        <TableHead>{t('columns.entity')}</TableHead>
                        <TableHead>{t('columns.type')}</TableHead>
                        <TableHead>{t('columns.actions')}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {definitions.map((definition) => (
                        <TableRow key={definition.id}>
                          <TableCell className="max-w-[12rem] break-words">{definition.label}</TableCell>
                          <TableCell>
                            <code dir="ltr" className="break-all text-xs">
                              {definition.key}
                            </code>
                          </TableCell>
                          <TableCell>{t(`entityTypes.${definition.entityType}`)}</TableCell>
                          <TableCell>{t(`fieldTypes.${definition.fieldType}`)}</TableCell>
                          <TableCell>
                            {canEdit && !definition.archivedAt ? (
                              <form action={archiveAction}>
                                <input type="hidden" name="definitionId" value={definition.id} />
                                <Button
                                  type="submit"
                                  variant="secondary"
                                  size="sm"
                                  loading={archivePending}
                                  className="min-h-11 md:min-h-8"
                                >
                                  {t('archive')}
                                </Button>
                              </form>
                            ) : null}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              }
              renderMobileCard={(definition) => (
                <div className="flex min-h-11 min-w-0 flex-col gap-3 rounded-lg border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] p-4">
                  <div className="min-w-0 text-start">
                    <p className="font-semibold break-words">{definition.label}</p>
                    <p className="mt-1 text-sm text-[var(--pf-text-secondary)]">
                      <code dir="ltr" className="break-all text-xs">
                        {definition.key}
                      </code>
                      {' · '}
                      {t(`entityTypes.${definition.entityType}`)}
                      {' · '}
                      {t(`fieldTypes.${definition.fieldType}`)}
                    </p>
                  </div>
                  {canEdit && !definition.archivedAt ? (
                    <form action={archiveAction} className="w-full">
                      <input type="hidden" name="definitionId" value={definition.id} />
                      <Button
                        type="submit"
                        variant="secondary"
                        size="sm"
                        loading={archivePending}
                        className="min-h-11 w-full sm:w-auto"
                      >
                        {t('archive')}
                      </Button>
                    </form>
                  ) : null}
                </div>
              )}
            />
          </div>
        )}
      </section>
    </div>
  );
}
