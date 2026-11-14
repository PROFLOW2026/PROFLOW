import path from 'node:path';

import type { TakeoffSourceKind } from '../domain/contracts';

export function inferTakeoffSourceKind(fileName: string, mimeType: string): TakeoffSourceKind | null {
  const ext = path.extname(fileName).toLowerCase();
  if (ext === '.pdf' || mimeType.toLowerCase().includes('pdf')) return 'pdf';
  if (ext === '.dwg') return 'dwg';
  if (ext === '.dxf') return 'dxf';
  return null;
}