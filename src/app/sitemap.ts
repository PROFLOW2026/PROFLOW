import type { MetadataRoute } from 'next';
import { routing } from '@/shared/i18n/routing';
import { serverEnv } from '@/shared/env/server';
import { PRE_LAUNCH_BLOCK_SEARCH_INDEXING } from '@/shared/seo/pre-launch';

export default function sitemap(): MetadataRoute.Sitemap {
  if (PRE_LAUNCH_BLOCK_SEARCH_INDEXING) {
    return [];
  }

  let base = 'http://localhost:3000';
  try {
    base = serverEnv().APP_URL.replace(/\/$/, '');
  } catch {
    base = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') ?? base;
  }

  const paths = ['', '/legal/terms', '/legal/privacy'] as const;
  const entries: MetadataRoute.Sitemap = [];

  for (const locale of routing.locales) {
    for (const path of paths) {
      entries.push({
        url: `${base}/${locale}${path}`,
        lastModified: new Date(),
        changeFrequency: path === '' ? 'weekly' : 'monthly',
        priority: path === '' ? 1 : 0.5,
      });
    }
  }

  return entries;
}
