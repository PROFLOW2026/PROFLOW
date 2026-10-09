import { describe, expect, it } from 'vitest';
import robots from '@/app/robots';
import sitemap from '@/app/sitemap';
import { preLaunchHomepageRobots, PRE_LAUNCH_BLOCK_SEARCH_INDEXING } from '@/shared/seo/pre-launch';

describe('pre-launch SEO containment', () => {
  it('blocks search indexing while pre-launch flag is on', () => {
    expect(PRE_LAUNCH_BLOCK_SEARCH_INDEXING).toBe(true);
  });

  it('robots disallows all crawlers and omits sitemap advertisement', () => {
    const r = robots();
    const rules = Array.isArray(r.rules) ? r.rules : [r.rules];
    const rule = rules[0]!;
    expect(rule.disallow).toEqual(['/']);
    expect(rule.allow).toBeUndefined();
    expect(r.sitemap).toBeUndefined();
  });

  it('sitemap returns no public entries while pre-launch', () => {
    expect(sitemap()).toEqual([]);
  });

  it('homepage metadata robots are noindex/nofollow while pre-launch', () => {
    expect(preLaunchHomepageRobots()).toEqual({ index: false, follow: false });
  });
});
