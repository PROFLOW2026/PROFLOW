import 'server-only';

/** Parsed SUMIT API response envelope (no credentials). */
export type SumitEnvelopeStatus = 'success' | 'business_error' | 'technical_error' | 'unknown';

export interface SumitApiEnvelope<T = unknown> {
  readonly httpStatus: number;
  readonly status: SumitEnvelopeStatus;
  readonly statusRaw: unknown;
  readonly userErrorMessage: string | null;
  readonly technicalErrorDetails: string | null;
  readonly data: T | null;
}

export class SumitApplicationError extends Error {
  readonly httpStatus: number;
  readonly envelope: SumitApiEnvelope;

  constructor(envelope: SumitApiEnvelope) {
    super(
      envelope.userErrorMessage ??
        envelope.technicalErrorDetails ??
        `SUMIT application error (${String(envelope.statusRaw)})`,
    );
    this.name = 'SumitApplicationError';
    this.httpStatus = envelope.httpStatus;
    this.envelope = envelope;
  }
}

export class SumitAmbiguousError extends Error {
  readonly partialDocumentId: string | null;

  constructor(message: string, partialDocumentId: string | null = null) {
    super(message);
    this.name = 'SumitAmbiguousError';
    this.partialDocumentId = partialDocumentId;
  }
}

export class SumitHttpError extends Error {
  readonly httpStatus: number;
  readonly envelope: SumitApiEnvelope | null;

  constructor(httpStatus: number, envelope: SumitApiEnvelope | null, message: string) {
    super(message);
    this.name = 'SumitHttpError';
    this.httpStatus = httpStatus;
    this.envelope = envelope;
  }
}

/** Official OpenAPI uses string enums; live API may return numeric Status (0/1/2). */
export function normalizeSumitStatus(raw: unknown): SumitEnvelopeStatus {
  if (raw === 0 || raw === '0') return 'success';
  if (raw === 1 || raw === '1') return 'business_error';
  if (raw === 2 || raw === '2') return 'technical_error';
  if (typeof raw === 'string') {
    if (raw.startsWith('Success')) return 'success';
    if (raw.startsWith('BusinessError')) return 'business_error';
    if (raw.startsWith('TechnicalError')) return 'technical_error';
  }
  return 'unknown';
}

/** Cap provider text length for logs/UI hints. SUMIT user messages must not echo secrets. */
export function sanitizeSumitProviderMessage(message: string | null | undefined): string | null {
  if (!message) return null;
  const trimmed = message.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, 300);
}

export function parseSumitApiEnvelope<T = unknown>(
  httpStatus: number,
  parsed: unknown,
): SumitApiEnvelope<T> {
  const record =
    parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
  const statusRaw = record.Status ?? null;
  return {
    httpStatus,
    status: normalizeSumitStatus(statusRaw),
    statusRaw,
    userErrorMessage: sanitizeSumitProviderMessage(
      typeof record.UserErrorMessage === 'string' ? record.UserErrorMessage : null,
    ),
    technicalErrorDetails: sanitizeSumitProviderMessage(
      typeof record.TechnicalErrorDetails === 'string' ? record.TechnicalErrorDetails : null,
    ),
    data:
      record.Data === undefined || record.Data === null
        ? null
        : (record.Data as T),
  };
}

export function assertSumitEnvelopeSuccess<T>(envelope: SumitApiEnvelope<T>): SumitApiEnvelope<T> {
  if (envelope.status === 'success') return envelope;
  throw new SumitApplicationError(envelope);
}
