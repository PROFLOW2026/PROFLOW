'use client';

import { useActionState } from 'react';
import { useTranslations } from 'next-intl';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  CUSTOM_FIELD_ENTITY_TYPES,
  CUSTOM_FIELD_TYPES,
  type CustomFieldDefinitionRecord,
} from '@/modules/custom-fields';
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
    <div className="flex flex-col gap-6">
      <div>
        <p className="text-sm text-[var(--pf-text-secondary)]">{t('subtitle')}</p>
        <Alert tone="info" className="mt-3">
          {t('reportingNote')}
        </Alert>
      </div>

      {canEdit ? (
        <section className="rounded-lg border border-[var(--pf-border-default)] p-4">
          <h2 className="font-medium">{t('addDefinition')}</h2>
          <form action={createAction} className="mt-3 flex max-w-lg flex-col gap-3">
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
                <Input {...props} name="key" placeholder="site_floor" required pattern="[a-z][a-z0-9_]*" />
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

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="required"
                value="true"
                className="size-4 rounded border-[var(--pf-border-strong)]"
              />
              {t('fields.required')}
            </label>

            <Button type="submit" loading={createPending}>
              {t('addDefinition')}
            </Button>
          </form>
        </section>
      ) : null}

      <section>
        <h2 className="text-sm font-semibold">{t('listTitle')}</h2>
        {archiveState.error ? <Alert tone="danger">{archiveState.error}</Alert> : null}
        {definitions.length === 0 ? (
          <p className="mt-2 text-sm text-[var(--pf-text-muted)]">{t('empty')}</p>
        ) : (
          <div className="mt-3 overflow-x-auto rounded-lg border border-[var(--pf-border-default)]">
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
                    <TableCell>{definition.label}</TableCell>
                    <TableCell>
                      <code dir="ltr">{definition.key}</code>
                    </TableCell>
                    <TableCell>{t(`entityTypes.${definition.entityType}`)}</TableCell>
                    <TableCell>{t(`fieldTypes.${definition.fieldType}`)}</TableCell>
                    <TableCell>
                      {canEdit && !definition.archivedAt ? (
                        <form action={archiveAction}>
                          <input type="hidden" name="definitionId" value={definition.id} />
                          <Button type="submit" variant="secondary" size="sm" loading={archivePending}>
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
        )}
      </section>
    </div>
  );
}
