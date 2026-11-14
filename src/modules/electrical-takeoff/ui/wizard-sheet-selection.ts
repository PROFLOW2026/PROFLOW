export type WizardUploadFile = {
  readonly fileId: string | null;
  readonly kind: 'pdf' | 'dwg' | 'dxf';
  readonly name: string;
};

/** Build worker sheetSelection from included files and optional DWG layout names (pre-analysis). */
export function buildWizardSheetSelection(
  files: readonly WizardUploadFile[],
  selectedKeys: ReadonlySet<string>,
  dwgLayoutNames: string,
): { fileId: string; sheetKey: string }[] {
  const included = files.filter(
    (f) => f.fileId && (selectedKeys.has(f.name) || selectedKeys.has(f.fileId)),
  );
  const out: { fileId: string; sheetKey: string }[] = [];
  for (const f of included) {
    if (f.kind === 'pdf' && f.fileId) out.push({ fileId: f.fileId, sheetKey: 'p1' });
  }
  const dwg = included.find((f) => (f.kind === 'dwg' || f.kind === 'dxf') && f.fileId);
  const raw = dwgLayoutNames.trim();
  if (dwg?.fileId && raw) {
    for (const part of raw.split(/[,;\n]/)) {
      const name = part.trim();
      if (!name) continue;
      out.push({
        fileId: dwg.fileId,
        sheetKey: name.startsWith('layout:') ? name : `layout:${name}`,
      });
    }
  }
  return out;
}