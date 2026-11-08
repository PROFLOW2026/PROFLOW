import createNextIntlPlugin from 'next-intl/plugin';
import { PHASE_PRODUCTION_BUILD } from 'next/constants';
import type { NextConfig } from 'next';

const withNextIntl = createNextIntlPlugin('./src/shared/i18n/request.ts');

function nextConfig(phase: string): NextConfig {
  const productionBuild = phase === PHASE_PRODUCTION_BUILD;
  const githubActionsBuild = productionBuild && process.env.GITHUB_ACTIONS === 'true';
  return {
  reactStrictMode: true,
  poweredByHeader: false,
  allowedDevOrigins: ['127.0.0.1', 'localhost'],
  // exceljs is large and export/import only — keep it out of the client graph.
  serverExternalPackages: ['postgres', 'exceljs', 'drizzle-orm', 'pdf-lib', '@pdf-lib/fontkit', 'bidi-js'],
  // Pre-bundled dist is used; transpile peers if Turbopack resolves TypeScript sources.
  transpilePackages: [
    '@mlightcad/cad-simple-viewer',
    '@mlightcad/data-model',
    '@mlightcad/three-renderer',
    '@mlightcad/mtext-renderer',
    '@mlightcad/mtext-parser',
    '@mlightcad/common',
    '@mlightcad/geometry-engine',
    '@mlightcad/graphic-interface',
  ],
  // Hebrew PDF font is read via fs at runtime — include it in every serverless trace.
  outputFileTracingIncludes: {
    '/*': ['./src/modules/reports/fonts/**/*'],
  },
  typedRoutes: false,
  // R-04: tsc --noEmit is clean, so the production build no longer ignores type errors.
  // The previous ignoreBuildErrors flag also skipped a second typecheck that exhausted
  // the 8 GB Vercel builder. Restore it only if a Linux production build fails on a
  // Next-only check that tsc does not see, and record that failure as accepted risk.
  // package-lock.json lives beside this file, not at the drive root Next infers.
  turbopack: { root: import.meta.dirname },
  ...(productionBuild
    ? {
        // Next 16.3 defaults raise post-webpack peak RAM on 8 GB builders.
        productionBrowserSourceMaps: false,
        enablePrerenderSourceMaps: false,
        experimental: {
          webpackMemoryOptimizations: true,
          // Avoid parent+worker both growing toward NODE_OPTIONS on 8 GB builders.
          // Peak CAD compile cost is also cut by production-only single DWG engine
          // in pf-dwg-versioned-viewer.tsx.
          webpackBuildWorker: false,
          staticGenerationMaxConcurrency: githubActionsBuild ? 1 : 2,
        },
        webpack: (config) => {
          config.parallelism = 1;
          if (githubActionsBuild) {
            config.cache = false;
          } else if (config.cache && typeof config.cache === 'object') {
            config.cache.maxMemoryGenerations = 0;
          }
          return config;
        },
      }
    : {}),
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(self), microphone=(), geolocation=()' },
          { key: 'Content-Security-Policy', value: "frame-ancestors 'none'; base-uri 'self'; object-src 'none'" },
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
      {
        source: '/marketing/screenshots/:path*',
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
