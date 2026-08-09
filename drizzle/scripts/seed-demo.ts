import 'dotenv/config';
import { getAdminDb } from '@/shared/db/client';
import { seedDemoData } from '../seed/demo';

/**
 * Local-only demo seed. Refuses to run in production, because "I ran the demo
 * seed against the live database" is a mistake that only needs to happen once.
 */
async function main() {
  if (process.env.NODE_ENV === 'production' || process.env.ALLOW_DEMO_SEED === 'false') {
    throw new Error('The demo seed must never run against a production database.');
  }

  const ownerUserId = process.env.DEMO_OWNER_USER_ID;
  const ownerEmail = process.env.DEMO_OWNER_EMAIL;

  if (!ownerUserId || !ownerEmail) {
    throw new Error(
      'Set DEMO_OWNER_USER_ID and DEMO_OWNER_EMAIL to an existing Supabase Auth user before seeding demo data.',
    );
  }

  const result = await seedDemoData(getAdminDb(), { ownerUserId, ownerEmail });

  console.info(
    result.created
      ? `Created demo organization ${result.organizationId}.`
      : `Demo organization ${result.organizationId} already exists; nothing to do.`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
