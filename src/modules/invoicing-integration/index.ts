/**
 * External statutory invoicing integration.
 *
 * BillingRecord = ProjectFlow management truth.
 * ExternalStatutoryDocument = provider-issued legal document reference.
 * Feature remains disabled until a real provider is configured (DI).
 *
 * Persistence: Drizzle when `INVOICING_INTEGRATION_PERSISTENCE_READY`;
 * otherwise TEST DOUBLE in-memory store only (non-durable).
 * Storage readiness never implies provider completion.
 */

export type {
  BillingRecordBridgeRef,
  ExternalDocumentKind,
  ExternalDocumentStatus,
  ExternalPdfMetadata,
  ExternalStatutoryDocument,
  InvoicingProviderCredentials,
  IssuanceOutcome,
  ReconciliationMetadata,
  ReconciliationStatus,
  StatutoryPartySnapshot,
  StatutoryProviderCapabilities,
  StatutoryProviderStatus,
} from './domain/types';
export {
  BLOCKING_ISSUANCE_OUTCOMES,
  DISABLED_CAPABILITIES,
  EXTERNAL_DOCUMENT_KINDS,
  EXTERNAL_DOCUMENT_STATUSES,
  FULL_ADAPTER_CAPABILITIES,
  ISSUANCE_OUTCOMES,
  RECONCILIATION_STATUSES,
  SUMIT_PROVIDER_ID,
} from './domain/types';

export type {
  AllocateExternalReferenceInput as ProviderAllocateInput,
  AllocateExternalReferenceOutput,
  CancelExternalDocumentInput as ProviderCancelInput,
  CancelExternalDocumentOutput,
  CreateExternalDocumentInput,
  CreateExternalDocumentOutput,
  CreditExternalDocumentInput as ProviderCreditInput,
  CreditExternalDocumentOutput,
  RetrieveExternalStatusInput,
  RetrieveExternalStatusOutput,
  StatutoryInvoicingProvider,
  StatutoryProviderErrorCode,
  StatutoryProviderResult,
} from './domain/provider';

export {
  assertBillingEligibleForExternalRequest,
  assertBillingIsNotStatutoryIssuer,
  assertNotLocalStatutoryIssuance,
  SEPARATION_MESSAGE_KEYS,
} from './domain/separation';

export {
  UnconfiguredStatutoryProvider,
  createDefaultStatutoryProvider,
  getStatutoryInvoicingProvider,
  setStatutoryInvoicingProviderForTests,
} from './domain/unconfigured-provider';

export { ScriptedStatutoryProvider } from './domain/scripted-provider';

export {
  INVOICING_INTEGRATION_PERSISTENCE_READY,
  areInvoicingIntegrationTablesAvailable,
  setInvoicingIntegrationPersistenceReadyForTests,
} from './domain/persistence';

export {
  assertBillingRecordSameOrg,
  assertPdfDocumentSameOrg,
} from './data/same-org-guards';

export {
  resetExternalDocumentsStoreForTests,
  createExternalDocumentRow,
  findExternalDocumentById,
  listExternalDocumentsForBilling,
} from './data/in-memory-external-documents.store';

export {
  drizzleExternalDocumentsRepository,
  drizzleProviderConnectionsRepository,
  type ExternalDocumentsRepository,
  type ProviderConnectionsRepository,
  type ProviderConnectionRow,
} from './data/external-documents.repository';

export {
  createExternalDocument,
  updateExternalDocument,
  findExternalDocument,
  listExternalDocuments,
  getExternalDocumentsRepository,
  getProviderConnectionsRepository,
  setExternalDocumentsRepositoryForTests,
  setProviderConnectionsRepositoryForTests,
  assertBillingBridgeSameOrg,
} from './data/external-documents';

export {
  getStatutoryProviderStatus,
  isStatutoryInvoicingFeatureEnabled,
} from './application/provider-status';
export {
  sealInvoicingCredentials,
  openInvoicingCredentials,
} from './application/credential-seal';
export { requestExternalStatutoryDocument } from './application/request-external-document';
export {
  assertIssuanceEligible,
  findBlockingExternalDocument,
  findReusableRejectedDocument,
  isBlockingIssuanceOutcome,
} from './domain/assert-issuance-eligible';
export {
  buildStatutoryExternalReference,
  buildStatutoryIdempotencyKey,
} from './domain/idempotency-key';
export {
  assertBillingHasCustomerSnapshot,
  buildStatutoryBridgeFromBillingRecord,
} from './application/build-statutory-bridge';
export {
  reconcileExternalAmounts,
  type ProviderAmountSnapshot,
  type ReconciliationResult,
} from './domain/reconcile-external-amounts';
export { refreshExternalStatutoryStatus } from './application/refresh-external-status';
export {
  creditExternalStatutoryDocument,
  cancelExternalStatutoryDocument,
} from './application/credit-or-cancel-external';
export { allocateExternalStatutoryReference } from './application/allocate-external-reference';
export {
  getExternalStatutoryDocument,
  listExternalStatutoryDocumentsForBilling,
} from './application/get-external-documents';

export {
  requestExternalDocumentSchema,
  refreshExternalStatusSchema,
  creditExternalDocumentSchema,
  cancelExternalDocumentSchema,
  allocateExternalReferenceSchema,
  listExternalDocumentsSchema,
  billingRecordBridgeSchema,
} from './validation/schemas';
export type {
  RequestExternalDocumentInput,
  RefreshExternalStatusInput,
  CreditExternalDocumentInput,
  CancelExternalDocumentInput,
  AllocateExternalReferenceInput,
  ListExternalDocumentsInput,
} from './validation/schemas';
