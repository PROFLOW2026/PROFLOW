import { describe, expect, it, vi } from 'vitest';
import { isIdempotentOccurrence } from '@/modules/tasks/domain/recurrence';
import { buildRruleFromPreset, detectPresetFromRrule } from '@/modules/tasks/domain/recurrence-presets';
import type { TaskRecurrenceOccurrence } from '@/modules/tasks/domain/types';

describe('task recurrence idempotency', () => {
  it('detects duplicate occurrence slots before insert', () => {
    const at = new Date('2026-09-21T09:00:00.000Z');
    const existing: Pick<TaskRecurrenceOccurrence, 'ruleId' | 'occurrenceAt'>[] = [
      { ruleId: 'rule-1', occurrenceAt: at },
    ];

    expect(isIdempotentOccurrence(existing, 'rule-1', at)).toBe(true);
    expect(isIdempotentOccurrence(existing, 'rule-1', new Date('2026-09-22T09:00:00.000Z'))).toBe(
      false,
    );
    expect(isIdempotentOccurrence(existing, 'rule-2', at)).toBe(false);
  });

  it('builds stable RRULE presets and round-trips detection', () => {
    const startsAt = new Date('2026-09-21T09:00:00.000Z');
    const daily = buildRruleFromPreset('daily', { startsAt });
    expect(detectPresetFromRrule(daily).preset).toBe('daily');

    const weekdays = buildRruleFromPreset('weekdays', { startsAt });
    expect(detectPresetFromRrule(weekdays).preset).toBe('weekdays');

    const custom = buildRruleFromPreset('custom', { startsAt, interval: 3 });
    expect(custom).toBe('FREQ=DAILY;INTERVAL=3');
    expect(detectPresetFromRrule(custom)).toMatchObject({ preset: 'custom', interval: 3 });
  });

  it('treats on-conflict-do-nothing insert as idempotent skip', async () => {
    const insertOccurrence = vi.fn(async () => null);
    const existingAt = new Date('2026-09-21T09:00:00.000Z');
    const existing: Pick<TaskRecurrenceOccurrence, 'ruleId' | 'occurrenceAt'>[] = [
      { ruleId: 'rule-1', occurrenceAt: existingAt },
    ];

    let generated = 0;
    let skipped = 0;
    const slots = [{ ruleId: 'rule-1', occurrenceAt: existingAt }];

    for (const slot of slots) {
      if (isIdempotentOccurrence(existing, slot.ruleId, slot.occurrenceAt)) {
        skipped += 1;
        continue;
      }
      const occurrence = await insertOccurrence();
      if (occurrence) generated += 1;
    }

    expect(insertOccurrence).not.toHaveBeenCalled();
    expect(generated).toBe(0);
    expect(skipped).toBe(1);
  });
});
