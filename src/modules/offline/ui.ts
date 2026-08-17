/**
 * UI entry point for offline / PWA helpers.
 *
 * Kept separate from `index.ts` so application and domain imports stay free of React.
 */

export {
  OfflineOrgProvider,
  OfflineScopeProvider,
  useOfflineAwareFormAction,
  useOfflineOrganizationId,
  useOfflineScope,
  useOfflineUserId,
  type OfflineDraftFormState,
  type OfflineScopeContextValue,
} from './ui/use-offline-aware-form-action';
export { OfflineDraftSaveControls } from './ui/offline-draft-save-controls';
export { ConnectivityBanner, ConnectivityIndicator } from './ui/connectivity-banner';
export { OfflineSyncProvider } from './ui/offline-sync-provider';
export { OfflineDraftsPanel } from './ui/offline-drafts-panel';
export { PwaBootstrap } from './ui/pwa-bootstrap';
export { PwaInstallCta } from './ui/pwa-install-cta';
export { PwaInstallPanel } from './ui/pwa-install-panel';
export { usePwaInstall } from './ui/use-pwa-install';
export { enqueueProductDraft } from './data/enqueue-product-draft';
