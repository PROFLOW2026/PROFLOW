import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import {
  Calendar,
  CheckSquare,
  ChevronLeft,
  ClipboardList,
  ExternalLink,
  MapPin,
  Users,
} from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { getMeetingDetailById } from '@/modules/meetings';
import type { MeetingActionItem, MeetingDecision } from '@/modules/meetings';
import { withOrgContext, getShellContext } from '@/shared/auth/session';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { Link } from '@/shared/i18n/navigation';

export async function generateMetadata({
  params: _params,
}: {
  params: Promise<{ locale: string; meetingId: string }>;
}): Promise<Metadata> {
  return { title: 'Meeting Detail' };
}

interface MeetingDetailPageProps {
  params: Promise<{ locale: string; meetingId: string }>;
}

export default async function MeetingDetailPage({ params }: MeetingDetailPageProps) {
  const shell = await getShellContext();

  if (!shell?.permissions.has(PERMISSIONS.MEETINGS_READ)) {
    notFound();
  }

  const { meetingId } = await params;
  const canManage = shell.permissions.has(PERMISSIONS.MEETINGS_MANAGE);
  const canCreateTasks = shell.permissions.has(PERMISSIONS.TASKS_CREATE);

  let detail;
  try {
    detail = await withOrgContext((context) => getMeetingDetailById(context, meetingId));
  } catch {
    notFound();
  }

  return (
    <div className="flex min-w-0 max-w-full flex-col gap-6">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1 text-sm text-[var(--pf-text-secondary)]">
        <Link href="/meetings" className="flex items-center gap-1 hover:text-[var(--pf-text-primary)]">
          <ChevronLeft className="h-3 w-3" aria-hidden />
          Meetings
        </Link>
        <span>/</span>
        <span className="text-[var(--pf-text-primary)]">{detail.title}</span>
      </nav>

      <PageHeader
        title={detail.title}
        description={
          <div className="flex flex-wrap items-center gap-3 text-sm text-[var(--pf-text-secondary)]">
            <span className="flex items-center gap-1">
              <Calendar className="h-3.5 w-3.5" aria-hidden />
              {formatFullDate(detail.scheduledAt)}
            </span>
            {detail.location && (
              <span className="flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5" aria-hidden />
                {detail.location}
              </span>
            )}
            {(detail.projectName || detail.workspaceName) && (
              <span>
                {detail.projectName ? (
                  <Link href={`/projects/${detail.projectId}`} className="hover:underline">
                    {detail.projectName}
                  </Link>
                ) : (
                  detail.workspaceName
                )}
              </span>
            )}
          </div>
        }
        actions={
          canManage ? (
            <Button asChild variant="secondary">
              <Link href={`/meetings/${meetingId}/edit`} prefetch={false}>
                Edit Meeting
              </Link>
            </Button>
          ) : undefined
        }
      />

      {/* ── Notes ── */}
      {detail.notes && (
        <section className="rounded-lg border border-[var(--pf-border)] p-4">
          <h2 className="mb-2 text-sm font-semibold">Notes</h2>
          <p className="whitespace-pre-wrap text-sm text-[var(--pf-text-secondary)]">{detail.notes}</p>
        </section>
      )}

      {/* ── Attendees ── */}
      <section className="rounded-lg border border-[var(--pf-border)] p-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <Users className="h-4 w-4 text-[var(--pf-text-secondary)]" aria-hidden />
            Attendees ({detail.attendees.length})
          </h2>
          {canManage && (
            <Button asChild size="sm" variant="ghost">
              <Link href={`/meetings/${meetingId}/attendees/add`} prefetch={false}>
                + Add Attendee
              </Link>
            </Button>
          )}
        </div>
        {detail.attendees.length === 0 ? (
          <p className="text-sm text-[var(--pf-text-muted)]">No attendees recorded.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {detail.attendees.map((attendee) => (
              <span
                key={attendee.id}
                className="inline-flex items-center rounded-full bg-[var(--pf-badge-bg)] px-3 py-1 text-sm"
              >
                {attendee.resolvedName ?? attendee.displayName ?? 'Unknown'}
                {attendee.orgMemberId && (
                  <span className="ml-1 text-xs text-[var(--pf-text-muted)]">(member)</span>
                )}
                {attendee.employeeId && (
                  <span className="ml-1 text-xs text-[var(--pf-text-muted)]">(employee)</span>
                )}
                {attendee.contactId && (
                  <span className="ml-1 text-xs text-[var(--pf-text-muted)]">(contact)</span>
                )}
              </span>
            ))}
          </div>
        )}
      </section>

      {/* ── Decisions ─────────────────────────────────────────────────────────
           IMPORTANT: Decisions are canonical records, NOT tasks.
           Action items under a decision may optionally create/link tasks.
      ── */}
      <section className="rounded-lg border border-[var(--pf-border)] p-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <CheckSquare className="h-4 w-4 text-[var(--pf-text-secondary)]" aria-hidden />
              Decisions ({detail.decisions.length})
            </h2>
            <span className="rounded bg-blue-50 px-1.5 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-950 dark:text-blue-300">
              Canonical Records — not tasks
            </span>
          </div>
          {canManage && (
            <Button asChild size="sm" variant="ghost">
              <Link href={`/meetings/${meetingId}/decisions/new`} prefetch={false}>
                + Add Decision
              </Link>
            </Button>
          )}
        </div>
        {detail.decisions.length === 0 ? (
          <p className="text-sm text-[var(--pf-text-muted)]">No decisions recorded yet.</p>
        ) : (
          <ul className="space-y-3">
            {detail.decisions.map((decision) => (
              <DecisionItem key={decision.id} decision={decision} meetingId={meetingId} canManage={canManage} />
            ))}
          </ul>
        )}
      </section>

      {/* ── Action Items ── */}
      <section className="rounded-lg border border-[var(--pf-border)] p-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <ClipboardList className="h-4 w-4 text-[var(--pf-text-secondary)]" aria-hidden />
            Action Items ({detail.actionItems.length})
          </h2>
          {canManage && (
            <Button asChild size="sm" variant="ghost">
              <Link href={`/meetings/${meetingId}/action-items/new`} prefetch={false}>
                + Add Action Item
              </Link>
            </Button>
          )}
        </div>
        {detail.actionItems.length === 0 ? (
          <p className="text-sm text-[var(--pf-text-muted)]">No action items recorded yet.</p>
        ) : (
          <ul className="space-y-2">
            {detail.actionItems.map((item) => (
              <ActionItemRow
                key={item.id}
                item={item}
                meetingId={meetingId}
                canManage={canManage}
                canCreateTasks={canCreateTasks}
              />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function DecisionItem({
  decision,
  meetingId,
  canManage,
}: {
  decision: MeetingDecision;
  meetingId: string;
  canManage: boolean;
}) {
  return (
    <li className="rounded-md border border-[var(--pf-border)] p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-medium text-sm">{decision.title}</p>
          {decision.body && (
            <p className="mt-1 whitespace-pre-wrap text-sm text-[var(--pf-text-secondary)]">
              {decision.body}
            </p>
          )}
          {decision.decidedAt && (
            <p className="mt-1 text-xs text-[var(--pf-text-muted)]">
              Decided {formatShortDate(decision.decidedAt)}
            </p>
          )}
        </div>
        {canManage && (
          <Button asChild size="sm" variant="ghost">
            <Link href={`/meetings/${meetingId}/decisions/${decision.id}/edit`} prefetch={false}>
              Edit
            </Link>
          </Button>
        )}
      </div>
    </li>
  );
}

function ActionItemRow({
  item,
  meetingId,
  canManage,
  canCreateTasks,
}: {
  item: MeetingActionItem;
  meetingId: string;
  canManage: boolean;
  canCreateTasks: boolean;
}) {
  const statusColors: Record<string, string> = {
    open: 'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
    done: 'bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300',
    cancelled: 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400',
  };

  return (
    <li className="flex items-start gap-3 rounded-md border border-[var(--pf-border)] p-3">
      {/* Status toggle form — real toggle needs a server action or client component */}
      <span
        className={`mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-xs font-medium capitalize ${statusColors[item.status] ?? statusColors.open}`}
      >
        {item.status}
      </span>

      <div className="min-w-0 flex-1">
        <p className={`text-sm font-medium ${item.status === 'done' ? 'line-through text-[var(--pf-text-muted)]' : ''}`}>
          {item.title}
        </p>
        {item.dueDate && (
          <p className="mt-0.5 text-xs text-[var(--pf-text-secondary)]">Due: {item.dueDate}</p>
        )}

        {/* Linked task */}
        {item.taskId && (
          <Link
            href={`/tasks/${item.taskId}`}
            className="mt-1 inline-flex items-center gap-1 text-xs text-[var(--pf-accent)] hover:underline"
          >
            <ExternalLink className="h-3 w-3" aria-hidden />
            View linked task
          </Link>
        )}
      </div>

      <div className="flex shrink-0 gap-1">
        {/* Create task button — only when no task linked yet */}
        {canManage && canCreateTasks && !item.taskId && item.status === 'open' && (
          <Button asChild size="sm" variant="ghost">
            <Link
              href={`/meetings/${meetingId}/action-items/${item.id}/create-task`}
              prefetch={false}
              title="Create task from this action item"
            >
              + Task
            </Link>
          </Button>
        )}
        {canManage && (
          <Button asChild size="sm" variant="ghost">
            <Link
              href={`/meetings/${meetingId}/action-items/${item.id}/edit`}
              prefetch={false}
            >
              Edit
            </Link>
          </Button>
        )}
      </div>
    </li>
  );
}

// ─── Date helpers ─────────────────────────────────────────────────────────────

function formatFullDate(date: Date): string {
  return date.toLocaleDateString(undefined, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatShortDate(date: Date): string {
  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}
