// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import {
  BUSINESS_CHANGE_ACK_FIELD,
  isolateYearMonthForDisplay,
  readBusinessChangeAcknowledged,
  setBusinessChangeAcknowledged,
} from '@/shared/business-change/form-ack';

function formWithAck(value: string): HTMLFormElement {
  const form = document.createElement('form');
  const input = document.createElement('input');
  input.type = 'hidden';
  input.name = BUSINESS_CHANGE_ACK_FIELD;
  input.value = value;
  form.appendChild(input);
  return form;
}

describe('business change form ack', () => {
  it('reads and sets the confirmation hidden field', () => {
    const form = formWithAck('false');
    expect(readBusinessChangeAcknowledged(form)).toBe(false);
    setBusinessChangeAcknowledged(form);
    expect(readBusinessChangeAcknowledged(form)).toBe(true);
  });

  it('wraps year-month values for stable RTL display', () => {
    expect(isolateYearMonthForDisplay('2026-08')).toBe('\u20662026-08\u2069');
  });
});
