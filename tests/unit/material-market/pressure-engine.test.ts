import { describe, expect, it } from 'vitest';
import { parseCbsJsonForTest } from '@/modules/material-market/sources/cbs-adapter';
import { parseFredCsvForTest } from '@/modules/material-market/sources/fred-adapter';
import {
  buildCopperIls,
  computeAllTradeSnapshots,
  computeTradeMonth,
  driverSignal,
  momentumLabel,
  nMonthChange,
  scoreDirection,
  signalToComponentScore,
} from '@/modules/material-market/domain/pressure-engine';
import { TRADE_WEIGHTS } from '@/modules/material-market/domain/methodology';
import { buildChangeSummary } from '@/modules/material-market/domain/explanations';
import {
  filterCompleteSnapshots,
  finalizeCompleteSnapshots,
  isCompleteSnapshot,
  pickLatestCompleteSnapshot,
} from '@/modules/material-market/domain/complete-snapshot';
import { SOURCE_SEED } from '@/modules/material-market/sources/registry';
import { readFileSync } from 'node:fs';
import path from 'node:path';

describe('material-market pressure engine', () => {
  it('normalizes commodity signal with clamping', () => {
    const series: Record<string, number> = {
      '2025-01': 100,
      '2025-02': 110,
      '2025-03': 120,
      '2025-04': 130,
      '2025-05': 140,
      '2025-06': 150,
      '2025-07': 160,
    };
    const signal = driverSignal(series, '2025-07', 'commodity');
    expect(signal).not.toBeNull();
    expect(signal!).toBeGreaterThan(0.5);
    const score = signalToComponentScore(signal);
    expect(score).toBeLessThanOrEqual(100);
    expect(score).toBeGreaterThan(50);
  });

  it('computes weighted trade score with renormalization', () => {
    const result = computeTradeMonth(
      { copper: 70, cbs: 60, fx: null, aluminium: null, energy: null, supplier: null },
      TRADE_WEIGHTS.electrical,
    );
    expect(result.coverage).toBeCloseTo(0.6, 5);
    expect(result.confidence).toBe('medium');
    expect(result.score).toBeGreaterThan(60);
  });

  it('marks low confidence below 60% coverage', () => {
    const result = computeTradeMonth({ copper: 55 }, TRADE_WEIGHTS.electrical);
    expect(result.confidence).toBe('low');
    expect(result.coverage).toBeCloseTo(0.35, 5);
  });

  it('maps direction bands', () => {
    expect(scoreDirection(15)).toBe('strong_down');
    expect(scoreDirection(35)).toBe('down');
    expect(scoreDirection(50)).toBe('neutral');
    expect(scoreDirection(65)).toBe('up');
    expect(scoreDirection(85)).toBe('strong_up');
  });

  it('computes momentum labels', () => {
    expect(momentumLabel(12, null)).toBe('rising_fast');
    expect(momentumLabel(5, null)).toBe('rising');
    expect(momentumLabel(-11, null)).toBe('falling_fast');
    expect(momentumLabel(1, 9)).toBe('rising');
    expect(momentumLabel(0, 0)).toBe('stable');
  });

  it('derives COPPER_ILS from USD series', () => {
    const copper = { '2025-06': 8000, '2025-07': 8200 };
    const fx = { '2025-06': 3.6, '2025-07': 3.7 };
    const ils = buildCopperIls(copper, fx);
    expect(ils['2025-07']).toBeCloseTo(8200 * 3.7, 2);
  });

  it('parses FRED CSV fixture', () => {
    const csv = `observation_date,PCOPPUSDM
2025-05-01,9500
2025-06-01,.
2025-07-01,9800`;
    const series = parseFredCsvForTest(csv, '2016-01');
    expect(series['2025-05']).toBe(9500);
    expect(series['2025-06']).toBeUndefined();
    expect(series['2025-07']).toBe(9800);
  });

  it('parses CBS JSON fixture', () => {
    const series = parseCbsJsonForTest({
      month: [
        {
          date: [
            { year: 2025, month: 6, currBase: { value: 110.5 } },
            { year: 2025, month: 7, currBase: { value: 111.2 } },
          ],
        },
      ],
    });
    expect(series['2025-06']).toBe(110.5);
    expect(series['2025-07']).toBe(111.2);
  });

  it('builds deterministic change summary without forecast language', () => {
    const text = buildChangeSummary({
      trade: 'steel_rebar',
      direction: 'up',
      momentum: 'rising_fast',
      score1mChange: 23,
      driversUp: ['scrap', 'steel'],
      driversDown: [],
      t: (key) => key,
    });
    expect(text).not.toMatch(/forecast|buy|wait|תחזית|יעלה|ירד|קנה|חכה/i);
  });

  it('filters and finalizes complete snapshots only', () => {
    const rows = computeAllTradeSnapshots({
      COPPER_ILS: { '2025-05': 100, '2025-06': 101, '2025-07': 102 },
      CBS_CONDUCTORS: { '2025-05': 100, '2025-06': 101, '2025-07': 102 },
      USD_ILS: { '2025-05': 3.6, '2025-06': 3.6, '2025-07': 3.6 },
      ALUMINIUM_USD: { '2025-05': 2000, '2025-06': 2010, '2025-07': 2020 },
      OIL_OR_ENERGY: { '2025-05': 70, '2025-06': 71, '2025-07': 72 },
      CBS_PLUMBING_BLEND: { '2025-05': 100, '2025-06': 101, '2025-07': 102 },
      PVC_POLYMER_PROXY: { '2025-05': 100, '2025-06': 101, '2025-07': 102 },
      CBS_REBAR: { '2025-05': 100, '2025-06': 101, '2025-07': 102 },
      STEEL_SCRAP: { '2025-05': 300, '2025-06': 310, '2025-07': 320 },
      IRON_ORE: { '2025-05': 110, '2025-06': 112, '2025-07': 115 },
      HRC_STEEL: { '2025-05': 700, '2025-06': 710, '2025-07': 720 },
    });
    const complete = finalizeCompleteSnapshots(rows);
    expect(complete.every(isCompleteSnapshot)).toBe(true);
    expect(complete.length).toBeLessThanOrEqual(rows.length);
    const latest = pickLatestCompleteSnapshot(complete, 'plumbing');
    expect(latest?.snapshotDate).toBe('2025-07-01');
    expect(filterCompleteSnapshots(rows).length).toBe(complete.length);
  });

  it('excludes plumbing supplier weight when no local series exists', () => {
    const rows = computeAllTradeSnapshots({
      COPPER_ILS: {},
      CBS_CONDUCTORS: {},
      USD_ILS: { '2025-07': 3.7 },
      ALUMINIUM_USD: {},
      OIL_OR_ENERGY: { '2025-06': 70, '2025-07': 72 },
      CBS_PLUMBING_BLEND: { '2025-06': 100, '2025-07': 103 },
      PVC_POLYMER_PROXY: { '2025-06': 100, '2025-07': 101 },
      CBS_REBAR: {},
      STEEL_SCRAP: {},
      IRON_ORE: {},
      HRC_STEEL: {},
    });
    const plumbing = rows.find((r) => r.trade === 'plumbing' && r.snapshotDate === '2025-07-01');
    expect(plumbing?.localConfirmation).toBe('no_local_data');
    expect(plumbing?.components.supplier).toBeNull();
  });

  it('nMonthChange returns percent move', () => {
    const series = { '2025-05': 100, '2025-06': 110 };
    expect(nMonthChange(series, '2025-06', 1)).toBeCloseTo(10, 5);
  });

  it('seeds only verified production sources without local placeholders', () => {
    const active = SOURCE_SEED.filter((s) => s.isActive);
    expect(active.some((s) => s.code.includes('GOLAN'))).toBe(false);
    expect(active.some((s) => s.code.includes('ERCO'))).toBe(false);
    expect(active.every((s) => ['fred', 'cbs', 'derived'].includes(s.sourceType))).toBe(true);
  });
});

describe('material-market migration 0132 RLS', () => {
  it('restricts authenticated SELECT to materials.read org RBAC', () => {
    const sql = readFileSync(
      path.resolve('drizzle/migrations/0132_material_market_monitor.sql'),
      'utf8',
    );
    expect(sql).toContain("app.has_org_permission(m.organization_id, 'materials.read')");
    expect(sql).not.toMatch(/FOR SELECT TO authenticated\s*\n\s*USING \(true\)/);
    expect(sql).toContain('service_role');
    expect(sql).toContain('material_pressure_snapshots_score_range');
  });
});

describe('material-market forbidden UI wording', () => {
  const localeFiles = [
    'src/locales/he-IL/materialMarket.json',
    'src/locales/en/materialMarket.json',
    'src/locales/ar/materialMarket.json',
    'src/locales/ru/materialMarket.json',
  ];

  for (const file of localeFiles) {
    it(`has no predictive/trading language in ${file}`, () => {
      const parsed = JSON.parse(readFileSync(path.resolve(file), 'utf8')) as Record<
        string,
        unknown
      >;
      const { disclaimer: _d, methodologyDisclaimer: _m, ...rest } = parsed;
      const content = JSON.stringify(rest).toLowerCase();
      expect(content).not.toMatch(/forecast|prediction|predicted|buy now|wait signal|probability up/);
      expect(content).not.toMatch(/תחזית|צפוי לעלות|צפוי לרדת|קנה|לקנות עכשיו|חכה|כדאי לקנות/);
    });
  }
});
