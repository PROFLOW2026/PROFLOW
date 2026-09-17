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
    loginUrl: 'https://app.example/he-IL/employee/login?u=2485',
  };

  it('builds Hebrew share message with login details', () => {
    const message = buildCredentialsShareMessage(baseInput);
    expect(message).toContain('שלום מוחמד נציר');
    expect(message).toContain('הוזמנת על ידי');
    expect(message).toContain('ProjectFlow');
    expect(message).toContain(baseInput.organizationName);
    expect(message).toContain(baseInput.loginUrl);
    expect(message).toContain('2485');
    expect(message).toContain('123456');
    expect(message).toContain('PIN אישי');
    expect(message).not.toMatch(/supabase|auth/i);
    expect(message).not.toContain('org=');
  });

  it('builds employee login URL without org parameter', () => {
    expect(buildEmployeeLoginUrl('https://app.example/', 'he-IL')).toBe(
      'https://app.example/he-IL/employee/login',
    );
    expect(buildEmployeeLoginUrl('https://app.example/', 'he-IL', '2485')).toBe(
      'https://app.example/he-IL/employee/login?u=2485',
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

  it('encodes mailto subject/body with encodeURIComponent (no + for spaces)', () => {
    const subject = 'פרטי כניסה — מתח ח.י';
    const body = buildCredentialsShareMessage({ ...baseInput, temporaryPin: '272482' });
    const url = buildMailtoUrl('worker@example.com', subject, body);

    expect(url).not.toMatch(/[?&]body=[^&]*\+/);
    expect(url).not.toMatch(/[?&]subject=[^&]*\+/);

    const query = url.split('?')[1]!;
    const encodedSubject = query.match(/^subject=([^&]*)/)?.[1];
    const encodedBody = query.match(/&body=(.*)$/)?.[1];
    expect(encodedSubject).toBeTruthy();
    expect(encodedBody).toBeTruthy();
    expect(decodeURIComponent(encodedSubject!)).toBe(subject);
    expect(decodeURIComponent(encodedBody!)).toBe(body);

    expect(body).toContain('שלום מוחמד נציר');
    expect(body).toContain('https://app.example/he-IL/employee/login?u=2485');
    expect(body).toContain('272482');
    expect(body.split('\n').length).toBeGreaterThan(5);
  });

  it('builds mailto without recipient when email is missing', () => {
    const url = buildMailtoUrl(null, 'נושא', 'שורה אחת');
    expect(url.startsWith('mailto:?subject=')).toBe(true);
    expect(url).not.toContain('+');
  });
});
