export const CLIENT_DETAIL_TABS = [
  'overview',
  'projects',
  'money',
  'sales',
  'documents',
  'activity',
  'details',
] as const;

export type ClientDetailTabKey = (typeof CLIENT_DETAIL_TABS)[number];

export function parseClientDetailTab(raw: string | undefined): ClientDetailTabKey {
  if (raw && (CLIENT_DETAIL_TABS as readonly string[]).includes(raw)) {
    return raw as ClientDetailTabKey;
  }
  return 'overview';
}

export function clientDetailTabHref(clientId: string, tab: ClientDetailTabKey): string {
  if (tab === 'overview') return `/clients/${clientId}`;
  return `/clients/${clientId}?tab=${tab}`;
}
