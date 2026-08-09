/** Public API of the procurement module (Wave 3). CommittedCost != Expense. */
/**
 * UX split: catalog + vendor prices → /procurement/materials;
 * operational stock → /assets/inventory.
 */
export {
  createMaterialItem,
  createMaterialVendorPrice,
  deleteMaterialVendorPriceForOrg,
  getMaterialById,
  listMaterialsForOrg,
  listVendorPricesForMaterial,
  updateMaterialVendorPriceForOrg,
} from './application/materials';

export {
  createPurchaseOrder,
  getPurchaseOrderById,
  issuePurchaseOrder,
  listPurchaseOrderLinesForOrg,
  listPurchaseOrdersForOrg,
  listPurchaseOrdersWithCommittedForOrg,
} from './application/purchase-orders';

export {
  createRfq,
  getRfqDetail,
  listRfqsForOrg,
  updateRfqStatus,
} from './application/rfqs';

export {
  createPurchaseOrderFromAcceptedQuote,
  createSupplierQuote,
  getQuoteComparisonForRfq,
  listQuotesForRfq,
  setSupplierQuoteStatus,
} from './application/quotes';

export {
  excludeCommittedFromActualCost,
  isCommittedCostActualExpense,
  shouldCreateCommittedCostOnIssue,
  assertIssueCreatesCommittedNotExpense,
  assertCommittedAmountMatchesLines,
  computeCommittedAfterConsumption,
  PURCHASE_ORDER_STATUSES,
  COMMITTED_COST_STATUSES,
} from './domain/committed-cost';
export type { PurchaseOrderStatus, CommittedCostStatus } from './domain/committed-cost';

export {
  buildPurchaseOrderInputFromAcceptedQuote,
  compareSupplierQuotesByTotal,
  RFQ_STATUSES,
  SUPPLIER_QUOTE_STATUSES,
} from './domain/quote-comparison';
export type {
  QuoteComparisonEntry,
  QuoteComparisonRow,
  RfqStatus,
  SupplierQuoteStatus,
} from './domain/quote-comparison';

export {
  createMaterialItemSchema,
  createMaterialVendorPriceSchema,
  createPurchaseOrderSchema,
  createPurchaseOrderFromQuoteSchema,
  createRfqSchema,
  createSupplierQuoteSchema,
  deleteMaterialVendorPriceSchema,
  issuePurchaseOrderSchema,
  updateMaterialVendorPriceSchema,
  updateRfqStatusSchema,
  updateSupplierQuoteStatusSchema,
} from './validation/schemas';

/** Cross-module materials catalog FK guard. */
export { findMaterialItemById } from './data/procurement.repository';

export {
  findOpenCommittedCostForPo,
  updateCommittedCostConsumption,
} from './data/procurement.repository';
