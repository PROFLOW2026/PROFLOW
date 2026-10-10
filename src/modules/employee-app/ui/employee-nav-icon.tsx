import { Clock, FolderKanban, Home, ListChecks, type LucideIcon } from 'lucide-react';

const ICONS: Readonly<Record<string, LucideIcon>> = {
  home: Home,
  time: Clock,
  projects: FolderKanban,
  tasks: ListChecks,
};

export function EmployeeNavIcon({ iconKey, className }: { iconKey: string; className?: string }) {
  const Icon = ICONS[iconKey] ?? Home;
  return <Icon className={className ?? 'size-5'} aria-hidden />;
}
