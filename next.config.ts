import createNextIntlPlugin from 'next-intl/plugin';
import { PHASE_PRODUCTION_BUILD } from 'next/constants';
import type { NextConfig } from 'next';

const withNextIntl = createNextIntlPlugin('./src/shared/i18n/request.ts');

function nextConfig(phase: string): NextConfig {
  return {
  reactStrictMode: true,
  poweredByHeader: false,
  allowedDevOrigins: ['127.0.0.1', 'localhost'],
  // exceljs is large and export/import only — keep it out of the client graph.
  serverExternalPackages: ['postgres', 'exceljs', 'drizzle-orm', 'pdf-lib', '@pdf-lib/fontkit', 'bidi-js'],
  // Hebrew PDF font is read via fs at runtime — include it in every serverless trace.
  outputFileTracingIncludes: {
    '/*': ['./src/modules/reports/fonts/**/*'],
  },
  typedRoutes: false,
  // Full-repo typecheck stays on `npm run typecheck` (tsconfig.json).
  // Production build typecheck skips tests/scripts so it does not repeat that graph in-process.
  typescript:
    phase === PHASE_PRODUCTION_BUILD
      ? { tsconfigPath: 'tsconfig.build.json' }
      : undefined,
  // package-lock.json lives beside this file, not at the drive root Next infers.
  turbopack: { root: import.meta.dirname },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(self), microphone=(), geolocation=()' },
        ],
      },
      {
        source: '/sw.js',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=0, must-revalidate' },
          { key: 'Service-Worker-Allowed', value: '/' },
        ],
      },
      {
        source: '/manifest.webmanifest',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=0, must-revalidate' }],
      },
      {
        source: '/pdf.worker.min.mjs',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
    ];
  },
  };
}

export default function config(phase: string) {
  return withNextIntl(nextConfig(phase));
}
