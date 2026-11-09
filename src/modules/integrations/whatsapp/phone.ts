/** Digits-only normalization for WhatsApp phone matching. */
export function normalizePhoneDigits(value: string | null | undefined): string {
  if (!value) return '';
  return value.replace(/\D/g, '');
}

export function phonesMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  const left = normalizePhoneDigits(a);
  const right = normalizePhoneDigits(b);
  if (!left || !right) return false;
  if (left === right) return true;
  if (left.length >= 9 && right.length >= 9) {
    return left.endsWith(right) || right.endsWith(left);
  }
  return false;
}
