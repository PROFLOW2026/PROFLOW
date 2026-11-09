export const PROJECT_RISK_STATUSES = ['open', 'mitigating', 'closed'] as const;
export type ProjectRiskStatus = (typeof PROJECT_RISK_STATUSES)[number];

export const PROJECT_RISK_SCALE_MIN = 1;
export const PROJECT_RISK_SCALE_MAX = 5;
