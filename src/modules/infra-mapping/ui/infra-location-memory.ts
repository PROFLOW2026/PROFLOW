/**
 * Remembers the chosen location while the user moves between the infrastructure screens (capture, gallery,
 * locating) and between the task / project pages of the same project. Browser session only: no database, no
 * account setting, and it is forgotten when the tab is closed.
 */

const PREFIX = 'pf-infra-location:';

export function readRememberedLocation(projectId: string, isUsable: (locationId: string) => boolean): string | null {
  try {
    const stored = window.sessionStorage.getItem(`${PREFIX}${projectId}`);
    return stored && isUsable(stored) ? stored : null;
  } catch {
    return null;
  }
}

export function rememberLocation(projectId: string, locationId: string | null): void {
  try {
    const key = `${PREFIX}${projectId}`;
    if (locationId) window.sessionStorage.setItem(key, locationId);
    else window.sessionStorage.removeItem(key);
  } catch {
    // Storage can be unavailable (private mode): the choice then simply is not remembered.
  }
}
