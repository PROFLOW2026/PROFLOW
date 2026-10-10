export type InvitationRecordStatus = 'issued' | 'consumed' | 'revoked' | 'expired';

export type InvitationRuntimeState = 'valid' | 'expired' | 'consumed' | 'revoked';

export type MappingStatus = 'pending' | 'provisioning' | 'active' | 'failed' | 'revoked';

export type ProvisioningStatus = 'not_started' | 'in_progress' | 'succeeded' | 'failed';

export function invitationRuntimeState(
  row: {
    readonly status: InvitationRecordStatus;
    readonly expiresAt: Date;
    readonly consumedAt: Date | null;
    readonly revokedAt: Date | null;
  },
  now: Date = new Date(),
): InvitationRuntimeState {
  if (row.revokedAt || row.status === 'revoked') return 'revoked';
  if (row.consumedAt || row.status === 'consumed') return 'consumed';
  if (row.status === 'expired' || row.expiresAt.getTime() <= now.getTime()) return 'expired';
  return 'valid';
}

export function mappingBlocksSync(mapping: {
  readonly status: MappingStatus;
  readonly revokedAt: Date | null;
}): boolean {
  return mapping.status === 'revoked' || Boolean(mapping.revokedAt);
}

export function mappingIsActive(mapping: {
  readonly status: MappingStatus;
  readonly provisioningStatus: ProvisioningStatus;
  readonly revokedAt: Date | null;
}): boolean {
  return (
    mapping.status === 'active' &&
    mapping.provisioningStatus === 'succeeded' &&
    !mapping.revokedAt
  );
}
