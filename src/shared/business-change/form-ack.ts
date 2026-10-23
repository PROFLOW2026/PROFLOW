/** Hidden field set to `true` after the owner confirms a retroactive business change. */
export const BUSINESS_CHANGE_ACK_FIELD = 'changeAcknowledged';

export function readBusinessChangeAcknowledged(form: HTMLFormElement | null): boolean {
  if (!form) return false;
  const ack = form.querySelector<HTMLInputElement>(`input[name="${BUSINESS_CHANGE_ACK_FIELD}"]`);
  return ack?.value === 'true';
}

export function setBusinessChangeAcknowledged(form: HTMLFormElement | null): void {
  if (!form) return;
  const ack = form.querySelector<HTMLInputElement>(`input[name="${BUSINESS_CHANGE_ACK_FIELD}"]`);
  if (ack) ack.value = 'true';
}

/** Keep ISO year-month readable in RTL impact lines (e.g. Hebrew UI). */
export function isolateYearMonthForDisplay(yearMonth: string): string {
  return `\u2066${yearMonth}\u2069`;
}
