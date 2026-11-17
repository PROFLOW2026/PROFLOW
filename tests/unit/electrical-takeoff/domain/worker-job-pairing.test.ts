import { describe, expect, it } from 'vitest';

import { computeBoq } from '@/modules/electrical-takeoff/domain/boq-engine';
import { parseWorkerResultPayload } from '@/modules/electrical-takeoff/domain/worker-json';
import { TAKEOFF_CONTRACT_VERSION } from '@/modules/electrical-takeoff/domain/contracts';
import {
  deriveAutomaticWorkerPairing,
  dedupeWorkerPairings,
  isLegendPdfFile,
  resolveWorkerPairing,
} from '@/modules/electrical-takeoff/domain/worker-job-pairing';
import {
  buildWorkerPairingAndSheetSelection,
  corpus7155LightGSheetSelection,
} from '@/modules/electrical-takeoff/domain/worker-job-request-build';
import { applyEdits } from '@/modules/electrical-takeoff/domain/edits';
import { getReal7155Fixture } from '@/modules/electrical-takeoff/ui/fixtures/real7155-fixture';
import workerFixtureJson from '@/modules/electrical-takeoff/ui/fixtures/real7155-worker.json';
import { applyUnpairedPdfPolicy, inferPdfDwgMerged } from '@/modules/electrical-takeoff/domain/unpaired-pdf-policy';
import { resolveSheetPairings } from '@/modules/electrical-takeoff/domain/sheet-selection';

describe('worker job pairing (PDF↔DWG merge)', () => {
  const legend = { id: 'L1', name: '7155-A1-מקרא.pdf', kind: 'pdf' as const };
  const light = { id: 'P1', name: '7155-A1-תאורה ג.pdf', kind: 'pdf' as const };
  const dwg = { id: 'D1', name: '7155-A1.dwg', kind: 'dwg' as const };

  it('excludes legend PDFs from automatic pairing', () => {
    expect(isLegendPdfFile(legend)).toBe(true);
    expect(deriveAutomaticWorkerPairing([legend, light, dwg])).toEqual([{ pdfFileId: 'P1', dwgFileId: 'D1' }]);
  });

  it('dedupes explicit + automatic pairs', () => {
    const explicit = [{ pdfFileId: 'P1', dwgFileId: 'D1' }];
    const resolved = resolveWorkerPairing([legend, light, dwg], explicit);
    expect(resolved).toEqual([{ pdfFileId: 'P1', dwgFileId: 'D1' }]);
    expect(dedupeWorkerPairings([...explicit, ...explicit])).toHaveLength(1);
  });

  it('pairs every plan PDF with every DWG when multiple plans present', () => {
    const planB = { id: 'P2', name: '7155-A1-חשמל ג.pdf', kind: 'pdf' as const };
    const pairs = deriveAutomaticWorkerPairing([light, planB, dwg]);
    expect(pairs).toHaveLength(2);
    expect(pairs).toContainEqual({ pdfFileId: 'P1', dwgFileId: 'D1' });
    expect(pairs).toContainEqual({ pdfFileId: 'P2', dwgFileId: 'D1' });
  });

  it('corpus E2E hook selects legend+light+מקרא dwg layout+תאורה ג', () => {
    const prev = process.env.TAKEOFF_E2E_CORPUS_7155_LIGHT_G;
    process.env.TAKEOFF_E2E_CORPUS_7155_LIGHT_G = '1';
    const sel = corpus7155LightGSheetSelection([legend, light, dwg]);
    expect(sel).toHaveLength(4);
    expect(sel.map((s) => s.sheetKey)).toContain('layout:תאורה ג');
    const { pairing } = buildWorkerPairingAndSheetSelection([legend, light, dwg], {});
    expect(pairing).toEqual([{ pdfFileId: 'P1', dwgFileId: 'D1' }]);
    process.env.TAKEOFF_E2E_CORPUS_7155_LIGHT_G = prev;
  });

  it('explicit wizard pairing is deduped (no double worker pairs)', () => {
    const explicit = [{ pdfFileId: 'P1', dwgFileId: 'D1' }];
    const twice = resolveWorkerPairing([legend, light, dwg], explicit);
    expect(twice).toHaveLength(1);
    const sheetPairs = resolveSheetPairings([
      {
        op: 'pair_sheets',
        pdfFileId: 'P1',
        pdfSheetKey: 'p1',
        dwgFileId: 'D1',
        dwgSheetKey: 'layout:תאורה ג',
      },
    ]);
    expect(sheetPairs).toHaveLength(1);
  });

  it('7155 wire payload has twin pairs when worker pairing ran (derived job request)', () => {
    const { view, workerBase } = getReal7155Fixture();
    const mergeStat = Number(view.workerStats?.merge_matched_pairs ?? 0);
    const raw = {
      ...(workerFixtureJson as Record<string, unknown>),
      contractVersion: TAKEOFF_CONTRACT_VERSION,
    };
    const parsed = parseWorkerResultPayload(raw);
    const pdfTwins = parsed.detections.filter((d) => d.source === 'pdf' && d.twinId);
    expect(pdfTwins.length).toBeGreaterThan(0);

    const lightgPdfTwins = parsed.detections.filter(
      (d) => d.source === 'pdf' && d.fileId === 'lightg' && d.twinId,
    );
    expect(lightgPdfTwins.length).toBeGreaterThan(0);

    const twinMap = new Map(workerBase.map((d) => [d.id, d.twinId]));
    const fileMap = new Map(workerBase.map((d) => [d.id, d.fileId]));
    const trustMerge =
      mergeStat >= 20
        ? inferPdfDwgMerged(workerBase, twinMap, mergeStat)
        : inferPdfDwgMerged(workerBase, twinMap, undefined);

    const effective = applyEdits(workerBase, []);
    const boq = computeBoq({
      detections: effective,
      workerDetections: workerBase,
      sheets: view.sheets,
      areas: [],
      catalog: view.catalog,
      ruleSet: view.ruleSet,
      linear: [],
      state: 'draft',
      twinIdByDetectionId: twinMap,
      detectionFileIdById: fileMap,
      mergeMatchedPairs: mergeStat >= 20 ? mergeStat : undefined,
    });
    expect(boq.counting?.twinsCollapsed).toBeGreaterThan(0);
    if (trustMerge) {
      const { unpairedPdfTagged } = applyUnpairedPdfPolicy(
        effective,
        view.sheets,
        twinMap,
        workerBase,
        fileMap,
        mergeStat >= 20 ? mergeStat : undefined,
      );
      expect(unpairedPdfTagged).toBe(0);
      expect(boq.counting?.countedTotal).toBe(250);
    } else {
      expect(boq.counting?.excluded.pdfOnly).toBeGreaterThan(0);
    }
  });
});