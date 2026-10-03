/** Audit actions for the 'profile' track (Developer/GC build). Shape: entity.verb. Labels go in settings.activity.actions (4 locales). */
export const PROFILE_AUDIT_ACTIONS = {
  PROJECT_DELIVERY_PROFILE_UPDATED: 'project_delivery_profile.updated',
  PROJECT_CHARACTERISTICS_UPDATED: 'project_characteristics.updated',
  PROJECT_LOCATION_CREATED: 'project_location.created',
  PROJECT_LOCATION_UPDATED: 'project_location.updated',
  PROJECT_LOCATION_MOVED: 'project_location.moved',
  PROJECT_LOCATION_ARCHIVED: 'project_location.archived',
  PROJECT_LOCATION_RESTORED: 'project_location.restored',
  PROJECT_LOCATION_BULK_GENERATED: 'project_location.bulk_generated',
  PROJECT_RECOMMENDATION_ACCEPTED: 'project_recommendation.accepted',
  PROJECT_RECOMMENDATION_DISMISSED: 'project_recommendation.dismissed',
  PROJECT_RECOMMENDATION_RESTORED: 'project_recommendation.restored',
} as const;
