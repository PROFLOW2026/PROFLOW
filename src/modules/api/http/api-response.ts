import { NextResponse } from 'next/server';

import { isAppError, serializeError, ValidationError } from '@/shared/errors';

export const API_VERSION = 'v1' as const;

export type ApiErrorBody = {
  apiVersion: typeof API_VERSION;
  error: {
    code: string;
    messageKey: string;
    issues?: readonly { path: string; message: string; messageKey?: string }[];
  };
};

/** Success JSON always carries the public API version. */
export function apiSuccess<T extends Record<string, unknown>>(
  data: T,
  init?: { status?: number; headers?: HeadersInit },
): NextResponse {
  return NextResponse.json(
    { apiVersion: API_VERSION, ...data },
    { status: init?.status ?? 200, headers: init?.headers },
  );
}

/**
 * Versioned error envelope - never includes stacks, SQL, or raw Exception messages.
 * Validation issues are path/message only (no internal details bags).
 */
export function apiError(error: unknown, init?: { status?: number }): NextResponse {
  const serialized = serializeError(error);
  const status =
    init?.status ??
    (isAppError(error) ? error.status : serialized.code === 'unexpected' ? 500 : 400);

  const body: ApiErrorBody = {
    apiVersion: API_VERSION,
    error: {
      code: serialized.code,
      messageKey: serialized.messageKey,
    },
  };

  if (error instanceof ValidationError && serialized.issues) {
    body.error.issues = serialized.issues.map((issue) => ({
      path: issue.path,
      message: issue.message,
      ...(issue.messageKey ? { messageKey: issue.messageKey } : {}),
    }));
  }

  return NextResponse.json(body, { status });
}

export function apiErrorCode(
  code: string,
  status: number,
  messageKey = 'errors.unexpected',
): NextResponse {
  return NextResponse.json(
    {
      apiVersion: API_VERSION,
      error: { code, messageKey },
    } satisfies ApiErrorBody,
    { status },
  );
}
