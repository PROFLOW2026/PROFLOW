/** Domain event types for the 'external' track. Shape: <domain>.<entity>.<verb> (3+ lowercase segments). */
export const EXTERNAL_DOMAIN_EVENTS = {
  EXTERNAL_PRINCIPAL_INVITED: 'external.principal.invited',
  EXTERNAL_PRINCIPAL_ACTIVATED: 'external.principal.activated',
  EXTERNAL_PRINCIPAL_DISABLED: 'external.principal.disabled',
  EXTERNAL_PRINCIPAL_ENABLED: 'external.principal.enabled',
  EXTERNAL_GRANT_CREATED: 'external.grant.created',
  EXTERNAL_GRANT_UPDATED: 'external.grant.updated',
  EXTERNAL_GRANT_REVOKED: 'external.grant.revoked',
} as const;
