import { describe, expect, it } from 'vitest';
import {
  buildCredentialsShareMessage,
  buildEmployeeLoginUrl,
  buildMailtoUrl,
  buildWhatsAppShareUrl,
  normalizeWhatsAppPhone,
} from '@/modules/employee-app/domain/credentials-share';

describe('credentials-share', () => {
  const baseInput = {
    employeeName: 'מוחמד נציר',
    organizationName: 'מתח ח.י הנדסת חשמל בע"מ',
    username: '2485',
    temporaryPin: '123456',
    temporaryPinExpiresAt: new Date('2026-09-18T07:49:00.000Z'),
    loginUrl: 'https://app.example/he-IL/employee/login?org=abc',
  };

  it('builds Hebrew share message with login details', () => {
    const message = buildCredentialsShareMessage(baseInput);
    expect(message).toContain('שלום מוחמד נציר');
    expect(message).toContain(baseInput.loginUrl);
    expect(message).toContain('2485');
    expect(message).toContain('123456');
    expect(message).toContain('PIN אישי');
    expect(message).not.toMatch(/supabase|auth/i);
  });

  it('builds employee login URL with locale and org query', () => {
    expect(buildEmployeeLoginUrl('https://app.example/', 'he-IL', 'org-1')).toBe(
      'https://app.example/he-IL/employee/login?org=org-1',
    );
  });

  it('normalizes Israeli phone numbers for WhatsApp', () => {
    expect(normalizeWhatsAppPhone('050-1234567')).toBe('972501234567');
    expect(normalizeWhatsAppPhone('972501234567')).toBe('972501234567');
    expect(normalizeWhatsAppPhone(null)).toBeNull();
  });

  it('builds WhatsApp share URL with phone when available', () => {
    const url = buildWhatsAppShareUrl('972501234567', 'שלום');
    expect(url).toMatch(/^https:\/\/wa\.me\/972501234567\?text=/);
  });

  it('builds mailto with recipient when email exists', () => {
    const url = buildMailtoUrl('worker@example.com', 'נושא', 'גוף');
    expect(url).toMatch(/^mailto:worker@example\.com\?/);
    expect(url).toContain('subject=');
    expect(url).toContain('body=');
  });
});
