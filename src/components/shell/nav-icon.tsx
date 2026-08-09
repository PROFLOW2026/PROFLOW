'use client';

import {
  Building2,
  FileText,
  FolderKanban,
  LayoutDashboard,
  Receipt,
  Repeat2,
  Settings,
  Truck,
  Users,
  Wallet,
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
