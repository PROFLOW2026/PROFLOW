import 'server-only';

import { isNotNull } from 'drizzle-orm';
import { organizationCompanyProfiles } from '@drizzle/schema';
import type { DbExecutor } from '@/shared/db/types';
import { phonesMatch } from './phone';

export async function resolveOrganizationIdByWhatsAppLine(
  db: DbExecutor,
  linePhone: string | null | undefined,
): Promise<string | null> {
  const target = linePhone?.trim();
  if (!target) return null;

  const rows = await db
    .select({
      organizationId: organizationCompanyProfiles.organizationId,
      whatsappPhone: organizationCompanyProfiles.whatsappPhone,
    })
    .from(organizationCompanyProfiles)
    .where(isNotNull(organizationCompanyProfiles.whatsappPhone));

  for (const row of rows) {
    if (phonesMatch(row.whatsappPhone, target)) {
      return row.organizationId;
    }
  }
  return null;
}
