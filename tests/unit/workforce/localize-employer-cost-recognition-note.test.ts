import { describe, expect, it } from 'vitest';
import { localizeEmployerCostRecognitionNote } from '@/modules/workforce/ui/localize-employer-cost-recognition-note';
import { formatMoneyString } from '@/shared/money';

describe('localizeEmployerCostRecognitionNote', () => {
  const labels = {
    recognitionNoteFullMonth: ({
      defined,
      recognized,
    }: {
      defined: string;
      recognized: string;
    }) => `עלות מעסיק חודשית מוגדרת ${defined}; הוכר חודש מלא ${recognized}`,
    recognitionNoteAccrued: ({
      defined,
      recognized,
      days,
      workingDays,
    }: {
      defined: string;
      recognized: string;
      days: number;
      workingDays: string;
    }) =>
      `עלות מעסיק חודשית מוגדרת ${defined}; נצבר עד כה ${recognized} (${days} מתוך ${workingDays} ימי עבודה)`,
  };

  it('localizes English full-month accrual notes with 2dp money', () => {
    const result = localizeEmployerCostRecognitionNote(
      'Defined monthly employer cost 33000.000000; recognized full month 33000.000000',
      { currency: 'ILS', locale: 'he-IL', labels },
    );
    const money = formatMoneyString('33000.000000', 'ILS', 'he-IL');
    expect(result).toBe(`עלות מעסיק חודשית מוגדרת ${money}; הוכר חודש מלא ${money}`);
    expect(result).toContain('₪');
    expect(result).not.toContain('33000.000000');
    expect(result).not.toContain('Defined monthly');
  });

  it('localizes English open-month accrued notes', () => {
    const result = localizeEmployerCostRecognitionNote(
      'Defined monthly employer cost 33000.000000; accrued to date 11000.000000 (7 of 21 work days)',
      { currency: 'ILS', locale: 'he-IL', labels },
    );
    expect(result).toContain('נצבר עד כה');
    expect(result).toContain('7 מתוך 21');
    expect(result).toContain('₪');
    expect(result).not.toContain('accrued to date');
  });

  it('leaves owner-authored notes unchanged', () => {
    expect(
      localizeEmployerCostRecognitionNote('הערה ידנית של הבעלים', {
        currency: 'ILS',
        locale: 'he-IL',
        labels,
      }),
    ).toBe('הערה ידנית של הבעלים');
  });
});
