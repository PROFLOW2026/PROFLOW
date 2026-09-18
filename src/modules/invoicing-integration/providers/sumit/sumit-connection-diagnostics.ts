import 'server-only';

import {
  SumitAmbiguousError,
  SumitApplicationError,
  SumitHttpError,
  type SumitApiEnvelope,
} from './sumit-api-envelope';

export type SumitConnectionFailureClass =
  | 'invalid_credentials'
  | 'module_inactive'
  | 'request_rejected'
  | 'network'
  | 'timeout'
  | 'ambiguous'
  | 'unknown';

export interface SumitTestConnectionResult {
  readonly ok: boolean;
  readonly failureClass?: SumitConnectionFailureClass;
  readonly providerErrorCode?: string | null;
  readonly safeProviderMessage?: string | null;
  readonly httpStatus?: number | null;
}

function messageHints(message: string | null | undefined): SumitConnectionFailureClass | null {
  if (!message) return null;
  const lower = message.toLowerCase();
  if (
    /invalid credential/.test(lower) ||
    /companyid\/apikey/.test(lower) ||
    /companyid.*apikey.*incorrect/.test(lower) ||
    /authentication|unauthorized|forbidden/.test(lower)
  ) {
    return 'invalid_credentials';
  }
  if (
    /module|capability|permission|not enabled|inactive|subscription|plan|feature/.test(lower)
  ) {
    return 'module_inactive';
  }
  return null;
}

function classifyEnvelope(envelope: SumitApiEnvelope): SumitConnectionFailureClass {
  const hint = messageHints(envelope.userErrorMessage ?? envelope.technicalErrorDetails);
  if (hint) return hint;
  if (envelope.status === 'business_error') return 'request_rejected';
  if (envelope.status === 'technical_error') return 'request_rejected';
  return 'unknown';
}

export function classifySumitConnectionFailure(error: unknown): SumitTestConnectionResult {
  if (error instanceof SumitApplicationError) {
    return {
      ok: false,
      failureClass: classifyEnvelope(error.envelope),
      providerErrorCode:
        error.envelope.statusRaw == null ? null : String(error.envelope.statusRaw),
      safeProviderMessage:
        error.envelope.userErrorMessage ?? error.envelope.technicalErrorDetails,
      httpStatus: error.httpStatus,
    };
  }

  if (error instanceof SumitHttpError) {
    const envelopeHint = error.envelope ? classifyEnvelope(error.envelope) : null;
    const httpStatus = error.httpStatus;
    let failureClass: SumitConnectionFailureClass =
      envelopeHint ??
      (httpStatus === 401 || httpStatus === 403 ? 'invalid_credentials' : 'request_rejected');
    if (httpStatus === 408 || httpStatus === 429 || httpStatus >= 500) {
      failureClass = 'ambiguous';
    }
    return {
      ok: false,
      failureClass,
      providerErrorCode: error.envelope?.statusRaw == null ? null : String(error.envelope.statusRaw),
      safeProviderMessage:
        error.envelope?.userErrorMessage ?? error.envelope?.technicalErrorDetails ?? null,
      httpStatus,
    };
  }

  if (error instanceof SumitAmbiguousError) {
    const message = error.message.toLowerCase();
    const failureClass: SumitConnectionFailureClass = message.includes('timed out')
      ? 'timeout'
      : message.includes('ambiguous')
        ? 'ambiguous'
        : 'network';
    return {
      ok: false,
      failureClass,
      providerErrorCode: null,
      safeProviderMessage: null,
      httpStatus: null,
    };
  }

  return {
    ok: false,
    failureClass: 'unknown',
    providerErrorCode: null,
    safeProviderMessage: null,
    httpStatus: null,
  };
}

export function sumitConnectionFailureMessageKey(
  failureClass: SumitConnectionFailureClass | undefined,
): string {
  switch (failureClass) {
    case 'invalid_credentials':
      return 'invoicingIntegration.errors.invalidCredentials';
    case 'module_inactive':
      return 'invoicingIntegration.errors.moduleInactive';
    case 'request_rejected':
      return 'invoicingIntegration.errors.authRejected';
    case 'network':
    case 'timeout':
    case 'ambiguous':
      return 'invoicingIntegration.errors.providerUnreachable';
    default:
      return 'invoicingIntegration.errors.connectionFailed';
  }
}

export function toSuccessfulSumitTestConnectionResult(): SumitTestConnectionResult {
  return { ok: true };
}
