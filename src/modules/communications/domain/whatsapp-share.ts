/**
 * WhatsApp deep-link helper — no API integration; opens wa.me with prefilled text.
 */

export function buildWhatsAppShareUrl(input: {
  readonly phone?: string | null;
  readonly message: string;
}): string {
  const encoded = encodeURIComponent(input.message.trim());
  const digits = input.phone?.replace(/\D/g, '') ?? '';
  if (digits.length >= 8) {
    return `https://wa.me/${digits}?text=${encoded}`;
  }
  return `https://wa.me/?text=${encoded}`;
}
