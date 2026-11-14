import type { WorkerResult, WorkerWarning } from './contracts';

/** Flatten worker payload into persistable warning rows (includes errors + sheet-derived hints). */
export function collectWorkerWarningsFromResult(result: WorkerResult): WorkerWarning[] {
  const out: WorkerWarning[] = [...result.warnings];

  for (const err of result.errors) {
    out.push({
      code: err.code,
      severity: 'error',
      message: err.message,
      fileId: err.fileId,
      sheetKey: err.sheetKey,
    });
  }

  for (const sheet of result.sheets) {
    if (sheet.analyzed === 'partial') {
      out.push({
        code: 'sheet_partial',
        severity: 'warning',
        message: sheet.note ?? `Sheet "${sheet.name}" was only partially analyzed`,
        sheetKey: sheet.sheetKey,
        fileId: sheet.fileId,
      });
    }
    if (sheet.analyzed === 'skipped') {
      out.push({
        code: 'sheet_skipped',
        severity: 'warning',
        message: sheet.note ?? `Sheet "${sheet.name}" was skipped`,
        sheetKey: sheet.sheetKey,
        fileId: sheet.fileId,
      });
    }
    for (const xref of sheet.xrefsMissing ?? []) {
      out.push({
        code: 'xref_missing',
        severity: 'warning',
        message: `Missing xref: ${xref.name}`,
        sheetKey: sheet.sheetKey,
        fileId: sheet.fileId,
      });
    }
  }

  const seen = new Set<string>();
  return out.filter((w) => {
    const key = `${w.code}|${w.severity}|${w.sheetKey ?? ''}|${w.fileId ?? ''}|${w.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function warningRowPayload(warning: WorkerWarning): Record<string, unknown> {
  return {
    severity: warning.severity,
    message: warning.message,
    sheetKey: warning.sheetKey,
    fileId: warning.fileId,
  };
}

export function warningFromRow(code: string, payload: Record<string, unknown>): WorkerWarning {
  const severity = payload.severity;
  return {
    code,
    severity: severity === 'info' || severity === 'warning' || severity === 'error' ? severity : 'warning',
    message: String(payload.message ?? code),
    sheetKey: typeof payload.sheetKey === 'string' ? payload.sheetKey : undefined,
    fileId: typeof payload.fileId === 'string' ? payload.fileId : undefined,
  };
}