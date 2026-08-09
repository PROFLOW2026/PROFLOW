import type { ProjectStatus } from '@/modules/projects';
import { StatusBadge } from '@/components/ui/status-badge';
import type { ProjectStatusShape } from '@/modules/projects';

interface ProjectStatusBadgeProps {
  status: ProjectStatus;
  label: string;
}

export function ProjectStatusBadge({ status, label }: ProjectStatusBadgeProps) {
  const shapeMap: Record<ProjectStatus, ProjectStatusShape> = {
    draft: 'draft',
    active: 'active',
    on_hold: 'onHold',
    completed: 'completed',
    cancelled: 'cancelled',
    archived: 'archived',
  };

  return <StatusBadge shape={shapeMap[status]} label={label} />;
}
