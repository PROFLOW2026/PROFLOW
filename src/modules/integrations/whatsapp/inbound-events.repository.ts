import 'server-only';

import { sql } from 'drizzle-orm';
import type { DbExecutor } from '@/shared/db/types';
import { sqlRows } from '@/shared/db/sql-rows';

export async function insertWhatsAppInboundEvent(
  db: DbExecutor,
  input: {
    organizationId: string;
    externalMessageId: string;
    fromPhone: string | null;
    status: 'rejected' | 'drafted' | 'duplicate';
  },
): Promise<'inserted' | 'duplicate'> {
  const result = await db.execute(sql`
    INSERT INTO public.whatsapp_inbound_events (
      organization_id,
      external_message_id,
      from_phone,
      status
    )
    VALUES (
      ${input.organizationId}::uuid,
      ${input.externalMessageId},
      ${input.fromPhone},
      ${input.status}
    )
    ON CONFLICT (organization_id, external_message_id) DO NOTHING
    RETURNING id
  `);
  return sqlRows<{ id: string }>(result).length > 0 ? 'inserted' : 'duplicate';
}
