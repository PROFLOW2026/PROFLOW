/**
 * UI entry point for offline / PWA helpers.
 *
 * Kept separate from `index.ts` so application and domain imports stay free of React.
 */

export {
  OfflineOrgProvider,
  useOfflineAwareFormAction,
  useOfflineOrganizationId,
  type OfflineDraftFormState,
} from './ui/use-offline-aware-form-action';
export { OfflineDraftSaveControls } from './ui/offline-draft-save-controls';
export { ConnectivityBanner, ConnectivityIndicator } from './ui/connectivity-banner';
export { OfflineSyncProvider } from './ui/offline-sync-provider';
export { OfflineDraftsPanel } from './ui/offline-drafts-panel';
