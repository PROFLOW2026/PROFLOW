export type CadViewPreference = {
  sheetId?: string;
  architectureMode?: 'original' | 'gray' | 'mono' | 'hidden';
  grayStrength?: number;
  hiddenLayers?: number[];
  preset?: string;
};

function key(documentId: string): string {
  return `pf-cad-view:${documentId}`;
}

export function readCadViewPreference(
  storage: Pick<Storage, 'getItem'>,
  documentId: string,
): CadViewPreference | null {
  try {
    const raw = storage.getItem(key(documentId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CadViewPreference;
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

export function writeCadViewPreference(
  storage: Pick<Storage, 'setItem'>,
  documentId: string,
  preference: CadViewPreference,
): void {
  try {
    storage.setItem(key(documentId), JSON.stringify(preference));
  } catch {
    /* A full or private store must not block the drawing. */
  }
}
