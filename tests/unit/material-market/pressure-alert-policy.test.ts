import { describe, expect, it } from 'vitest';
import {
  activeMaterialPressureIds,
  applyMaterialPressureEmission,
  materialPressureDedupeKey,
  type SimulatedMaterialPressureAlert,
} from '@/modules/material-market/domain/pressure-alert-policy';

const NOW = new Date('2026-10-19T06:00:00.000Z');
const LATER = new Date('2026-10-26T06:00:00.000Z');

function weekly(id: string, week: string, readAt: Date | null = null): SimulatedMaterialPressureAlert {
  return {
    id,
    trade: 'steel_rebar',
    dedupeKey: `material_pressure_alert:steel_rebar:${week}`,
    eventSignature: 'significant_delta:61',
    readAt,
    resolvedAt: null,
  };
}

describe('material pressure alert policy', () => {
  it('A — first steel alert is a single active row', () => {
    const rows = applyMaterialPressureEmission([], {
      trade: 'steel_rebar',
      reason: 'significant_delta',
      score: 61,
      newId: 'steel-1',
      now: NOW,
    });
    expect(activeMaterialPressureIds(rows)).toEqual(['steel-1']);
    expect(rows[0]?.dedupeKey).toBe(materialPressureDedupeKey('steel_rebar'));
  });

  it('B — repeating the same event does not add a row or revive a read alert', () => {
    const first = applyMaterialPressureEmission([], {
      trade: 'steel_rebar',
      reason: 'significant_delta',
      score: 61,
      newId: 'steel-1',
      now: NOW,
    }).map((row) => ({ ...row, readAt: NOW }));
    const second = applyMaterialPressureEmission(first, {
      trade: 'steel_rebar',
      reason: 'significant_delta',
      score: 61.2,
      newId: 'steel-2',
      now: LATER,
    });
    expect(second).toHaveLength(1);
    expect(second[0]?.id).toBe('steel-1');
    expect(second[0]?.readAt).toEqual(NOW);
    expect(activeMaterialPressureIds(second)).toEqual([]);
  });

  it('C — a new steel event replaces the previous active alert', () => {
    const first = applyMaterialPressureEmission([], {
      trade: 'steel_rebar',
      reason: 'significant_delta',
      score: 61,
      newId: 'steel-1',
      now: NOW,
    });
    const second = applyMaterialPressureEmission(first, {
      trade: 'steel_rebar',
      reason: 'high_pressure',
      score: 80,
      newId: 'steel-1',
      now: LATER,
    });
    expect(second).toHaveLength(1);
    expect(second[0]?.eventSignature).toBe('high_pressure:80');
    expect(activeMaterialPressureIds(second)).toEqual(['steel-1']);
  });

  it('D — marking the alert read removes it from the active list', () => {
    const rows = applyMaterialPressureEmission([], {
      trade: 'steel_rebar',
      reason: 'significant_delta',
      score: 61,
      newId: 'steel-1',
      now: NOW,
    }).map((row) => ({ ...row, readAt: NOW }));
    expect(activeMaterialPressureIds(rows)).toEqual([]);
    expect(rows[0]?.resolvedAt).toBeNull();
  });

  it('E — a new event after read shows again', () => {
    const read = applyMaterialPressureEmission([], {
      trade: 'steel_rebar',
      reason: 'significant_delta',
      score: 61,
      newId: 'steel-1',
      now: NOW,
    }).map((row) => ({ ...row, readAt: NOW }));
    const next = applyMaterialPressureEmission(read, {
      trade: 'steel_rebar',
      reason: 'significant_delta',
      score: 74,
      newId: 'steel-1',
      now: LATER,
    });
    expect(next[0]?.readAt).toBeNull();
    expect(activeMaterialPressureIds(next)).toEqual(['steel-1']);
  });

  it('F — another trade stays independent', () => {
    const steel = applyMaterialPressureEmission([], {
      trade: 'steel_rebar',
      reason: 'significant_delta',
      score: 61,
      newId: 'steel-1',
      now: NOW,
    });
    const concrete = applyMaterialPressureEmission(steel, {
      trade: 'concrete',
      reason: 'significant_delta',
      score: 61,
      newId: 'concrete-1',
      now: NOW,
    });
    expect(activeMaterialPressureIds(concrete)).toEqual(['steel-1', 'concrete-1']);
  });

  it('collapses weekly copies of the same steel event into one active alert', () => {
    const history = [weekly('w41', '2026-W41'), weekly('w42', '2026-W42'), weekly('w43', '2026-W43')];
    const next = applyMaterialPressureEmission(history, {
      trade: 'steel_rebar',
      reason: 'significant_delta',
      score: 61,
      newId: 'stable',
      now: NOW,
    });
    expect(activeMaterialPressureIds(next)).toEqual(['stable']);
    expect(next.filter((row) => row.resolvedAt).map((row) => row.id)).toEqual(['w41', 'w42', 'w43']);
  });

  it('does not revive a same-score event that was already read on every open copy', () => {
    const history = [weekly('w43', '2026-W43', NOW)];
    const next = applyMaterialPressureEmission(history, {
      trade: 'steel_rebar',
      reason: 'significant_delta',
      score: 61,
      newId: 'stable',
      now: LATER,
    });
    expect(next.find((row) => row.id === 'stable')?.readAt).toEqual(LATER);
    expect(activeMaterialPressureIds(next)).toEqual([]);
  });
});
