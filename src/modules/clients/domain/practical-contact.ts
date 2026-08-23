import type { ClientContactRecord } from './types';

/**
 * Pick billing-role contact when present; otherwise practical primary.
 * Used when creating AR records so billing contacts are not dead UX.
 */
export function pickBillingClientContact(
  contacts: readonly ClientContactRecord[],
): ClientContactRecord | null {
  if (contacts.length === 0) return null;

  const billing = contacts.filter((contact) => contact.role === 'billing');
  const pool = billing.length > 0 ? billing : contacts.filter((contact) => contact.role === 'primary');
  const fallback = pool.length > 0 ? pool : contacts;

  return [...fallback].sort((a, b) => {
    const byCreated = a.createdAt.getTime() - b.createdAt.getTime();
    if (byCreated !== 0) return byCreated;
    return a.name.localeCompare(b.name);
  })[0]!;
}

/**
 * Client-wide practical contact: prefer role=primary, else earliest by createdAt.
 * Used as a default *suggestion* and as display fallback when a project has no
 * project-specific contact (projects.primary_contact_id).
 */
export function pickPracticalClientContact(
  contacts: readonly ClientContactRecord[],
): ClientContactRecord | null {
  if (contacts.length === 0) return null;

  const primaries = contacts.filter((contact) => contact.role === 'primary');
  const pool = primaries.length > 0 ? primaries : contacts;

  return [...pool].sort((a, b) => {
    const byCreated = a.createdAt.getTime() - b.createdAt.getTime();
    if (byCreated !== 0) return byCreated;
    return a.name.localeCompare(b.name);
  })[0]!;
}

/**
 * Header / display contact: project-specific contact wins; otherwise client practical primary.
 */
export function resolveProjectDisplayContact(
  projectContact: ClientContactRecord | null | undefined,
  clientContacts: readonly ClientContactRecord[],
): ClientContactRecord | null {
  if (projectContact) return projectContact;
  return pickPracticalClientContact(clientContacts);
}

/** True when the contact row belongs to the given client (same-org assumed upstream). */
export function contactBelongsToClient(
  contact: Pick<ClientContactRecord, 'clientId'>,
  clientId: string,
): boolean {
  return contact.clientId === clientId;
}
