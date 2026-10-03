import { z } from 'zod';
import { pickExternalGrant, type ExternalEntityAccess } from '@/modules/evidence';
import { ValidationError } from '@/shared/errors';
import type { ExternalCapability, ExternalContext } from '@/shared/external';
import { NotFoundError } from '@/shared/errors';

export function parseOrThrow<T extends z.ZodTypeAny>(schema: T, raw: unknown): z.output<T> {
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }
  return parsed.data;
}

/** Project-level contractor capability (drawings / shares are project-wide entities). */
export function requireExternalProjectCapability(
  context: ExternalContext,
  input: { readonly organizationId: string; readonly projectId: string },
  capability: ExternalCapability,
): ExternalEntityAccess {
  if (!context.grants.some((grant) => grant.organizationId === input.organizationId)) {
    throw new NotFoundError('Project');
  }
  return pickExternalGrant(
    context,
    { organizationId: input.organizationId, projectId: input.projectId, vendorId: null },
    capability,
  );
}

export const uuid = z.string().uuid();
