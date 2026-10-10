'use client';

import { createOpportunityAction } from '../../actions';
import { CrmNewOpportunityForm } from '@/modules/crm/ui/crm-new-opportunity-form';

import type { ComponentProps } from 'react';

export function NewOpportunityForm(
  props: Omit<ComponentProps<typeof CrmNewOpportunityForm>, 'createOpportunityAction'>,
) {
  return <CrmNewOpportunityForm {...props} createOpportunityAction={createOpportunityAction} />;
}
