import { notFound } from 'next/navigation';
import { hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import type { OrgContext } from '@/shared/auth/context';
import { externalToolsEnabled, externalWasmEnabled } from '../domain/flags';
import { ExternalToolsHome } from './external-tools-home';

export function externalToolAccess(context: OrgContext): { view: boolean; takeoff: boolean } {
  return {
    view: hasPermission(context, PERMISSIONS.TOOLS_EXTERNAL_VIEWER),
    takeoff: hasPermission(context, PERMISSIONS.TOOLS_EXTERNAL_TAKEOFF),
  };
}

export function ExternalToolsScreen({ view, takeoff }: { view: boolean; takeoff: boolean }) {
  if (!externalToolsEnabled() || (!view && !takeoff)) notFound();
  return <ExternalToolsHome canView={view} canTakeoff={takeoff} wasmReady={externalWasmEnabled()} />;
}
