import { DomainRuleError } from '@/shared/errors';
import type { TenderOfferRow, TenderPackageRow } from './types';

export function assertPackageAwardable(pkg: TenderPackageRow): void {
  if (pkg.status === 'awarded') {
    throw new DomainRuleError('Tender package already awarded', 'awards.errors.alreadyAwarded');
  }
  if (pkg.status === 'cancelled') {
    throw new DomainRuleError('Tender package is cancelled', 'awards.errors.cancelled');
  }
}

export function assertOfferSelectable(offer: TenderOfferRow, vendorId: string): void {
  if (offer.vendorId !== vendorId) {
    throw new DomainRuleError('Offer vendor mismatch', 'awards.errors.offerVendorMismatch');
  }
  if (offer.status !== 'submitted') {
    throw new DomainRuleError('Only submitted offers can be selected', 'awards.errors.offerNotSubmitted');
  }
}
