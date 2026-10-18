import {
  Bell,
  Briefcase,
  Building2,
  ClipboardList,
  Clock,
  FileText,
  FolderKanban,
  Home,
  ListChecks,
  Package,
  Receipt,
  ShoppingCart,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react';

const ICONS: Readonly<Record<string, LucideIcon>> = {
  home: Home,
  time: Clock,
  projects: FolderKanban,
  tasks: ListChecks,
  documents: FileText,
  meetings: ClipboardList,
  team: Users,
  forms: ClipboardList,
  notifications: Bell,
  workforce: Users,
  clients: Building2,
  crm: Briefcase,
  billing: Wallet,
  contracts: FileText,
  expenses: Receipt,
  vendors: Package,
  ap: Receipt,
  procurement: ShoppingCart,
  changes: ClipboardList,
  quotes: FileText,
  reports: ClipboardList,
};

/** Map employee nav href → lucide icon key for side/bottom chrome. */
export function employeeNavIconKeyFromHref(href: string): string {
  const map: Record<string, string> = {
    '/employee': 'home',
    '/employee/time': 'time',
    '/employee/projects': 'projects',
    '/employee/tasks': 'tasks',
    '/employee/documents': 'documents',
    '/employee/meetings': 'meetings',
    '/employee/team': 'team',
    '/employee/forms': 'forms',
    '/employee/notifications': 'notifications',
    '/employee/workforce': 'workforce',
    '/employee/clients': 'clients',
    '/employee/crm': 'crm',
    '/employee/billing': 'billing',
    '/employee/contracts': 'contracts',
    '/employee/expenses': 'expenses',
    '/employee/vendors': 'vendors',
    '/employee/ap': 'ap',
    '/employee/procurement': 'procurement',
    '/employee/changes': 'changes',
    '/employee/quotes': 'quotes',
    '/employee/reports': 'reports',
  };
  return map[href] ?? 'home';
}

export function EmployeeNavIcon({
  iconKey,
  className,
}: {
  iconKey: string;
  className?: string;
}) {
  const Icon = ICONS[iconKey] ?? Home;
  return <Icon className={className ?? 'size-5'} aria-hidden />;
}
