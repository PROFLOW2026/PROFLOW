/**
 * Profession starter templates for billing plans.
 * Labels use i18n keys under billingPlan.templates.* (Hebrew/English in locale files).
 */

import type {
  BillingPlanTemplateRowDefinition,
  BillingPlanWorkKind,
} from './types';

export interface ProfessionStarterTemplate {
  readonly key: string;
  readonly nameKey: string;
  readonly descriptionKey: string;
  readonly workKind: BillingPlanWorkKind;
  readonly defaultRetentionPercent: string | null;
  readonly rows: readonly BillingPlanTemplateRowDefinition[];
}

function row(
  labelKey: string,
  lineKind: BillingPlanTemplateRowDefinition['lineKind'],
  sortOrder: number,
  agreedPercent?: string,
  sectionKey?: string,
): BillingPlanTemplateRowDefinition {
  return {
    labelKey,
    lineKind,
    sortOrder,
    agreedPercent: agreedPercent ?? null,
    agreedAmount: null,
    sectionKey: sectionKey ?? null,
    sectionLabelKey: sectionKey ? `billingPlan.templates.sections.${sectionKey}` : null,
  };
}

export const PROFESSION_STARTER_TEMPLATES: readonly ProfessionStarterTemplate[] = [
  {
    key: 'contractor',
    nameKey: 'billingPlan.templates.contractor.name',
    descriptionKey: 'billingPlan.templates.contractor.description',
    workKind: 'contractor',
    defaultRetentionPercent: '5',
    rows: [
      row('billingPlan.templates.contractor.lines.advance', 'percent_of_contract', 0, '10', 'cash'),
      row('billingPlan.templates.contractor.lines.foundation', 'percent_of_contract', 1, '15', 'structure'),
      row('billingPlan.templates.contractor.lines.structure', 'percent_of_contract', 2, '25', 'structure'),
      row('billingPlan.templates.contractor.lines.envelope', 'percent_of_contract', 3, '20', 'finishes'),
      row('billingPlan.templates.contractor.lines.finishes', 'percent_of_contract', 4, '20', 'finishes'),
      row('billingPlan.templates.contractor.lines.handover', 'percent_of_contract', 5, '10', 'closeout'),
    ],
  },
  {
    key: 'electrical',
    nameKey: 'billingPlan.templates.electrical.name',
    descriptionKey: 'billingPlan.templates.electrical.description',
    workKind: 'electrical',
    defaultRetentionPercent: '5',
    rows: [
      row('billingPlan.templates.electrical.lines.materials', 'percent_of_contract', 0, '30', 'supply'),
      row('billingPlan.templates.electrical.lines.roughIn', 'percent_of_contract', 1, '35', 'install'),
      row('billingPlan.templates.electrical.lines.panels', 'percent_of_contract', 2, '20', 'install'),
      row('billingPlan.templates.electrical.lines.commissioning', 'percent_of_contract', 3, '15', 'closeout'),
    ],
  },
  {
    key: 'renovation',
    nameKey: 'billingPlan.templates.renovation.name',
    descriptionKey: 'billingPlan.templates.renovation.description',
    workKind: 'renovation',
    defaultRetentionPercent: '5',
    rows: [
      row('billingPlan.templates.renovation.lines.demolition', 'percent_of_contract', 0, '15', 'prep'),
      row('billingPlan.templates.renovation.lines.systems', 'percent_of_contract', 1, '35', 'systems'),
      row('billingPlan.templates.renovation.lines.finishes', 'percent_of_contract', 2, '35', 'finishes'),
      row('billingPlan.templates.renovation.lines.completion', 'percent_of_contract', 3, '15', 'closeout'),
    ],
  },
  {
    key: 'small_works',
    nameKey: 'billingPlan.templates.smallWorks.name',
    descriptionKey: 'billingPlan.templates.smallWorks.description',
    workKind: 'small_works',
    defaultRetentionPercent: null,
    rows: [
      row('billingPlan.templates.smallWorks.lines.deposit', 'percent_of_contract', 0, '40', 'cash'),
      row('billingPlan.templates.smallWorks.lines.progress', 'percent_of_contract', 1, '40', 'work'),
      row('billingPlan.templates.smallWorks.lines.final', 'percent_of_contract', 2, '20', 'closeout'),
    ],
  },
  {
    key: 'architecture',
    nameKey: 'billingPlan.templates.architecture.name',
    descriptionKey: 'billingPlan.templates.architecture.description',
    workKind: 'architecture',
    defaultRetentionPercent: null,
    rows: [
      row('billingPlan.templates.architecture.lines.concept', 'percent_of_contract', 0, '20', 'design'),
      row('billingPlan.templates.architecture.lines.permit', 'percent_of_contract', 1, '30', 'design'),
      row('billingPlan.templates.architecture.lines.detail', 'percent_of_contract', 2, '30', 'design'),
      row('billingPlan.templates.architecture.lines.supervision', 'percent_of_contract', 3, '20', 'supervision'),
    ],
  },
  {
    key: 'consulting',
    nameKey: 'billingPlan.templates.consulting.name',
    descriptionKey: 'billingPlan.templates.consulting.description',
    workKind: 'consulting',
    defaultRetentionPercent: null,
    rows: [
      row('billingPlan.templates.consulting.lines.kickoff', 'percent_of_contract', 0, '25', 'phases'),
      row('billingPlan.templates.consulting.lines.mid', 'percent_of_contract', 1, '50', 'phases'),
      row('billingPlan.templates.consulting.lines.delivery', 'percent_of_contract', 2, '25', 'phases'),
    ],
  },
  {
    key: 'inspection',
    nameKey: 'billingPlan.templates.inspection.name',
    descriptionKey: 'billingPlan.templates.inspection.description',
    workKind: 'inspection',
    defaultRetentionPercent: null,
    rows: [
      row('billingPlan.templates.inspection.lines.siteVisit', 'fixed_amount', 0, undefined, 'visits'),
      row('billingPlan.templates.inspection.lines.report', 'fixed_amount', 1, undefined, 'deliverables'),
    ],
  },
  {
    key: 'service_install',
    nameKey: 'billingPlan.templates.serviceInstall.name',
    descriptionKey: 'billingPlan.templates.serviceInstall.description',
    workKind: 'service_install',
    defaultRetentionPercent: '3',
    rows: [
      row('billingPlan.templates.serviceInstall.lines.equipment', 'percent_of_contract', 0, '50', 'supply'),
      row('billingPlan.templates.serviceInstall.lines.install', 'percent_of_contract', 1, '35', 'install'),
      row('billingPlan.templates.serviceInstall.lines.training', 'percent_of_contract', 2, '15', 'closeout'),
    ],
  },
  {
    key: 'plumbing',
    nameKey: 'billingPlan.templates.plumbing.name',
    descriptionKey: 'billingPlan.templates.plumbing.description',
    workKind: 'plumbing',
    defaultRetentionPercent: '5',
    rows: [
      row('billingPlan.templates.plumbing.lines.materials', 'percent_of_contract', 0, '35', 'supply'),
      row('billingPlan.templates.plumbing.lines.roughIn', 'percent_of_contract', 1, '40', 'install'),
      row('billingPlan.templates.plumbing.lines.sanitary', 'percent_of_contract', 2, '25', 'closeout'),
    ],
  },
  {
    key: 'hvac',
    nameKey: 'billingPlan.templates.hvac.name',
    descriptionKey: 'billingPlan.templates.hvac.description',
    workKind: 'hvac',
    defaultRetentionPercent: '5',
    rows: [
      row('billingPlan.templates.hvac.lines.equipment', 'percent_of_contract', 0, '40', 'supply'),
      row('billingPlan.templates.hvac.lines.ducting', 'percent_of_contract', 1, '35', 'install'),
      row('billingPlan.templates.hvac.lines.commissioning', 'percent_of_contract', 2, '25', 'closeout'),
    ],
  },
  {
    key: 'design',
    nameKey: 'billingPlan.templates.design.name',
    descriptionKey: 'billingPlan.templates.design.description',
    workKind: 'design',
    defaultRetentionPercent: null,
    rows: [
      row('billingPlan.templates.design.lines.concept', 'percent_of_contract', 0, '30', 'design'),
      row('billingPlan.templates.design.lines.detail', 'percent_of_contract', 1, '40', 'design'),
      row('billingPlan.templates.design.lines.delivery', 'percent_of_contract', 2, '30', 'closeout'),
    ],
  },
  {
    key: 'engineering',
    nameKey: 'billingPlan.templates.engineering.name',
    descriptionKey: 'billingPlan.templates.engineering.description',
    workKind: 'engineering',
    defaultRetentionPercent: null,
    rows: [
      row('billingPlan.templates.engineering.lines.survey', 'percent_of_contract', 0, '25', 'design'),
      row('billingPlan.templates.engineering.lines.calculations', 'percent_of_contract', 1, '45', 'design'),
      row('billingPlan.templates.engineering.lines.signOff', 'percent_of_contract', 2, '30', 'closeout'),
    ],
  },
  {
    key: 'maintenance',
    nameKey: 'billingPlan.templates.maintenance.name',
    descriptionKey: 'billingPlan.templates.maintenance.description',
    workKind: 'maintenance',
    defaultRetentionPercent: null,
    rows: [
      row('billingPlan.templates.maintenance.lines.mobilization', 'percent_of_contract', 0, '20', 'service'),
      row('billingPlan.templates.maintenance.lines.service', 'percent_of_contract', 1, '60', 'service'),
      row('billingPlan.templates.maintenance.lines.closeout', 'percent_of_contract', 2, '20', 'closeout'),
    ],
  },
  {
    key: 'mixed',
    nameKey: 'billingPlan.templates.mixed.name',
    descriptionKey: 'billingPlan.templates.mixed.description',
    workKind: 'mixed',
    defaultRetentionPercent: '5',
    rows: [
      row('billingPlan.templates.mixed.lines.milestone1', 'milestone', 0, '25', 'milestones'),
      row('billingPlan.templates.mixed.lines.milestone2', 'milestone', 1, '25', 'milestones'),
      row('billingPlan.templates.mixed.lines.milestone3', 'milestone', 2, '25', 'milestones'),
      row('billingPlan.templates.mixed.lines.milestone4', 'milestone', 3, '25', 'milestones'),
    ],
  },
] as const;

export function findProfessionStarterTemplate(
  key: string,
): ProfessionStarterTemplate | undefined {
  return PROFESSION_STARTER_TEMPLATES.find((t) => t.key === key);
}

export function listProfessionStarterTemplates(): readonly ProfessionStarterTemplate[] {
  return PROFESSION_STARTER_TEMPLATES;
}
