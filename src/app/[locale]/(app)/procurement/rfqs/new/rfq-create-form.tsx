'use client';

import { useMemo, useState, useActionState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { createRfqAction, type ProcurementFormState } from '../../actions';

const NONE = '__none__';

export interface RfqProjectOption {
  readonly id: string;
  readonly name: string;
}

export interface RfqMaterialOption {
  readonly id: string;
  readonly name: string;
  readonly unit: string;
}

interface LineDraft {
  key: string;
  description: string;
  materialItemId: string;
  quantity: string;
  unit: string;
}

function newKey(): string {
  return globalThis.crypto?.randomUUID?.() ?? `line-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function emptyLine(): LineDraft {
  return {
    key: newKey(),
    description: '',
    materialItemId: '',
    quantity: '1',
    unit: 'ea',
  };
}

export function RfqCreateForm({
  projects,
  materials,
}: {
  projects: readonly RfqProjectOption[];
  materials: readonly RfqMaterialOption[];
}) {
  const t = useTranslations('procurement.rfq.create');
  const tCommon = useTranslations('common');
  const [state, formAction, pending] = useActionState<ProcurementFormState, FormData>(
    createRfqAction,
    {},
  );

  const [projectId, setProjectId] = useState('');
  const [lines, setLines] = useState<LineDraft[]>([emptyLine()]);

  const linesPayload = useMemo(
    () =>
      JSON.stringify(
        lines
          .filter((line) => line.description.trim())
          .map((line) => ({
            description: line.description.trim(),
            materialItemId: line.materialItemId || undefined,
            quantity: line.quantity.trim() || '1',
            unit: line.unit.trim() || undefined,
          })),
      ),
    [lines],
  );

  function updateLine(index: number, patch: Partial<LineDraft>) {
    setLines((prev) => prev.map((line, i) => (i === index ? { ...line, ...patch } : line)));
  }

  function applyMaterial(index: number, materialId: string) {
    const material = materials.find((item) => item.id === materialId);
    updateLine(index, {
      materialItemId: materialId === NONE ? '' : materialId,
      description: material?.name ?? lines[index]?.description ?? '',
      unit: material?.unit ?? lines[index]?.unit ?? 'ea',
    });
  }

  return (
    <form action={formAction} className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}

      <input type="hidden" name="projectId" value={projectId} />
      <input type="hidden" name="lines" value={linesPayload} />

      <Field label={t('titleLabel')} required error={state.fieldErrors?.title}>
        {(control) => <Input {...control} name="title" required autoFocus />}
      </Field>

      {projects.length > 0 ? (
        <Field label={t('projectLabel')} optionalLabel={tCommon('labels.optional')}>
          {(control) => (
            <Select
              value={projectId || NONE}
              onValueChange={(value) => setProjectId(value === NONE ? '' : value)}
            >
              <SelectTrigger {...control}>
                <SelectValue placeholder={t('projectNone')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>{t('projectNone')}</SelectItem>
                {projects.map((project) => (
                  <SelectItem key={project.id} value={project.id}>
                    {project.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </Field>
      ) : null}

      <Field label={t('dueDateLabel')} optionalLabel={tCommon('labels.optional')}>
        {(control) => <Input {...control} name="dueDate" type="date" />}
      </Field>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">{t('linesTitle')}</h2>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setLines((prev) => [...prev, emptyLine()])}
          >
            <Plus aria-hidden />
            {t('addLine')}
          </Button>
        </div>

        {lines.map((line, index) => (
          <div
            key={line.key}
            className="flex flex-col gap-3 rounded-lg border border-[var(--pf-border-default)] p-3"
          >
            {materials.length > 0 ? (
              <Field label={t('lineMaterial')} optionalLabel={tCommon('labels.optional')}>
                {(control) => (
                  <Select
                    value={line.materialItemId || NONE}
                    onValueChange={(value) => applyMaterial(index, value)}
                  >
                    <SelectTrigger {...control}>
                      <SelectValue placeholder={t('lineMaterialNone')} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>{t('lineMaterialNone')}</SelectItem>
                      {materials.map((material) => (
                        <SelectItem key={material.id} value={material.id}>
                          {material.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </Field>
            ) : null}

            <Field label={t('lineDescription')} required>
              {(control) => (
                <Input
                  {...control}
                  value={line.description}
                  onChange={(event) => updateLine(index, { description: event.target.value })}
                />
              )}
            </Field>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={t('lineQuantity')}>
                {(control) => (
                  <Input
                    {...control}
                    inputMode="decimal"
                    value={line.quantity}
                    onChange={(event) => updateLine(index, { quantity: event.target.value })}
                  />
                )}
              </Field>
              <Field label={t('lineUnit')} optionalLabel={tCommon('labels.optional')}>
                {(control) => (
                  <Input
                    {...control}
                    value={line.unit}
                    onChange={(event) => updateLine(index, { unit: event.target.value })}
                  />
                )}
              </Field>
            </div>

            {lines.length > 1 ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="self-start"
                onClick={() => setLines((prev) => prev.filter((_, i) => i !== index))}
              >
                <Trash2 aria-hidden />
                {t('removeLine')}
              </Button>
            ) : null}
          </div>
        ))}
      </section>

      <Field label={t('notesLabel')} optionalLabel={tCommon('labels.optional')}>
        {(control) => <Textarea {...control} name="notes" rows={3} />}
      </Field>

      <Button type="submit" loading={pending} block>
        {t('submit')}
      </Button>
    </form>
  );
}
