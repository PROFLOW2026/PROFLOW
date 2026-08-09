'use client';

import { useMemo, useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { ResponsiveTable } from '@/components/patterns/responsive-table';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type {
  ColumnMapping,
  EnabledImportKind,
  ImportConfirmResult,
  ImportPreview,
} from '@/modules/imports';
import {
  confirmImportAction,
  previewImportAction,
} from '@/modules/imports/application/import-actions';

type Step = 'upload' | 'mapping' | 'preview' | 'result';

const STEPS: readonly Step[] = ['upload', 'mapping', 'preview', 'result'];

export interface ImportWizardProps {
  readonly allowedKinds: readonly EnabledImportKind[];
}

export function ImportWizard({ allowedKinds }: ImportWizardProps) {
  const t = useTranslations('imports');
  const [step, setStep] = useState<Step>('upload');
  const [kind, setKind] = useState<EnabledImportKind | ''>(allowedKinds[0] ?? '');
  const [csvText, setCsvText] = useState('');
  const [fileName, setFileName] = useState<string | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [mapping, setMapping] = useState<ColumnMapping>({});
  const [result, setResult] = useState<ImportConfirmResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const fieldKeys = useMemo(() => Object.keys(mapping), [mapping]);

  function onFile(file: File | null) {
    setError(null);
    setResult(null);
    setPreview(null);
    if (!file) {
      setCsvText('');
      setFileName(null);
      return;
    }
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      const text = typeof reader.result === 'string' ? reader.result : '';
      setCsvText(text);
    };
    reader.onerror = () => setError(t('errors.readFile'));
    reader.readAsText(file, 'UTF-8');
  }

  function runPreview(nextMapping?: ColumnMapping) {
    if (!kind) {
      setError(t('errors.chooseKind'));
      return;
    }
    if (!csvText.trim()) {
      setError(t('errors.needFile'));
      return;
    }
    setError(null);
    startTransition(async () => {
      const response = await previewImportAction({
        kind,
        csvText,
        mapping: nextMapping,
      });
      if (!response.ok) {
        setError(response.error);
        return;
      }
      setPreview(response.preview);
      setMapping(response.preview.mapping);
      setStep(nextMapping ? 'preview' : 'mapping');
    });
  }

  function runConfirm() {
    if (!kind || !preview) return;
    setError(null);
    startTransition(async () => {
      const response = await confirmImportAction({
        kind,
        csvText,
        mapping,
      });
      if (!response.ok) {
        setError(response.error);
        return;
      }
      setResult(response.result);
      setStep('result');
    });
  }

  function reset() {
    setStep('upload');
    setCsvText('');
    setFileName(null);
    setPreview(null);
    setMapping({});
    setResult(null);
    setError(null);
  }

  if (allowedKinds.length === 0) {
    return <Alert tone="warning">{t('notAllowed')}</Alert>;
  }

  const previewRows = preview?.rows.slice(0, 100) ?? [];

  return (
    <div className="flex flex-col gap-4">
      <ol
        className="flex flex-wrap gap-2 text-xs text-[var(--pf-text-secondary)]"
        aria-label={t('stepsLabel')}
      >
        {STEPS.map((item) => {
          const isCurrent = item === step;
          return (
            <li
              key={item}
              aria-current={isCurrent ? 'step' : undefined}
              className={
                isCurrent
                  ? 'rounded-md bg-[var(--pf-bg-muted)] px-2.5 py-1.5 font-medium text-[var(--pf-text-primary)]'
                  : 'rounded-md px-2.5 py-1.5'
              }
            >
              {t(`steps.${item}`)}
            </li>
          );
        })}
      </ol>

      {error ? <Alert tone="danger">{error}</Alert> : null}

      {step === 'upload' || step === 'mapping' ? (
        <Card className="flex flex-col gap-4 p-5">
          <div className="flex flex-col gap-2">
            <Label htmlFor="import-kind">{t('kindLabel')}</Label>
            <Select
              value={kind}
              onValueChange={(value) => {
                setKind(value as EnabledImportKind);
                setPreview(null);
                setStep('upload');
              }}
            >
              <SelectTrigger id="import-kind" className="max-w-sm">
                <SelectValue placeholder={t('kindPlaceholder')} />
              </SelectTrigger>
              <SelectContent>
                {allowedKinds.map((k) => (
                  <SelectItem key={k} value={k}>
                    {t(`kinds.${k}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="import-file">{t('fileLabel')}</Label>
            <input
              id="import-file"
              type="file"
              accept=".csv,text/csv"
              className="block w-full max-w-md text-sm file:me-3 file:min-h-11 file:cursor-pointer file:rounded-md file:border file:border-[var(--pf-border-strong)] file:bg-[var(--pf-action-secondary)] file:px-3 file:text-sm file:font-medium"
              onChange={(event) => onFile(event.target.files?.[0] ?? null)}
            />
            {fileName ? (
              <p className="text-xs text-[var(--pf-text-secondary)]" dir="ltr">
                {fileName}
              </p>
            ) : null}
          </div>

          <p className="text-sm text-[var(--pf-text-secondary)]">{t('expensesNotEnabled')}</p>

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="primary"
              disabled={pending || !kind || !csvText}
              onClick={() => runPreview()}
            >
              {t('actions.preview')}
            </Button>
          </div>
        </Card>
      ) : null}

      {step === 'mapping' && preview ? (
        <Card className="flex flex-col gap-4 p-5">
          <h2 className="text-sm font-semibold">{t('mapping.title')}</h2>
          <p className="text-sm text-[var(--pf-text-secondary)]">{t('mapping.hint')}</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {fieldKeys.map((field) => (
              <div key={field} className="flex flex-col gap-1">
                <Label htmlFor={`map-${field}`}>{t(`fields.${field}`)}</Label>
                <Select
                  value={String(mapping[field] ?? -1)}
                  onValueChange={(value) => {
                    setMapping((prev) => ({ ...prev, [field]: Number(value) }));
                  }}
                >
                  <SelectTrigger id={`map-${field}`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="-1">{t('mapping.unmapped')}</SelectItem>
                    {preview.headers.map((header, index) => (
                      <SelectItem key={`${header}-${index}`} value={String(index)}>
                        {header || t('mapping.emptyHeader', { index: index + 1 })}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="secondary" disabled={pending} onClick={() => setStep('upload')}>
              {t('actions.back')}
            </Button>
            <Button
              type="button"
              variant="primary"
              disabled={pending}
              onClick={() => runPreview(mapping)}
            >
              {t('actions.validate')}
            </Button>
          </div>
        </Card>
      ) : null}

      {step === 'preview' && preview ? (
        <Card className="flex flex-col gap-4 p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-sm font-semibold">{t('preview.title')}</h2>
            <p className="text-sm text-[var(--pf-text-secondary)]">
              {t('preview.summary', {
                valid: preview.validCount,
                errors: preview.errorCount,
                warnings: preview.warningCount,
              })}
            </p>
          </div>

          <ResponsiveTable
            items={previewRows}
            getRowKey={(row) => String(row.rowNumber)}
            desktop={
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('preview.row')}</TableHead>
                      <TableHead>{t('preview.values')}</TableHead>
                      <TableHead>{t('preview.issues')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {previewRows.map((row) => (
                      <TableRow key={row.rowNumber}>
                        <TableCell className="align-top tabular-nums" dir="ltr">
                          {row.rowNumber}
                        </TableCell>
                        <TableCell className="align-top text-xs">
                          {Object.entries(row.values)
                            .filter(([, value]) => value)
                            .map(([key, value]) => (
                              <div key={key}>
                                <span className="text-[var(--pf-text-secondary)]">{key}: </span>
                                {value}
                              </div>
                            ))}
                        </TableCell>
                        <TableCell className="align-top text-xs">
                          {row.issues.length === 0 ? (
                            <span className="text-[var(--pf-text-secondary)]">—</span>
                          ) : (
                            row.issues.map((issue, idx) => (
                              <div
                                key={`${issue.message}-${idx}`}
                                className={
                                  issue.severity === 'error'
                                    ? 'text-[var(--pf-action-danger)]'
                                    : 'text-[var(--pf-text-secondary)]'
                                }
                              >
                                {issue.severity === 'error' ? t('preview.error') : t('preview.warning')}
                                : {issue.message}
                              </div>
                            ))
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            }
            renderMobileCard={(row) => (
              <div className="min-h-11 rounded-lg border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] p-4 text-sm">
                <p className="font-semibold">
                  {t('preview.row')} <span dir="ltr">{row.rowNumber}</span>
                </p>
                <div className="mt-2 space-y-1 text-xs">
                  {Object.entries(row.values)
                    .filter(([, value]) => value)
                    .map(([key, value]) => (
                      <div key={key}>
                        <span className="text-[var(--pf-text-secondary)]">{key}: </span>
                        {value}
                      </div>
                    ))}
                </div>
                {row.issues.length > 0 ? (
                  <div className="mt-2 space-y-1 text-xs">
                    {row.issues.map((issue, idx) => (
                      <div
                        key={`${issue.message}-${idx}`}
                        className={
                          issue.severity === 'error'
                            ? 'text-[var(--pf-action-danger)]'
                            : 'text-[var(--pf-text-secondary)]'
                        }
                      >
                        {issue.severity === 'error' ? t('preview.error') : t('preview.warning')}:{' '}
                        {issue.message}
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            )}
          />

          {preview.rows.length > 100 ? (
            <p className="text-xs text-[var(--pf-text-secondary)]">
              {t('preview.truncated', { count: preview.rows.length })}
            </p>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="secondary" disabled={pending} onClick={() => setStep('mapping')}>
              {t('actions.back')}
            </Button>
            <Button
              type="button"
              variant="primary"
              disabled={pending || preview.validCount === 0}
              onClick={runConfirm}
            >
              {t('actions.confirm', { count: preview.validCount })}
            </Button>
          </div>
        </Card>
      ) : null}

      {step === 'result' && result ? (
        <Card className="flex flex-col gap-4 p-5">
          <h2 className="text-sm font-semibold">{t('result.title')}</h2>
          <p className="text-sm" role="status">
            {t('result.summary', { created: result.created, failed: result.failed })}
          </p>
          {result.failed > 0 ? (
            <ul className="list-inside list-disc text-sm text-[var(--pf-action-danger)]">
              {result.results
                .filter((r) => !r.ok)
                .slice(0, 50)
                .map((r) => (
                  <li key={r.rowNumber}>
                    {t('result.rowFailed', { row: r.rowNumber, error: r.error ?? '' })}
                  </li>
                ))}
            </ul>
          ) : null}
          <Button type="button" variant="secondary" onClick={reset}>
            {t('actions.another')}
          </Button>
        </Card>
      ) : null}
    </div>
  );
}
