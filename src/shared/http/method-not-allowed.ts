/**
 * 405 for internal routes whose job must run only on POST (S-06).
 * Callers must not invoke the worker from GET.
 */
export function methodNotAllowedResponse(): Response {
  return Response.json({ error: 'method_not_allowed' }, { status: 405 });
}
