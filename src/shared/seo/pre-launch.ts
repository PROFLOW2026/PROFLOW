/**
 * Pre-launch search indexing gate. Flip to `false` in one controlled release when
 * the Owner explicitly enables public discovery.
 */
export const PRE_LAUNCH_BLOCK_SEARCH_INDEXING = true;

export function preLaunchHomepageRobots(): { index: boolean; follow: boolean } {
  if (PRE_LAUNCH_BLOCK_SEARCH_INDEXING) {
    return { index: false, follow: false };
  }
  return { index: true, follow: true };
}
