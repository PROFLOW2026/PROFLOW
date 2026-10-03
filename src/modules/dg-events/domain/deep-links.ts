import type { DgLinkInput } from './types';

/**
 * Locale-stripped deep links from the frozen route table (track briefs section 2).
 * Internal routes live under `/projects/[projectId]/...`; contractor portal routes under
 * `/contractor/projects/[projectId]/...` (route groups never appear in the URL).
 */

const SAFE_SEGMENT = /^[A-Za-z0-9_-]{1,64}$/;

function segment(value: unknown): string | null {
  return typeof value === 'string' && SAFE_SEGMENT.test(value) ? value : null;
}

const SAFE_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function internalProjectLink(input: DgLinkInput, ...parts: readonly (string | null)[]): string | null {
  const projectId = segment(input.projectId);
  if (!projectId) return null;
  if (parts.some((part) => part === null)) return `/projects/${projectId}`;
  return ['/projects', projectId, ...parts].join('/');
}

export function portalProjectLink(input: DgLinkInput, ...parts: readonly (string | null)[]): string {
  const projectId = segment(input.projectId);
  if (!projectId) return '/contractor/notifications';
  if (parts.some((part) => part === null)) return `/contractor/projects/${projectId}`;
  return ['/contractor/projects', projectId, ...parts].join('/');
}

export function subject(input: DgLinkInput): string | null {
  return segment(input.subjectId);
}

export function agreement(input: DgLinkInput): string | null {
  return segment(input.agreementId);
}

export function payloadSegment(input: DgLinkInput, key: string): string | null {
  return segment(input.payload[key]);
}

export function payloadDate(input: DgLinkInput, key: string): string | null {
  const value = input.payload[key];
  return typeof value === 'string' && SAFE_DATE.test(value) ? value : null;
}

/** Internal task UI (owner app); the employee app maps `/tasks/:id` itself. */
export function internalTaskLink(input: DgLinkInput): string | null {
  const id = subject(input);
  return id ? `/tasks/${id}` : internalProjectLink(input);
}
