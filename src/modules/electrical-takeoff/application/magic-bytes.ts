import type { TakeoffSourceKind } from '../domain/contracts';

const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]); // %PDF-
const DWG_AC10 = new TextEncoder().encode('AC10');

export function sniffTakeoffKind(head: Uint8Array): TakeoffSourceKind | null {
  if (head.length >= 5 && head.subarray(0, 5).every((b, i) => b === PDF[i])) return 'pdf';
  if (head.length >= 4) {
    const prefix = new TextDecoder('ascii').decode(head.subarray(0, 4));
    if (prefix === 'AC10' || prefix.startsWith('AC1')) return 'dwg';
  }
  const asText = new TextDecoder('utf-8', { fatal: false }).decode(head.subarray(0, Math.min(head.length, 64)));
  if (asText.includes('SECTION') && asText.includes('HEADER')) return 'dxf';
  if (head.length >= 4 && head.subarray(0, 4).every((b, i) => b === DWG_AC10[i])) return 'dwg';
  return null;
}

export function assertMagicMatchesDeclared(head: Uint8Array, declared: TakeoffSourceKind): boolean {
  const sniffed = sniffTakeoffKind(head);
  if (!sniffed) return false;
  if (declared === 'dxf' && sniffed === 'dwg') return true;
  return sniffed === declared;
}