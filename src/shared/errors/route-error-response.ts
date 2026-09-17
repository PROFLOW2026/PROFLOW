import { AppError } from './app-error';

/** JSON body for browser-facing API routes — messageKey only, never English Exception text. */
export function apiRouteErrorBody(messageKey: string): { readonly error: string } {
  return { error: messageKey };
}

export function apiRouteErrorResponse(messageKey: string, status: number): Response {
  return Response.json(apiRouteErrorBody(messageKey), { status });
}

export function apiRouteErrorFromUnknown(error: unknown, fallbackMessageKey: string): Response {
  if (error instanceof AppError) {
    return apiRouteErrorResponse(error.messageKey, error.status);
  }
  return apiRouteErrorResponse(fallbackMessageKey, 500);
}
