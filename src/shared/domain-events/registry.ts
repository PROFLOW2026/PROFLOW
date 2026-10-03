import { CLAIMS_DOMAIN_EVENTS } from './events/claims';
import { COLLAB_DOMAIN_EVENTS } from './events/collab';
import { COMPLIANCE_DOMAIN_EVENTS } from './events/compliance';
import { COORDINATION_DOMAIN_EVENTS } from './events/coordination';
import { DOCUMENTS_DOMAIN_EVENTS } from './events/documents';
import { EXTERNAL_DOMAIN_EVENTS } from './events/external';
import { FIELD_DOMAIN_EVENTS } from './events/field';
import { NOTIFICATIONS_DOMAIN_EVENTS } from './events/notifications';
import { PERMISSIONS_DOMAIN_EVENTS } from './events/permissions';
import { PROCUREMENT_DOMAIN_EVENTS } from './events/procurement';
import { PROFILE_DOMAIN_EVENTS } from './events/profile';
import { PROJECT_TEAM_DOMAIN_EVENTS } from './events/project-team';
import { QUALITY_DOMAIN_EVENTS } from './events/quality';
import { RFI_DOMAIN_EVENTS } from './events/rfi';
import { SUBCONTRACT_DOMAIN_EVENTS } from './events/subcontract';
import { SURFACES_DOMAIN_EVENTS } from './events/surfaces';

/** Merged registry. Each track owns its own events/<track>.ts file. */
export const DOMAIN_EVENTS = {
  ...CLAIMS_DOMAIN_EVENTS,
  ...COLLAB_DOMAIN_EVENTS,
  ...COMPLIANCE_DOMAIN_EVENTS,
  ...COORDINATION_DOMAIN_EVENTS,
  ...DOCUMENTS_DOMAIN_EVENTS,
  ...EXTERNAL_DOMAIN_EVENTS,
  ...FIELD_DOMAIN_EVENTS,
  ...NOTIFICATIONS_DOMAIN_EVENTS,
  ...PERMISSIONS_DOMAIN_EVENTS,
  ...PROCUREMENT_DOMAIN_EVENTS,
  ...PROFILE_DOMAIN_EVENTS,
  ...PROJECT_TEAM_DOMAIN_EVENTS,
  ...QUALITY_DOMAIN_EVENTS,
  ...RFI_DOMAIN_EVENTS,
  ...SUBCONTRACT_DOMAIN_EVENTS,
  ...SURFACES_DOMAIN_EVENTS,
} as const;

export type DomainEventType = (typeof DOMAIN_EVENTS)[keyof typeof DOMAIN_EVENTS];
