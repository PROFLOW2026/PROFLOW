import { createNavigation } from 'next-intl/navigation';
import { routing } from './routing';

/**
 * Locale-aware navigation primitives. Components must use these instead of
 * `next/link` and `next/navigation` so the active locale prefix is preserved.
 */
const navigation = createNavigation(routing);

export const { Link, usePathname, useRouter, getPathname } = navigation;

/**
 * Typed as `never` so callers do not need an unreachable `return` after it.
 * The underlying Next.js redirect throws to unwind the render.
 */
export function redirect(...args: Parameters<typeof navigation.redirect>): never {
  navigation.redirect(...args);
  throw new Error('redirect() was expected to interrupt rendering');
}
