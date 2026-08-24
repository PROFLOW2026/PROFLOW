import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();

describe('OWNER GATE — Overview / Financials UX structure', () => {
  it('Overview renders owner experience without More info wrapper', () => {
    const overview = readFileSync(
      join(root, 'src/app/[locale]/(app)/projects/[projectId]/overview-tab.tsx'),
      'utf8',
    );
    expect(overview).toMatch(/ProjectOwnerActualExperience|ProjectOwnerActualExperience/);
    const match = overview.match(/<(Project\w*Actual\w*)/);
    expect(match?.[1]).toBeTruthy();
    const ownerIdx = overview.indexOf(match![1]!);
    const before = overview.slice(Math.max(0, ownerIdx - 500), ownerIdx);
    expect(before.toLowerCase()).not.toMatch(
      /<details[\s\S]{0,200}<summary[\s\S]{0,80}(more|מידע נוסף)/i,
    );
  });

  it('Financials primary order: Owner experience before billing, cash flow, advanced KPI', () => {
    const panel = readFileSync(
      join(root, 'src/modules/financials/ui/project-financials-panel.tsx'),
      'utf8',
    );
    const body = panel.slice(panel.indexOf('return ('));
    const owner = body.search(/<Project\w*Actual\w*/);
    const billing = body.search(/billingCollection|billingCollectionTitle/);
    const cash = body.search(/<CashFlowView/);
    const advanced = body.search(/advancedTitle/);
    const kpi = body.search(/<ProjectFinancialsKpiPanel/);
    expect(owner).toBeGreaterThan(-1);
    expect(billing).toBeGreaterThan(owner);
    expect(cash).toBeGreaterThan(billing);
    expect(advanced).toBeGreaterThan(cash);
    expect(kpi).toBeGreaterThan(advanced);
  });

  it('Hebrew owner story values contain no English product jargon', () => {
    const financial = JSON.parse(
      readFileSync(join(root, 'src/locales/he-IL/financial.json'), 'utf8'),
    );
    const he = financial.ownerStory ?? financial.ownerStory;
    expect(he).toBeTruthy();
    expect(String(he.title)).toContain('תמונת');
    expect(String(he.breakdownTitle ?? he.breakdownTitle)).toMatch(/ממה|מורכבת|בפועל/);
    const values: string[] = [];
    const walk = (node: unknown) => {
      if (typeof node === 'string') values.push(node);
      else if (node && typeof node === 'object') Object.values(node).forEach(walk);
    };
    walk(he);
    const banned = [/\bActual\b/i, /\bCommitment\b/i, /\bAllocation\b/i, /recognized vendor/i, /cost family/i];
    for (const value of values) {
      for (const re of banned) {
        expect(value).not.toMatch(re);
      }
    }
  });
});
