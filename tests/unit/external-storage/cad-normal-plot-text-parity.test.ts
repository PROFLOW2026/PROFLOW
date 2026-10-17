import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  compareNormalPlotTextParity,
  type CadParityScene,
} from '../../fixtures/cad/normal-plot-parity/compare-text-parity';

const fixturePath = path.join(
  process.cwd(),
  'tests/fixtures/cad/normal-plot-parity/synthetic-normal-plot.json',
);

type SyntheticFixture = {
  readonly normal: CadParityScene;
  readonly plot: CadParityScene;
  readonly plotMissingOne: CadParityScene;
};

function loadSyntheticFixture(): SyntheticFixture {
  return JSON.parse(fs.readFileSync(fixturePath, 'utf8')) as SyntheticFixture;
}

describe('CAD Normal vs Plot text parity', () => {
  it('synthetic fixture has the same text keys in Normal and Plot', () => {
    const fixture = loadSyntheticFixture();
    expect(fixture.normal.texts.length).toBeGreaterThan(0);
    expect(fixture.plot.texts.length).toBe(fixture.normal.texts.length);

    const result = compareNormalPlotTextParity(fixture.normal, fixture.plot);
    expect(result.textTotalNormal).toBe(result.textTotalPlot);
    expect(result.onlyNormal).toBe(0);
    expect(result.onlyPlot).toBe(0);
    expect(result.gpuMarkedNormal).toBe(0);
  });

  it('detects Plot text keys that are missing relative to Normal', () => {
    const fixture = loadSyntheticFixture();
    const result = compareNormalPlotTextParity(fixture.normal, fixture.plotMissingOne);
    expect(result.onlyNormal).toBe(1);
    expect(result.onlyPlot).toBe(0);
    expect(result.textTotalNormal).toBeGreaterThan(result.textTotalPlot);
  });
});
