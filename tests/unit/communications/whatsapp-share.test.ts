import { describe, expect, it } from 'vitest';
import { buildWhatsAppShareUrl } from '@/modules/communications/domain/whatsapp-share';

describe('buildWhatsAppShareUrl', () => {
  it('builds wa.me link with phone and encoded message', () => {
    const url = buildWhatsAppShareUrl({
      phone: '+972-50-123-4567',
      message: 'Hello\nhttps://example.com/doc',
    });
    expect(url).toBe(
      'https://wa.me/972501234567?text=Hello%0Ahttps%3A%2F%2Fexample.com%2Fdoc',
    );
  });

  it('omits phone when too short', () => {
    const url = buildWhatsAppShareUrl({ phone: '123', message: 'Hi' });
    expect(url).toBe('https://wa.me/?text=Hi');
  });

  it('trims message whitespace', () => {
    const url = buildWhatsAppShareUrl({ message: '  test  ' });
    expect(url).toBe('https://wa.me/?text=test');
  });
});
