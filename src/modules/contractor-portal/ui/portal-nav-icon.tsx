import {
  Bell,
  CalendarDays,
  ClipboardCheck,
  ClipboardList,
  FileQuestion,
  FileStack,
  FileText,
  Gavel,
  HardHat,
  Home,
  KeyRound,
  LayoutDashboard,
  ListChecks,
  type LucideIcon,
  Map as MapIcon,
  NotebookPen,
  PackageCheck,
  Receipt,
  ShieldCheck,
  Truck,
  UserRound,
  Wallet,
  Wrench,
} from 'lucide-react';

const ICONS: Readonly<Record<string, LucideIcon>> = {
  dashboard: LayoutDashboard,
  notifications: Bell,
  account: UserRound,
  'project.home': Home,
  'project.tasks': ListChecks,
  'project.schedule': CalendarDays,
  'project.documents': FileText,
  'project.plans': MapIcon,
  'project.rfi': FileQuestion,
  'project.submittals': FileStack,
  'project.defects': Wrench,
  'project.inspections': ClipboardCheck,
  'project.instructions': ClipboardList,
  'project.siteLog': NotebookPen,
  'project.compliance': ShieldCheck,
  'project.deliveries': Truck,
  'project.safety': HardHat,
  'project.claims': Receipt,
  'project.payments': Wallet,
  'project.tenders': Gavel,
  'project.handover': PackageCheck,
};

export function PortalNavIcon({ navKey, className }: { navKey: string; className?: string }) {
  const Icon = ICONS[navKey] ?? KeyRound;
  return <Icon className={className ?? 'size-5'} aria-hidden />;
}
