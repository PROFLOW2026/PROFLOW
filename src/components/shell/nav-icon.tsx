'use client';

import {
  Building2,
  ClipboardList,
  FileText,
  FolderKanban,
  Handshake,
  HardHat,
  LayoutDashboard,
  Package,
  Receipt,
  Repeat2,
  Settings,
  ShieldCheck,
  Truck,
  Users,
  Wallet,
  Wrench,
  ChartColumn,
  type LucideIcon,
} from 'lucide-react';
import type { NavIconKey } from './navigation';

const NAV_ICONS: Record<NavIconKey, LucideIcon> = {
  dashboard: LayoutDashboard,
  projects: FolderKanban,
  expenses: Receipt,
  billing: Wallet,
  changes: Repeat2,
  clients: Building2,
  vendors: Truck,
  workforce: Users,
  documents: FileText,
  crm: Handshake,
  compliance: ShieldCheck,
  procurement: ClipboardList,
  materials: Package,
  fieldOps: HardHat,
  assets: Wrench,
  reports: ChartColumn,
  settings: Settings,
};

export function NavIcon({
  iconKey,
  className,
}: {
  iconKey: NavIconKey;
  className?: string;
}) {
  const Icon = NAV_ICONS[iconKey];
  return <Icon className={className} aria-hidden />;
}
