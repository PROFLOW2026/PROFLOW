'use client';

import { useMemo, useState, useTransition } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { ResponsiveTable } from '@/components/patterns/responsive-table';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
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
} from '@/modules/imports/domain/types';
import {
  buildImportConfirmFailuresCsv,
  buildImportIssuesReportCsv,
} from '@/modules/imports/domain/error-report';
import {
  buildImportTemplateCsv,
  importTemplateFileName,
} from '@/modules/imports/domain/templates';
import { rowHasErrors } from '@/modules/imports/domain/row-has-errors';
import {
  confirmImportAction,
  parseImportFileAction,
  previewImportAction,
} from '@/modules/imports/application/import-actions';

type Step = 'upload' | 'mapping' | 'preview' | 'result';

const STEPS: readonly Step[] = ['upload', 'mapping', 'preview', 'result'];

export interface ImportWizardProps {
  readonly allowedKinds: readonly EnabledImportKind[];
  /** When set (e.g. project BOQ tab), used for boq_items confirm. */
  readonly projectId?: string;
  /** Optional draft BOQ id for boq_items. */
  readonly boqId?: string;
  /** Existing billing plan for billing_plan import. */
  readonly planId?: string;
  /** Contract when creating a billing plan via import. */
  readonly contractId?: string;
}

function downloadText(fileName: string, contents: string) {
  const blob = new Blob([contents], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      const comma = result.indexOf(',');
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(new Error('read failed'));
    reader.readAsDataURL(file);
  });
}

export function ImportWizard({
  allowedKinds,
  projectId: projectIdProp,
  boqId,
  planId: planIdProp,
  contractId: contractIdProp,
}: ImportWizardProps) {
  const t = useTranslations('imports');
  const locale = useLocale();
  const [step, setStep] = useState<Step>('upload');
  const [kind, setKind] = useState<EnabledImportKind | ''>(allowedKinds[0] ?? '');
  const [csvText, setCsvText] = useState('');
  const [fileName, setFileName] = useState<string | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [mapping, setMapping] = useState<ColumnMapping>({});
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set());
  const [result, setResult] = useState<ImportConfirmResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [projectIdInput, setProjectIdInput] = useState(projectIdProp ?? '');
  const [planIdInput, setPlanIdInput] = useState(planIdProp ?? '');
  const [contractIdInput, setContractIdInput] = useState(contractIdProp ?? '');

  const projectId = (projectIdProp ?? projectIdInput).trim();
  const planId = (planIdProp ?? planIdInput).trim();
  const contractId = (contractIdProp ?? contractIdInput).trim();

  const fieldKeys = useMemo(() => Object.keys(mapping), [mapping]);

  const selectedValidCount = useMemo(() => {
    if (!preview) return 0;
    return preview.rows.filter((row) => selectedRows.has(row.rowNumber) && !rowHasErrors(row))
      .length;
  }, [preview, selectedRows]);

  function onFile(file: File | null) {
    setError(null);
    setResult(null);
    setPreview(null);
    setSelectedRows(new Set());
    if (!file) {
      setCsvText('');
      setFileName(null);
      return;
    }
    setFileName(file.name);
    startTransition(async () => {
      try {
        const base64 = await fileToBase64(file);
        const parsed = await parseImportFileAction({ fileName: file.name, base64 });
        if (!parsed.ok) {
          setError(parsed.error);
          setCsvText('');
          return;
        }
        setCsvText(parsed.csvText);
      } catch {
        setError(t('errors.readFile'));
        setCsvText('');
      }
    });
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
    if (kind === 'billing_plan' && !planId && !projectId) {
      setError(t('errors.needPlanOrProjectId'));
      return;
    }
    if (kind === 'boq_items' && !projectId) {
      setError(t('errors.needProjectId'));
      return;
    }
    setError(null);
    startTransition(async () => {
      const response = await previewImportAction({
        kind,
        csvText,
        mapping: nextMapping,
        projectId: kind === 'boq_items' ? projectId : undefined,
        boqId: kind === 'boq_items' ? boqId : undefined,
      });
      if (!response.ok) {
        setError(response.error);
        return;
      }
      setPreview(response.preview);
      setMapping(response.preview.mapping);
      const valid = response.preview.rows
        .filter((row) => !rowHasErrors(row))
        .map((row) => row.rowNumber);
      setSelectedRows(new Set(valid));
      setStep(nextMapping ? 'preview' : 'mapping');
    });
  }

  function runConfirm() {
    if (!kind || !preview) return;
    if (selectedValidCount === 0) {
      setError(t('errors.nothingSelected'));
      return;
    }
    if (kind === 'billing_plan' && !planId && !projectId) {
      setError(t('errors.needPlanOrProjectId'));
      return;
    }
    if (kind === 'boq_items' && !projectId) {
      setError(t('errors.needProjectId'));
      return;
    }
    setError(null);
    startTransition(async () => {
      const response = await confirmImportAction({
        kind,
        csvText,
        mapping,
        rowNumbers: [...selectedRows],
        projectId: kind === 'boq_items' || kind === 'billing_plan' ? projectId || undefined : undefined,
        boqId: kind === 'boq_items' ? boqId : undefined,
        planId: kind === 'billing_plan' ? planId || undefined : undefined,
        contractId: kind === 'billing_plan' ? contractId || undefined : undefined,
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
    setSelectedRows(new Set());
    setResult(null);
    setError(null);
  }

  function toggleRow(rowNumber: number, checked: boolean) {
    setSelectedRows((prev) => {
      const next = new Set(prev);
      if (checked) next.add(rowNumber);
      else next.delete(rowNumber);
      return next;
    });
  }

  function downloadTemplate() {
    if (!kind) {
      setError(t('errors.chooseKind'));
      return;
    }
    downloadText(importTemplateFileName(kind, locale), buildImportTemplateCsv(kind, locale));
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
                setSelectedRows(new Set());
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

          {kind === 'billing_plan' && !planIdProp ? (
            <div className="flex flex-col gap-2">
              <Label htmlFor="import-plan-id">{t('fields.planId')}</Label>
              <p className="text-sm text-[var(--pf-text-secondary)]">{t('billingPlanHint')}</p>
              <Input
                id="import-plan-id"
                value={planIdInput}
                onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                  setPlanIdInput(event.target.value)
                }
                placeholder={t('fields.planIdPlaceholder')}
              />
              <Label htmlFor="import-contract-id">{t('fields.contractId')}</Label>
              <Input
                id="import-contract-id"
                value={contractIdInput}
                onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                  setContractIdInput(event.target.value)
                }
                placeholder={t('fields.contractIdPlaceholder')}
              />
              {!projectIdProp ? (
                <>
                  <Label htmlFor="import-project-id-bp">{t('fields.projectId')}</Label>
                  <Input
                    id="import-project-id-bp"
                    value={projectIdInput}
                    onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                      setProjectIdInput(event.target.value)
                    }
                  />
                </>
              ) : null}
            </div>
          ) : null}
          {kind === 'boq_items' && !projectIdProp ? (
            <div className="flex flex-col gap-2">
              <Label htmlFor="import-project-id">{t('fields.projectId')}</Label>
              <p className="text-sm text-[var(--pf-text-secondary)]">{t('boqItemsHint')}</p>
              <input
                id="import-project-id"
                className="max-w-sm rounded-md border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] px-3 py-2 text-sm"
                value={projectIdInput}
                onChange={(event) => setProjectIdInput(event.target.value)}
                placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                autoComplete="off"
              />
            </div>
          ) : null}

          {kind === 'boq_items' && projectIdProp ? (
            <p className="text-sm text-[var(--pf-text-secondary)]">{t('boqItemsHint')}</p>
          ) : null}

          <div className="flex flex-col gap-2">
            <Label>{t('templateLabel')}</Label>
            <p className="text-sm text-[var(--pf-text-secondary)]">{t('templateHint')}</p>
            <Button type="button" variant="secondary" disabled={!kind} onClick={downloadTemplate}>
              {t('actions.downloadTemplate')}
            </Button>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="import-file">{t('fileLabel')}</Label>
            <input
              id="import-file"
              type="file"
              accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="block w-full max-w-md text-sm file:me-3 file:min-h-11 file:cursor-pointer file:rounded-md file:border file:border-[var(--pf-border-strong)] file:bg-[var(--pf-action-secondary)] file:px-3 file:text-sm file:font-medium"
              onChange={(event) => onFile(event.target.files?.[0] ?? null)}
            />
            {fileName ? (
              <p className="text-xs text-[var(--pf-text-secondary)]" dir="ltr">
                {fileName}
              </p>
            ) : null}
          </div>

          {kind === 'expenses' ? (
            <p className="text-sm text-[var(--pf-text-secondary)]">{t('expensesSafeHint')}</p>
          ) : kind === 'opening_values' ? (
            <p className="text-sm text-[var(--pf-text-secondary)]">{t('openingValuesHint')}</p>
          ) : kind === 'inventory' ? (
            <p className="text-sm text-[var(--pf-text-secondary)]">{t('inventoryHint')}</p>
          ) : (
            <p className="text-sm text-[var(--pf-text-secondary)]">{t('nonFinancialHint')}</p>
          )}

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
            <Button type="button" variant="secondary" loading={pending} onClick={() => setStep('upload')}>
              {t('actions.back')}
            </Button>
            <Button
              type="button"
              variant="primary"
              loading={pending}
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
                selected: selectedValidCount,
              })}
            </p>
          </div>
          <p className="text-sm text-[var(--pf-text-secondary)]">{t('preview.skipHint')}</p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() =>
                setSelectedRows(
                  new Set(
                    preview.rows.filter((row) => !rowHasErrors(row)).map((row) => row.rowNumber),
                  ),
                )
              }
            >
              {t('preview.selectValid')}
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setSelectedRows(new Set(preview.rows.map((row) => row.rowNumber)))}
            >
              {t('preview.selectAll')}
            </Button>
          </div>

          <ResponsiveTable
            items={previewRows}
            getRowKey={(row) => String(row.rowNumber)}
            desktop={
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('preview.include')}</TableHead>
                      <TableHead>{t('preview.row')}</TableHead>
                      <TableHead>{t('preview.values')}</TableHead>
                      <TableHead>{t('preview.issues')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {previewRows.map((row) => {
                      const hasError = rowHasErrors(row);
                      return (
                        <TableRow key={row.rowNumber}>
                          <TableCell className="align-top">
                            <input
                              type="checkbox"
                              checked={selectedRows.has(row.rowNumber)}
                              disabled={hasError}
                              aria-label={`${t('preview.include')} ${row.rowNumber}`}
                              onChange={(event) => toggleRow(row.rowNumber, event.target.checked)}
                            />
                          </TableCell>
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
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            }
            renderMobileCard={(row) => {
              const hasError = rowHasErrors(row);
              return (
                <div className="min-h-11 rounded-lg border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] p-4 text-sm">
                  <label className="flex items-center gap-2 font-semibold">
                    <input
                      type="checkbox"
                      checked={selectedRows.has(row.rowNumber)}
                      disabled={hasError}
                      onChange={(event) => toggleRow(row.rowNumber, event.target.checked)}
                    />
                    {t('preview.row')} <span dir="ltr">{row.rowNumber}</span>
                  </label>
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
              );
            }}
          />

          {preview.rows.length > 100 ? (
            <p className="text-xs text-[var(--pf-text-secondary)]">
              {t('preview.truncated', { count: preview.rows.length })}
            </p>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="secondary" loading={pending} onClick={() => setStep('mapping')}>
              {t('actions.back')}
            </Button>
            {preview.errorCount > 0 || preview.warningCount > 0 ? (
              <Button
                type="button"
                variant="secondary"
                loading={pending}
                onClick={() =>
                  downloadText(`import-validation-${kind}.csv`, buildImportIssuesReportCsv(preview))
                }
              >
                {t('actions.downloadIssues')}
              </Button>
            ) : null}
            <Button
              type="button"
              variant="primary"
              disabled={pending || selectedValidCount === 0}
              onClick={runConfirm}
            >
              {t('actions.confirm', { count: selectedValidCount })}
            </Button>
          </div>
        </Card>
      ) : null}

      {step === 'result' && result ? (
        <Card className="flex flex-col gap-4 p-5">
          <h2 className="text-sm font-semibold">{t('result.title')}</h2>
          <p className="text-sm" role="status">
            {t('result.summary', {
              created: result.created,
              failed: result.failed,
              skipped: result.skipped,
            })}
          </p>
          {result.failed > 0 ? (
            <>
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
              <Button
                type="button"
                variant="secondary"
                onClick={() =>
                  downloadText(
                    `import-failures-${result.kind}.csv`,
                    buildImportConfirmFailuresCsv(result),
                  )
                }
              >
                {t('actions.downloadFailures')}
              </Button>
            </>
          ) : null}
          <Button type="button" variant="secondary" onClick={reset}>
            {t('actions.another')}
          </Button>
        </Card>
      ) : null}
    </div>
  );
}
