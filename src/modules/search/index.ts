/** Public API for the Search module. */

export { globalSearch, searchTasksOnly } from './application/global-search';
export type { GlobalSearchResult, GlobalSearchHit } from './domain/types';
export type { TaskSearchHit, ProjectSearchHit } from './data/search.repository';
export { searchTasks, searchProjects } from './data/search.repository';
export { taskSearchHref } from './domain/hrefs';
