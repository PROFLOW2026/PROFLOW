import { Montserrat } from 'next/font/google';

/** Latin wordmark only — scoped to EXLFY lockup (not global body). */
export const exlfyWordmarkFont = Montserrat({
  subsets: ['latin'],
  weight: ['700'],
  display: 'swap',
  variable: '--font-exlfy-wordmark',
});
