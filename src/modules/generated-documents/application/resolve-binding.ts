import 'server-only';

import { getBillingRecord } from '@/modules/billing';
import { getPurchaseOrderById } from '@/modules/procurement';
import { findContractById } from '@/modules/projects';
import { getQuoteById } from '@/modules/quotes';
import type { OrgContext } from '@/shared/auth/context';
import { NotFoundError, ValidationError } from '@/shared/errors';
import type { ReportKind } from '@/modules/reports';
import type { GeneratedDocumentBinding } from '../domain/types';

function monthPathSegments(yearMonth: string): readonly string[] {
  const match = /^(\d{4})-(\d{2})$/.exec(yearMonth.trim());
  if (!match) {
    throw new ValidationError([{ path: 'reportMonth', message: 'Invalid year-month' }]);
  }
  return ['דוחות חודשיים', match[1]!, match[2]!];
}

export async function resolveGeneratedDocumentBinding(
  context: OrgContext,
  kind: ReportKind,
  entityId: string,
  reportMonth?: string,
): Promise<GeneratedDocumentBinding> {
  const organizationId = context.organizationId;

  if (kind === 'monthly_workforce_report') {
    const month = reportMonth ?? entityId;
    return {
      ownerType: 'organization',
      ownerId: organizationId,
      sourceEntityType: 'organization',
      sourceEntityId: organizationId,
      semanticFolder: 'employees_root',
      folderEntityType: null,
      folderEntityId: null,
      nestedPathSegments: monthPathSegments(month),
      privacyClass: 'compensation',
    };
  }

  if (kind === 'quote_estimate') {
    const quote = await getQuoteById(context, entityId);
    if (quote.convertedProjectId) {
      return {
        ownerType: 'organization',
        ownerId: organizationId,
        sourceEntityType: 'quote',
        sourceEntityId: quote.id,
        semanticFolder: 'quotes',
        folderEntityType: 'project',
        folderEntityId: quote.convertedProjectId,
        nestedPathSegments: [],
      };
    }
    return {
      ownerType: 'organization',
      ownerId: organizationId,
      sourceEntityType: 'quote',
      sourceEntityId: quote.id,
      semanticFolder: 'organization_documents',
      folderEntityType: null,
      folderEntityId: null,
      nestedPathSegments: [],
    };
  }

  if (kind === 'customer_statement') {
    const record = await getBillingRecord(context, entityId);
    return {
      ownerType: 'billing_record',
      ownerId: record.id,
      sourceEntityType: 'billing_record',
      sourceEntityId: record.id,
      semanticFolder: 'billing',
      folderEntityType: 'project',
      folderEntityId: record.projectId,
      nestedPathSegments: [],
    };
  }

  if (kind === 'purchase_order') {
    const detail = await getPurchaseOrderById(context, entityId);
    if (!detail) throw new NotFoundError('Purchase order');
    const po = detail.order;
    if (po.projectId) {
      return {
        ownerType: 'purchase_order',
        ownerId: po.id,
        sourceEntityType: 'purchase_order',
        sourceEntityId: po.id,
        semanticFolder: 'documents',
        folderEntityType: 'project',
        folderEntityId: po.projectId,
        nestedPathSegments: [],
      };
    }
    return {
      ownerType: 'purchase_order',
      ownerId: po.id,
      sourceEntityType: 'purchase_order',
      sourceEntityId: po.id,
      semanticFolder: 'organization_documents',
      folderEntityType: null,
      folderEntityId: null,
      nestedPathSegments: [],
    };
  }

  if (kind === 'contract_summary') {
    const contract = await findContractById(context.db, organizationId, entityId);
    if (!contract) throw new NotFoundError('Contract');
    return {
      ownerType: 'contract',
      ownerId: contract.id,
      sourceEntityType: 'contract',
      sourceEntityId: contract.id,
      semanticFolder: 'contracts',
      folderEntityType: 'project',
      folderEntityId: contract.projectId,
      nestedPathSegments: [],
    };
  }

  if (kind === 'procurement_rfq') {
    return {
      ownerType: 'procurement_rfq',
      ownerId: entityId,
      sourceEntityType: 'procurement_rfq',
      sourceEntityId: entityId,
      semanticFolder: 'organization_documents',
      folderEntityType: null,
      folderEntityId: null,
      nestedPathSegments: [],
    };
  }

  if (kind === 'timesheet') {
    return {
      ownerType: 'timesheet',
      ownerId: entityId,
      sourceEntityType: 'timesheet',
      sourceEntityId: entityId,
      semanticFolder: 'organization_documents',
      folderEntityType: null,
      folderEntityId: null,
      nestedPathSegments: [],
      privacyClass: 'compensation',
    };
  }

  throw new ValidationError(
    [{ path: 'kind', message: 'Report kind is not supported for storage save' }],
    'Unsupported generated document kind',
  );
}

export async function resolveGeneratedFilenameContext(
  context: OrgContext,
  kind: ReportKind,
  entityId: string,
  reportMonth?: string,
): Promise<{
  documentNumber: string | null;
  partyName: string | null;
  projectName: string | null;
  reportMonth: string | null;
}> {
  if (kind === 'monthly_workforce_report') {
    return {
      documentNumber: null,
      partyName: null,
      projectName: null,
      reportMonth: reportMonth ?? entityId,
    };
  }

  if (kind === 'quote_estimate') {
    const quote = await getQuoteById(context, entityId);
    return {
      documentNumber: quote.id.slice(0, 8),
      partyName: quote.clientName,
      projectName: quote.title,
      reportMonth: null,
    };
  }

  if (kind === 'customer_statement') {
    const record = await getBillingRecord(context, entityId);
    return {
      documentNumber: record.reference,
      partyName: record.projectName,
      projectName: record.projectName,
      reportMonth: null,
    };
  }

  if (kind === 'purchase_order') {
    const detail = await getPurchaseOrderById(context, entityId);
    if (!detail) throw new NotFoundError('Purchase order');
    return {
      documentNumber: detail.order.reference,
      partyName: null,
      projectName: null,
      reportMonth: null,
    };
  }

  if (kind === 'contract_summary') {
    const contract = await findContractById(context.db, context.organizationId, entityId);
    if (!contract) throw new NotFoundError('Contract');
    return {
      documentNumber: contract.contractNumber,
      partyName: null,
      projectName: contract.name,
      reportMonth: null,
    };
  }

  return {
    documentNumber: entityId.slice(0, 8),
    partyName: null,
    projectName: null,
    reportMonth: null,
  };
}
