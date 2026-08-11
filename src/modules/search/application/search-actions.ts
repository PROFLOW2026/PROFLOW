'use server';

import { withOrgContext } from '@/shared/auth/session';
import { globalSearch } from './global-search';
import type { GlobalSearchResult } from '../domain/types';

export async function globalSearchAction(query: string): Promise<GlobalSearchResult> {
  return withOrgContext((context) => globalSearch(context, { query }));
}
