import { describe, expect, it } from 'vitest';
import {
  EMPLOYEE_TIME_ENTRIES_PATH,
  resolveTimeEntryReturnPath,
} from '@/modules/workforce/application/time-entry-return-path';

describe('resolveTimeEntryReturnPath', () => {
  it('defaults to owner time list', () => {
    const formData = new FormData();
    expect(resolveTimeEntryReturnPath(formData)).toBe('/workforce/time');
  });

  it('returns employee hours list when hidden field is set', () => {
    const formData = new FormData();
    formData.set('returnPath', EMPLOYEE_TIME_ENTRIES_PATH);
    expect(resolveTimeEntryReturnPath(formData)).toBe(EMPLOYEE_TIME_ENTRIES_PATH);
  });

  it('ignores unknown return paths', () => {
    const formData = new FormData();
    formData.set('returnPath', '/employee');
    expect(resolveTimeEntryReturnPath(formData)).toBe('/workforce/time');
  });
});
