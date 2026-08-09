import type { ReactNode } from 'react';

/**
 * The real document shell lives in `[locale]/layout.tsx`, because `lang` and
 * `dir` cannot be decided before the locale is known.
 */
export default function RootLayout({ children }: { children: ReactNode }) {
  return children;
}
