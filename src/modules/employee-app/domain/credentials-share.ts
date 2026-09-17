export interface EmployeeCredentialsShareInput {
  readonly employeeName: string;
  readonly organizationName: string;
  readonly username: string;
  readonly temporaryPin: string;
  readonly temporaryPinExpiresAt: Date;
  readonly loginUrl: string;
}

export function formatCredentialExpiry(date: Date, locale = 'he-IL'): string {
  return date.toLocaleString(locale, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function buildEmployeeLoginUrl(
  appOrigin: string,
  locale: string,
  username?: string,
): string {
  const base = appOrigin.replace(/\/$/, '');
  const path = `${base}/${locale}/employee/login`;
  const trimmed = username?.trim();
  if (!trimmed) return path;
  return `${path}?u=${encodeURIComponent(trimmed)}`;
}

export function buildCredentialsShareMessage(input: EmployeeCredentialsShareInput): string {
  return [
    `שלום ${input.employeeName},`,
    '',
    `הוזמנת על ידי ${input.organizationName} להשתמש באפליקציית העובדים של ProjectFlow.`,
    '',
    'קישור לכניסה:',
    input.loginUrl,
    '',
    'שם משתמש:',
    input.username,
    '',
    'PIN זמני:',
    input.temporaryPin,
    '',
    'בכניסה הראשונה תתבקש לבחור PIN אישי חדש.',
  ].join('\n');
}

export function buildCredentialsEmailSubject(organizationName: string): string {
  return `פרטי כניסה לאפליקציית העובדים — ${organizationName}`;
}

export function normalizeWhatsAppPhone(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null;
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 0) return null;
  if (digits.startsWith('972')) return digits;
  if (digits.startsWith('0')) return `972${digits.slice(1)}`;
  if (digits.length === 9) return `972${digits}`;
  return digits.length >= 10 ? digits : null;
}

export function buildWhatsAppShareUrl(phone: string | null, message: string): string {
  const text = encodeURIComponent(message);
  if (phone) return `https://wa.me/${phone}?text=${text}`;
  return `https://wa.me/?text=${text}`;
}

export function buildMailtoUrl(
  email: string | null | undefined,
  subject: string,
  body: string,
): string {
  const params = new URLSearchParams();
  params.set('subject', subject);
  params.set('body', body);
  const recipient = email?.trim();
  if (recipient) return `mailto:${recipient}?${params.toString()}`;
  return `mailto:?${params.toString()}`;
}
