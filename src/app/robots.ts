import type { MetadataRoute } from 'next';
import { serverEnv } from '@/shared/env/server';

export default function robots(): MetadataRoute.Robots {
  let base = 'http://localhost:3000';
  try {
    base = serverEnv().APP_URL.replace(/\/$/, '');
  } catch {
    base = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') ?? base;
  }

  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/', '/legal/'],
        disallow: ['/api/', '/*/employee', '/*/onboarding'],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
  };
}
