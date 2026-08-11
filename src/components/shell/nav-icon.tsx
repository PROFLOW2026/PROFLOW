'use client';

import {
  Briefcase,
  Building2,
  CalendarCheck,
  ClipboardCheck,
  ClipboardList,
  Clock,
  FileText,
  FileSpreadsheet,
  FolderKanban,
  Handshake,
  HardHat,
  Inbox,
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
  BadgeCheck,
  CalendarClock,
  type LucideIcon,
} from 'lucide-react';
import type { NavIconKey } from './navigation';

const NAV_ICONS: Record<NavIconKey, LucideIcon> = {
  dashboard: LayoutDashboard,
  today: Inbox,
  projects: FolderKanban,
  jobs: Briefcase,
  expenses: Receipt,
  billing: Wallet,
  changes: Repeat2,
  clients: Building2,
  vendors: Truck,
  workforce: Users,
  attendance: Clock,
  documents: FileText,
  crm: Handshake,
  quotes: FileSpreadsheet,
  compliance: ShieldCheck,
  procurement: ClipboardList,
  materials: Package,
  fieldOps: HardHat,
  forms: ClipboardCheck,
  assets: Wrench,
  reports: ChartColumn,
  approvals: BadgeCheck,
  monthClose: CalendarCheck,
  service: CalendarClock,
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
