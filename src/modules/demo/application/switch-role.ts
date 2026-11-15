import 'server-only';

import { and, eq } from 'drizzle-orm';
import { demoSessionActors } from '@drizzle/schema';
import { DomainRuleError } from '@/shared/errors';
import type { DbExecutor } from '@/shared/db/types';
import { parseDemoRoleSwitch } from '../domain/role-switch';
import type { DemoAuthPort } from './enter-demo';

export async function switchDemoRole(
  db: DbExecutor,
  auth: DemoAuthPort,
  input: { readonly sessionId: string; readonly body: unknown },
): Promise<{ readonly userId: string; readonly roleKey: string }> {
  const parsed = parseDemoRoleSwitch(input.body);
  if (!parsed.ok) {
    throw new DomainRuleError('Demo role switch rejected', 'demo.errors.roleRejected');
  }
  const [actor] = await db
    .select({ authUserId: demoSessionActors.authUserId, email: demoSessionActors.email })
    .from(demoSessionActors)
    .where(
      and(
        eq(demoSessionActors.organizationId, input.sessionId),
        eq(demoSessionActors.roleKey, parsed.roleKey),
      ),
    )
    .limit(1);
  if (!actor) {
    throw new DomainRuleError('Demo role is not in this session', 'demo.errors.roleRejected');
  }
  const signedIn = await auth.signIn(actor.email);
  if (signedIn.emailSent || signedIn.exposedSecret || signedIn.userId !== actor.authUserId) {
    throw new DomainRuleError('Demo sign-in exposed a secret', 'demo.errors.signInUnsafe');
  }
  return { userId: actor.authUserId, roleKey: parsed.roleKey };
}
