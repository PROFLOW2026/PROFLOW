import { describe, expect, it } from 'vitest';
import {
  DomainRuleError,
  ValidationError,
  mapServerActionError,
  translateMessageKey,
} from '@/shared/errors';
import {
  applySignedQuantityChange,
  assertCanReserve,
  locationDeltasForMovement,
  remainingReservationAfterConsume,
} from '@/modules/assets/domain/inventory';

const EN_ERRORS: Record<string, string> = {
  validationFailed: 'Please check the highlighted fields.',
  unexpected: 'Something went wrong. Please try again.',
  notAllowed: 'Not allowed',
  notFound: 'Not found',
  conflict: 'Conflict',
  authenticationRequired: 'Authentication is required',
  organizationContextRequired: 'No active organization selected',
};

const EN_ASSETS: Record<string, string> = {
  'errors.insufficientQuantityOnHand': 'Not enough quantity on hand for this issue.',
  'errors.movementQuantityPositive': 'Movement quantity must be positive.',
  'errors.adjustmentQuantityNonZero': 'Adjustment quantity must be non-zero.',
  'errors.reservationQuantityPositive': 'Reservation quantity must be positive.',
  'errors.insufficientAvailableQuantity':
    'Not enough available quantity. Release or consume a reservation first.',
  'errors.consumeQuantityPositive': 'Consume quantity must be positive.',
};

function tErrors(key: string): string {
  return EN_ERRORS[key] ?? key;
}

function tAssets(key: string): string {
  return EN_ASSETS[key] ?? key;
}

describe('mapServerActionError', () => {
  it('never returns English AppError.message when messageKey exists', () => {
    const error = new DomainRuleError(
      'Insufficient quantity on hand',
      'assets.errors.insufficientQuantityOnHand',
    );
    const mapped = mapServerActionError(error, {
      tErrors,
      namespaces: { assets: tAssets },
    });
    expect(mapped.error).toBe(EN_ASSETS['errors.insufficientQuantityOnHand']);
    expect(mapped.error).not.toBe(error.message);
  });

  it('uses errors.unexpected instead of English message when namespace missing', () => {
    const error = new DomainRuleError('Some English domain text', 'widgets.errors.broken');
    const mapped = mapServerActionError(error, { tErrors });
    expect(mapped.error).toBe(EN_ERRORS.unexpected);
    expect(mapped.error).not.toBe(error.message);
  });

  it('maps ValidationError to localized validationFailed, not English message', () => {
    const error = new ValidationError([{ path: 'amount', message: 'Required' }]);
    const mapped = mapServerActionError(error, { tErrors });
    expect(mapped.error).toBe(EN_ERRORS.validationFailed);
    expect(mapped.error).not.toBe('Validation failed');
    expect(mapped.fieldErrors?.amount).toBe(EN_ERRORS.validationFailed);
    expect(mapped.fieldErrors?.amount).not.toBe('Required');
  });

  it('prefers issue.messageKey for field errors', () => {
    const error = new ValidationError([
      { path: 'qty', message: 'bad', messageKey: 'assets.errors.movementQuantityPositive' },
    ]);
    const mapped = mapServerActionError(error, {
      tErrors,
      namespaces: { assets: tAssets },
    });
    expect(mapped.fieldErrors?.qty).toBe(EN_ASSETS['errors.movementQuantityPositive']);
  });

  it('translateMessageKey resolves namespace keys without leaking message', () => {
    const translated = translateMessageKey('assets.errors.consumeQuantityPositive', {
      tErrors,
      namespaces: { assets: tAssets },
    });
    expect(translated).toBe(EN_ASSETS['errors.consumeQuantityPositive']);
  });
});

describe('inventory domain DomainRuleError messageKeys', () => {
  it('throws DomainRuleError with messageKeys for user-facing inventory rules', () => {
    expect(() => applySignedQuantityChange('1', '-2')).toThrow(DomainRuleError);
    try {
      applySignedQuantityChange('1', '-2');
    } catch (error) {
      expect(error).toBeInstanceOf(DomainRuleError);
      expect((error as DomainRuleError).messageKey).toBe(
        'assets.errors.insufficientQuantityOnHand',
      );
    }

    expect(() => locationDeltasForMovement({ movementType: 'issue', quantity: '0' })).toThrow(
      DomainRuleError,
    );
    try {
      locationDeltasForMovement({ movementType: 'issue', quantity: '0' });
    } catch (error) {
      expect((error as DomainRuleError).messageKey).toBe('assets.errors.movementQuantityPositive');
    }

    expect(() => locationDeltasForMovement({ movementType: 'adjust', quantity: '0' })).toThrow(
      DomainRuleError,
    );
    try {
      locationDeltasForMovement({ movementType: 'adjust', quantity: '0' });
    } catch (error) {
      expect((error as DomainRuleError).messageKey).toBe('assets.errors.adjustmentQuantityNonZero');
    }

    expect(() =>
      assertCanReserve({ quantityOnHand: '1', reservedActive: '0', reserveQuantity: '0' }),
    ).toThrow(DomainRuleError);
    try {
      assertCanReserve({ quantityOnHand: '1', reservedActive: '0', reserveQuantity: '0' });
    } catch (error) {
      expect((error as DomainRuleError).messageKey).toBe(
        'assets.errors.reservationQuantityPositive',
      );
    }

    expect(() =>
      assertCanReserve({ quantityOnHand: '1', reservedActive: '0', reserveQuantity: '2' }),
    ).toThrow(DomainRuleError);
    try {
      assertCanReserve({ quantityOnHand: '1', reservedActive: '0', reserveQuantity: '2' });
    } catch (error) {
      expect((error as DomainRuleError).messageKey).toBe(
        'assets.errors.insufficientAvailable',
      );
    }

    expect(() =>
      remainingReservationAfterConsume({ reservedQuantity: '5', consumeQuantity: '0' }),
    ).toThrow(DomainRuleError);
    try {
      remainingReservationAfterConsume({ reservedQuantity: '5', consumeQuantity: '0' });
    } catch (error) {
      expect((error as DomainRuleError).messageKey).toBe('assets.errors.consumeQuantityPositive');
    }

    const mapped = mapServerActionError(
      new DomainRuleError('x', 'assets.errors.insufficientQuantityOnHand'),
      { tErrors, namespaces: { assets: tAssets } },
    );
    expect(mapped.error).not.toMatch(/Insufficient quantity on hand/i);
  });
});
