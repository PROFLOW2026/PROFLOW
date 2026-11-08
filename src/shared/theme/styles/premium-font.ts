import { IBM_Plex_Sans_Hebrew } from 'next/font/google';

/** Loaded only when Premium sets `--font-sans` to this variable. */
export const premiumFont = IBM_Plex_Sans_Hebrew({
  subsets: ['hebrew', 'latin'],
  weight: ['400', '500', '600'],
  display: 'swap',
  preload: false,
  adjustFontFallback: true,
  variable: '--font-plex-hebrew',
});