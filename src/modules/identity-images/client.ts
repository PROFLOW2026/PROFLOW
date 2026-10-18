/**
 * Browser-safe identity image UI. Client components must import from here
 * (or `./ui/*`), never from `./index` which re-exports server application code.
 */

export { IdentityImageControl, type IdentityImageCopy } from './ui/identity-image-control';
export { IdentityAvatar } from './ui/identity-avatar';
export { EmployeeAvatarPanel } from './ui/employee-avatar-panel';
export { ContractorAvatarPanel } from './ui/contractor-avatar-panel';
export { VendorLogoPanel } from './ui/vendor-logo-panel';
