import type { MetadataRoute } from 'next';
import { serverEnv } from '@/shared/env/server';
import { PRE_LAUNCH_BLOCK_SEARCH_INDEXING } from '@/shared/seo/pre-launch';

function appBaseUrl(): string {
  let base = 'http://localhost:3000';
  try {
    base = serverEnv().APP_URL.replace(/\/$/, '');
  } catch {
    base = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') ?? base;
  }
  return base;
}

export default function robots(): MetadataRoute.Robots {
  if (PRE_LAUNCH_BLOCK_SEARCH_INDEXING) {
    return {
      rules: [
        {
          userAgent: '*',
          disallow: ['/'],
        },
      ],
    };
  }

  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/', '/legal/'],
        disallow: ['/api/', '/*/employee', '/*/onboarding'],
      },
    ],
    sitemap: `${appBaseUrl()}/sitemap.xml`,
  };
}
