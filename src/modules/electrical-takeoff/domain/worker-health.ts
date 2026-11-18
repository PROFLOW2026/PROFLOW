export const REQUIRED_WORKER_PROTOCOL = 1;

export type WorkerHealthSnapshot = {
  protocol: number;
  capabilities: string[];
  workerBuild: string;
};

export function parseWorkerHealth(body: unknown): WorkerHealthSnapshot | null {
  if (!body || typeof body !== 'object') return null;
  const raw = body as Record<string, unknown>;
  const protocol = typeof raw.protocol === 'number' ? raw.protocol : 1;
  const capabilities = Array.isArray(raw.capabilities)
    ? raw.capabilities.filter((row): row is string => typeof row === 'string')
    : [];
  const workerBuild = typeof raw.workerBuild === 'string' ? raw.workerBuild : 'unknown';
  return { protocol, capabilities, workerBuild };
}

export function workerProtocolBlocksDispatch(health: WorkerHealthSnapshot | null): boolean {
  if (!health) return false;
  return health.protocol < REQUIRED_WORKER_PROTOCOL;
}

export function workerMissingCapability(health: WorkerHealthSnapshot | null, name: string): boolean {
  if (!health) return false;
  return !health.capabilities.includes(name);
}