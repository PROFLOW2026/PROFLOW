import { vi } from 'vitest';

/** Vitest/Vite ESM resolver stub — Next ships `navigation.js` as CJS; next-intl imports it in Node tests. */
export function useRouter() {
  return {
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
  };
}

export function usePathname(): string {
  return '/';
}

export function useSearchParams(): URLSearchParams {
  return new URLSearchParams();
}

export function useParams(): Record<string, string | string[]> {
  return {};
}

export function redirect(_url: string): never {
  throw new Error('redirect() is not available in Vitest');
}

export function permanentRedirect(_url: string): never {
  throw new Error('permanentRedirect() is not available in Vitest');
}

export function notFound(): never {
  throw new Error('notFound() is not available in Vitest');
}
