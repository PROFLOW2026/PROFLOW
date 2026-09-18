import { setCommittedPhaseRunnerForTests } from '../src/modules/invoicing-integration/application/request-external-document.ts';

let bootstrapped = false;

/** Wire committed statutory phases to withUserContext for tsx live scripts. */
export async function bootstrapLiveDemoScripts(userId: string, organizationId: string) {
  if (bootstrapped) return;
  const { withUserContext } = await import('../src/shared/db/client.ts');
  const { resolveOrgContext } = await import('../src/modules/tenancy/index.ts');

  setCommittedPhaseRunnerForTests(async (uid, orgId, fn) => {
    return withUserContext(uid, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: uid,
        organizationId: orgId,
        locale: 'he-IL',
      });
      return fn(context);
    });
  });

  bootstrapped = true;
  void userId;
  void organizationId;
}
