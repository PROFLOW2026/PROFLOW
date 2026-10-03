/** Audit actions for the 'external' track (Developer/GC build). Shape: entity.verb. Labels go in settings.activity.actions (4 locales). */
export const EXTERNAL_AUDIT_ACTIONS = {
  EXTERNAL_PRINCIPAL_INVITED: 'external_principal.invited',
  EXTERNAL_PRINCIPAL_INVITE_REISSUED: 'external_principal.invite_reissued',
  EXTERNAL_PRINCIPAL_ACTIVATED: 'external_principal.activated',
  EXTERNAL_PRINCIPAL_PASSWORD_RESET_ISSUED: 'external_principal.password_reset_issued',
  EXTERNAL_PRINCIPAL_PASSWORD_RESET_COMPLETED: 'external_principal.password_reset_completed',
  EXTERNAL_PRINCIPAL_PASSWORD_CHANGED: 'external_principal.password_changed',
  EXTERNAL_PRINCIPAL_PROFILE_UPDATED: 'external_principal.profile_updated',
  EXTERNAL_PRINCIPAL_SESSIONS_REVOKED: 'external_principal.sessions_revoked',
  EXTERNAL_PRINCIPAL_DISABLED: 'external_principal.disabled',
  EXTERNAL_PRINCIPAL_ENABLED: 'external_principal.enabled',
  EXTERNAL_GRANT_CREATED: 'external_grant.created',
  EXTERNAL_GRANT_UPDATED: 'external_grant.updated',
  EXTERNAL_GRANT_REVOKED: 'external_grant.revoked',
} as const;
