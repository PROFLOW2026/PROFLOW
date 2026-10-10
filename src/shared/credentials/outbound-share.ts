export type NativeShareOutcome = 'shared' | 'unsupported' | 'canceled' | 'failed';

export async function copyTextToClipboard(text: string): Promise<boolean> {
  if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) return false;
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** Opens the device share sheet when available; never throws. */
export async function shareViaNativeSheet(input: {
  title?: string;
  text?: string;
  url?: string;
}): Promise<NativeShareOutcome> {
  if (typeof navigator === 'undefined' || typeof navigator.share !== 'function') {
    return 'unsupported';
  }
  const payload: ShareData = {};
  if (input.title) payload.title = input.title;
  if (input.text) payload.text = input.text;
  if (input.url) payload.url = input.url;
  if (!payload.text && !payload.url) return 'unsupported';
  try {
    if (typeof navigator.canShare === 'function' && !navigator.canShare(payload)) {
      return 'unsupported';
    }
    await navigator.share(payload);
    return 'shared';
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') return 'canceled';
    return 'failed';
  }
}

/** SMS composer deep link; body only when no recipient. */
export function buildSmsShareUrl(phone: string | null | undefined, message: string): string {
  const body = encodeURIComponent(message);
  const digits = phone?.replace(/\D/g, '');
  if (digits && digits.length >= 9) return `sms:${digits}?body=${body}`;
  return `sms:?body=${body}`;
}
