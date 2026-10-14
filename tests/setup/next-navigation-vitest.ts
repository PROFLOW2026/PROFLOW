import { vi } from 'vitest';

process.env.OAUTH_STATE_SECRET ??= 'unit-test-oauth-state-secret-key';

vi.mock('next/navigation', async () => import('./next-navigation-stub'));
