/** Domain event types for the 'profile' track. Shape: <domain>.<entity>.<verb> (3+ lowercase segments). */
export const PROFILE_DOMAIN_EVENTS = {
  PROFILE_DELIVERY_PROFILE_UPDATED: 'profile.delivery_profile.updated',
  PROFILE_CHARACTERISTICS_UPDATED: 'profile.characteristics.updated',
  PROFILE_LOCATION_CREATED: 'profile.location.created',
  PROFILE_LOCATION_UPDATED: 'profile.location.updated',
  PROFILE_LOCATION_MOVED: 'profile.location.moved',
  PROFILE_LOCATION_ARCHIVED: 'profile.location.archived',
  PROFILE_LOCATION_RESTORED: 'profile.location.restored',
  PROFILE_LOCATION_TREE_GENERATED: 'profile.location_tree.generated',
  PROFILE_RECOMMENDATION_ACCEPTED: 'profile.recommendation.accepted',
  PROFILE_RECOMMENDATION_DISMISSED: 'profile.recommendation.dismissed',
  PROFILE_RECOMMENDATION_RESTORED: 'profile.recommendation.restored',
} as const;
