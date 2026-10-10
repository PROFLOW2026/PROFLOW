import { vi } from 'vitest';

vi.mock('next/navigation', async () => import('./next-navigation-stub'));
