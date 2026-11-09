import 'server-only';

import { eq } from 'drizzle-orm';
import { clientContacts, vendorContacts } from '@drizzle/schema';
import type { DbExecutor } from '@/shared/db/types';
import { phonesMatch } from './phone';

export async function isKnownInboundSenderPhone(
  db: DbExecutor,
  organizationId: string,
  fromPhone: string,
): Promise<boolean> {
  const [clientRows, vendorRows] = await Promise.all([
    db
      .select({ phone: clientContacts.phone })
      .from(clientContacts)
      .where(eq(clientContacts.organizationId, organizationId)),
    db
      .select({ phone: vendorContacts.phone })
      .from(vendorContacts)
      .where(eq(vendorContacts.organizationId, organizationId)),
  ]);

  for (const row of clientRows) {
    if (phonesMatch(row.phone, fromPhone)) return true;
  }
  for (const row of vendorRows) {
    if (phonesMatch(row.phone, fromPhone)) return true;
  }
  return false;
}
