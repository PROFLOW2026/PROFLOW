/** Provider convenience file. ProjectFlow database stays the source of truth. */
export const PROJECT_INFO_FILE_NAME = 'פרטי הפרויקט.txt';
export const CLIENT_INFO_FILE_NAME = 'פרטי הלקוח.txt';

const PROJECT_STATUS_LABELS: Record<string, string> = {
  draft: 'טיוטה',
  active: 'פעיל',
  on_hold: 'מושהה',
  completed: 'הושלם',
  cancelled: 'בוטל',
  archived: 'בארכיון',
};

export interface ProjectInfoTextInput {
  readonly projectNumber: string | null;
  readonly projectName: string;
  readonly projectStatus: string | null;
  readonly location: string | null;
  readonly startDate: string | null;
  readonly description: string | null;
  readonly notes: string | null;
  readonly clientName: string | null;
  readonly clientRegistration: string | null;
  readonly contactName: string | null;
  readonly phone: string | null;
  readonly email: string | null;
  readonly clientAddress: string | null;
}

export interface ClientInfoTextInput {
  readonly clientName: string;
  readonly clientRegistration: string | null;
  readonly contactName: string | null;
  readonly phone: string | null;
  readonly email: string | null;
  readonly clientAddress: string | null;
  readonly notes: string | null;
}

function line(label: string, value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? '';
  if (!trimmed) return null;
  return `${label}: ${trimmed}`;
}

function section(title: string, rows: Array<string | null>): string[] {
  return [title, '====================', '', ...rows.filter((row): row is string => row !== null)];
}

export function formatStoredClientAddress(input: {
  readonly addressLine1: string | null;
  readonly addressLine2: string | null;
  readonly city: string | null;
  readonly region: string | null;
  readonly postalCode: string | null;
} | null): string | null {
  if (!input) return null;
  const parts = [input.addressLine1, input.addressLine2, input.city, input.region, input.postalCode]
    .map((part) => part?.trim() ?? '')
    .filter((part) => part.length > 0);
  return parts.length > 0 ? parts.join(', ') : null;
}

export function preferredClientRegistration(
  identifiers: readonly { readonly type: string; readonly value: string }[],
): string | null {
  for (const type of ['company_number', 'tax_id', 'vat_number']) {
    const match = identifiers.find((row) => row.type === type && row.value.trim().length > 0);
    if (match) return match.value.trim();
  }
  return null;
}

/** UTF-8 text stored in the provider. Blank fields are omitted. */
export function buildProjectInfoText(input: ProjectInfoTextInput): string {
  const status = input.projectStatus
    ? (PROJECT_STATUS_LABELS[input.projectStatus] ?? input.projectStatus)
    : null;
  const blocks = [
    section('פרטי הפרויקט', [
      line('מספר פרויקט', input.projectNumber),
      line('שם הפרויקט', input.projectName),
      line('סטטוס', status),
      line('מיקום / כתובת', input.location),
      line('תאריך פתיחה', input.startDate),
    ]),
    section('פרטי הלקוח', [
      line('שם הלקוח', input.clientName),
      line('ח.פ / עוסק', input.clientRegistration),
      line('איש קשר', input.contactName),
      line('טלפון', input.phone),
      line('אימייל', input.email),
      line('כתובת הלקוח', input.clientAddress),
    ]),
    section('מידע נוסף', [
      line('תיאור הפרויקט', input.description),
      line('הערות', input.notes),
    ]),
  ];
  return `${blocks.map((rows) => rows.join('\n')).join('\n\n')}\n\nנוצר אוטומטית על ידי ProjectFlow\n`;
}

/** UTF-8 client convenience file. Blank fields are omitted. */
export function buildClientInfoText(input: ClientInfoTextInput): string {
  const rows = [
    line('שם הלקוח', input.clientName),
    line('ח.פ / עוסק', input.clientRegistration),
    line('איש קשר', input.contactName),
    line('טלפון', input.phone),
    line('אימייל', input.email),
    line('כתובת', input.clientAddress),
    line('הערות', input.notes),
  ];
  return `${section('פרטי הלקוח', rows).join('\n')}\n\nנוצר אוטומטית על ידי ProjectFlow\n`;
}
