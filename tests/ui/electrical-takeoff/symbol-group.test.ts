import { describe, expect, it } from 'vitest';
import { sameSymbolDetections, symbolGroupKey, undecodedLegendExemplars } from '@/modules/electrical-takeoff/ui/symbol-group';

describe('symbol groups for manual legend', () => {
  it('groups detections that share the worker signature even when their tags differ', () => {
    const a = { id: 'p1#1', sheetKey: 'p1', signature: 'shape:abc', rawClass: 'UNK', tagText: 'סמל ללא סווג #2' };
    const b = { id: 'p2#4', sheetKey: 'p2', signature: 'shape:abc', rawClass: 'sw1', tagText: null };
    const other = { id: 'p1#9', sheetKey: 'p1', signature: 'shape:other', rawClass: 'UNK', tagText: 'סמל ללא סווג #2' };
    expect(sameSymbolDetections(a, [a, b, other]).map((d) => d.id)).toEqual(['p1#1', 'p2#4']);
  });

  it('groups unclassified detections that share the worker signature tag', () => {
    const a = { id: 'p1#1', sheetKey: 'p1', rawClass: 'UNK', tagText: 'סמל ללא סווג #2', typeKey: null };
    const b = { id: 'p1#8', sheetKey: 'p1', rawClass: 'UNK', tagText: 'סמל ללא סווג #2', typeKey: null };
    const other = { id: 'p1#9', sheetKey: 'p1', rawClass: 'UNK', tagText: 'סמל ללא סווג #3', typeKey: null };
    expect(symbolGroupKey(a)).toBe(symbolGroupKey(b));
    expect(sameSymbolDetections(a, [a, b, other]).map((d) => d.id)).toEqual(['p1#1', 'p1#8']);
  });

  it('keeps unknown shapes without a shared signature as single marks', () => {
    const a = { id: 'p1#1', sheetKey: 'p1', rawClass: 'UNK', tagText: null };
    const b = { id: 'p1#2', sheetKey: 'p1', rawClass: 'UNK', tagText: null };
    expect(sameSymbolDetections(a, [a, b])).toEqual([a]);
  });

  it('groups a block or legend identity and ignores drawing noise', () => {
    const socket = { id: 'p1#3', sheetKey: 'p1', rawClass: 'sw1', tagText: 'T22' };
    const twin = { id: 'p2#1', sheetKey: 'p2', rawClass: 'sw1', tagText: null };
    const noise = { id: 'p1#4', sheetKey: 'p1', rawClass: 'sw1', tagText: null, reasons: ['drawing_noise'] };
    expect(sameSymbolDetections(socket, [socket, twin, noise]).map((d) => d.id)).toEqual(['p1#3', 'p2#1']);
  });

  it('keeps shape clusters on the sheet where they were found', () => {
    const here = { id: 'p1#1', sheetKey: 'p1', rawClass: 'C1', tagText: null };
    const sameSheet = { id: 'p1#2', sheetKey: 'p1', rawClass: 'C1', tagText: null };
    const otherSheet = { id: 'p2#1', sheetKey: 'p2', rawClass: 'C1', tagText: null };
    expect(sameSymbolDetections(here, [here, sameSheet, otherSheet]).map((d) => d.id)).toEqual(['p1#1', 'p1#2']);
  });

  it('does not treat a technical detection id as a symbol identity', () => {
    const a = { id: 'p1#1', sheetKey: 'p1', rawClass: 'p1#1', tagText: null };
    const b = { id: 'p1#2', sheetKey: 'p1', rawClass: 'p1#1', tagText: null };
    expect(sameSymbolDetections(a, [a, b])).toEqual([a]);
  });

  it('groups every plan mark of an unread legend row even when each mask signature differs', () => {
    const legend = { id: 'p1#1', sheetKey: 'p1', signature: 'shape:inst-1', rawClass: 'L7', legendKey: 'L7', typeKey: null };
    const otherSheet = { id: 'p2#4', sheetKey: 'p2', signature: 'shape:inst-2', rawClass: 'L7', typeKey: null };
    const different = { id: 'p1#9', sheetKey: 'p1', signature: 'shape:inst-9', rawClass: 'L8', legendKey: 'L8', typeKey: null };
    expect(sameSymbolDetections(legend, [legend, otherSheet, different]).map((d) => d.id)).toEqual(['p1#1', 'p2#4']);
  });

  it('still groups a shared signature when the legend keys differ', () => {
    const a = { id: 'p1#1', sheetKey: 'p1', signature: 'shape:same', rawClass: 'L1', typeKey: null };
    const b = { id: 'p1#2', sheetKey: 'p1', signature: 'shape:same', rawClass: 'UNK', typeKey: null };
    expect(sameSymbolDetections(a, [a, b]).map((d) => d.id)).toEqual(['p1#1', 'p1#2']);
  });

  it('lists one exemplar per unread legend key', () => {
    const a = { id: 'p1#1', sheetKey: 'p1', signature: 'shape:1', rawClass: 'L7', typeKey: null };
    const b = { id: 'p1#2', sheetKey: 'p1', signature: 'shape:2', rawClass: 'L7', typeKey: 'control.switch' };
    const typed = { id: 'p1#3', sheetKey: 'p1', signature: 'shape:3', rawClass: 'L2', typeKey: 'light.recessed' };
    const rows = undecodedLegendExemplars([b, typed, a]);
    expect(rows).toEqual([{ legendKey: 'L7', exemplarId: 'p1#1', count: 2 }]);
  });
});
