/**
 * The project's folder in the organization's cloud, as the infrastructure tree needs it.
 *
 * The trusted (service-role) connection normally reads the project row itself. When that read comes
 * back empty although the caller - who is signed in, authorized and looking at the project - can see
 * it, the project facts the caller already read under their own (RLS-bound) session are used instead.
 * Nothing is widened: the snapshot was read by the authorized caller for exactly this project.
 */
export interface InfraProjectSnapshot {
  readonly id: string;
  readonly name: string;
  readonly documentNumber: string | null;
  readonly clientId: string | null;
  readonly clientName: string | null;
}

export type ProjectFolderSource = 'stored' | 'snapshot';

export async function resolveProjectFolderId(input: {
  /** The standard provisioning (reads the project row with the trusted connection). */
  provision: () => Promise<string | null>;
  snapshot: InfraProjectSnapshot | null | undefined;
  ensureFromSnapshot: (snapshot: InfraProjectSnapshot) => Promise<string>;
}): Promise<{ folderId: string; source: ProjectFolderSource } | null> {
  const stored = await input.provision();
  if (stored) return { folderId: stored, source: 'stored' };
  if (!input.snapshot) return null;
  const folderId = await input.ensureFromSnapshot(input.snapshot);
  return folderId ? { folderId, source: 'snapshot' } : null;
}
