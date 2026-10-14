import { describe, expect, it } from 'vitest';
import {
  sumRecognitionAtomNetInMonth,
  type RecognitionAtom,
} from '@/modules/financials/domain/recognition-atoms';
import { money } from '@/shared/money';
import { businessDate } from '@/shared/dates';

const ILS = 'ILS';

function atom(input: {
  sourceRowId: string;
  net: ReturnType<typeof money>;
  recognitionYearMonth?: string;
  estimate?: boolean;
}): RecognitionAtom {
  const recognitionYearMonth = input.recognitionYearMonth ?? '2026-03';
  return {
    source: 'expense',
    sourceRowId: input.sourceRowId,
    net: input.net,
    gross: input.net,
    currency: ILS,
    recognitionYearMonth,
    recognitionDate: businessDate(`${recognitionYearMonth}-15`),
    projectId: 'p1',
    overhead: false,
    costFamily: 'direct_project',
    estimate: input.estimate ?? false,
  };
}

describe('recognition-atoms (F03 scaffold)', () => {
  it('sums finalized atoms in one month and skips estimates', () => {
    const atoms: RecognitionAtom[] = [
      atom({ sourceRowId: 'e1', net: money('1000', ILS) }),
      atom({ sourceRowId: 'e2', net: money('500', ILS), estimate: true }),
      atom({
        sourceRowId: 'e3',
        net: money('2000', ILS),
        recognitionYearMonth: '2026-04',
      }),
    ];
    const march = sumRecognitionAtomNetInMonth(atoms, '2026-03');
    expect(march?.amount).toBe('1000.000000');
  });
});
