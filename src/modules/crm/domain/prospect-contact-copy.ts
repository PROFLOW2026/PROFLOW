/**
 * Which prospect contacts still need a client_contacts row.
 * A match is the same email or the same phone. Empty values do not match.
 */

export interface ProspectContactCopySource {
  readonly name: string;
  readonly email: string | null;
  readonly phone: string | null;
}

export interface ProspectContactToCopy {
  readonly name: string;
  readonly email: string | null;
  readonly phone: string | null;
}

interface ContactMatchKeys {
  readonly name: string;
  readonly email: string | null;
  readonly phone: string | null;
  readonly emailKey: string | null;
  readonly phoneKey: string | null;
  readonly nameKey: string;
}

function normalizeContact(contact: ProspectContactCopySource): ContactMatchKeys | null {
  const name = contact.name.trim();
  if (!name) return null;
  const email = contact.email?.trim() || null;
  const phone = contact.phone?.trim() || null;
  const digits = phone ? phone.replace(/\D/g, '') : '';
  return {
    name,
    email,
    phone,
    emailKey: email ? email.toLowerCase() : null,
    phoneKey: digits.length > 0 ? digits : null,
    nameKey: name.toLocaleLowerCase(),
  };
}

function matchesExisting(candidate: ContactMatchKeys, existing: readonly ContactMatchKeys[]): boolean {
  return existing.some((row) => {
    if (candidate.emailKey && row.emailKey && candidate.emailKey === row.emailKey) return true;
    if (candidate.phoneKey && row.phoneKey && candidate.phoneKey === row.phoneKey) return true;
    if (
      !candidate.emailKey &&
      !candidate.phoneKey &&
      !row.emailKey &&
      !row.phoneKey &&
      candidate.nameKey === row.nameKey
    ) {
      return true;
    }
    return false;
  });
}

/** Contacts to insert, in source order, without rows already on the client. */
export function selectProspectContactsToCopy(
  prospects: readonly ProspectContactCopySource[],
  existing: readonly ProspectContactCopySource[],
): ProspectContactToCopy[] {
  const seen: ContactMatchKeys[] = [];
  for (const row of existing) {
    const normalized = normalizeContact(row);
    if (normalized) seen.push(normalized);
  }

  const selected: ProspectContactToCopy[] = [];
  for (const prospect of prospects) {
    const normalized = normalizeContact(prospect);
    if (!normalized) continue;
    if (matchesExisting(normalized, seen)) continue;
    selected.push({
      name: normalized.name,
      email: normalized.email,
      phone: normalized.phone,
    });
    seen.push(normalized);
  }
  return selected;
}
