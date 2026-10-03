'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { ShieldCheck, UserPlus, Users } from 'lucide-react';
import * as React from 'react';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useOptionalToast } from '@/components/ui/toast';
import {
  PROJECT_CAPABILITY_GROUPS,
  isFinancialCapability,
  isProjectCapability,
  type ProjectCapability,
} from '../domain/capabilities';
import { CAPABILITIES_BY_GROUP, planCapabilityChange } from '../domain/editor';
import type { ProjectTeamScreenProps, TeamMemberView, TeamTemplateOption } from '../domain/views';
import {
  addProjectMemberAction,
  setProjectMemberCapabilitiesAction,
  setProjectMemberStatusAction,
  type ProjectTeamActionResult,
} from './actions';
import { CapabilityEditor, matchingTemplateKey } from './capability-editor';

const isFinancial = (capability: ProjectCapability) => isFinancialCapability(capability);

function hasFinancial(capabilities: readonly string[]): boolean {
  return capabilities.some((capability) => isProjectCapability(capability) && isFinancialCapability(capability));
}

function groupCounts(capabilities: readonly string[]) {
  const held = new Set(capabilities);
  return PROJECT_CAPABILITY_GROUPS.map((group) => ({
    group,
    count: CAPABILITIES_BY_GROUP[group].filter((capability) => held.has(capability)).length,
  })).filter((entry) => entry.count > 0);
}

export function ProjectTeamManager(props: ProjectTeamScreenProps) {
  const t = useTranslations('projectTeam');
  const router = useRouter();
  const toast = useOptionalToast();
  const actor = React.useMemo(() => new Set(props.viewer.capabilities), [props.viewer.capabilities]);
  const [editing, setEditing] = React.useState<TeamMemberView | null>(null);
  const [adding, setAdding] = React.useState(false);
  const [statusError, setStatusError] = React.useState<string | null>(null);
  const [pendingStatusId, setPendingStatusId] = React.useState<string | null>(null);

  const active = props.members.filter((member) => member.status === 'active');
  const inactive = props.members.filter((member) => member.status === 'inactive');

  const onDone = (message: string) => {
    toast?.push(message, 'success');
    router.refresh();
  };

  async function changeStatus(member: TeamMemberView, nextActive: boolean) {
    if (!nextActive && !window.confirm(t('members.confirmDeactivate', { name: member.name }))) return;
    setPendingStatusId(member.id);
    setStatusError(null);
    try {
      const result = await setProjectMemberStatusAction({
        projectId: props.projectId,
        memberId: member.id,
        active: nextActive,
      });
      if (result.ok) onDone(nextActive ? t('toasts.reactivated') : t('toasts.deactivated'));
      else setStatusError(result.error ?? t('errors.notAllowed'));
    } finally {
      setPendingStatusId(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {props.viewer.isOrgAdmin ? (
        <Alert tone="info" icon={ShieldCheck} title={t('viewer.orgAdminTitle')}>
          {t('viewer.orgAdmin')}
        </Alert>
      ) : !props.viewer.canManage ? (
        <Alert tone="info">{t('viewer.readOnly')}</Alert>
      ) : null}

      {statusError ? <Alert tone="danger">{statusError}</Alert> : null}

      <Card>
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-3">
          <div className="flex flex-col gap-1">
            <CardTitle>{t('members.heading', { count: active.length })}</CardTitle>
            <p className="text-sm text-[var(--pf-text-secondary)]">{t('members.description')}</p>
          </div>
          {props.viewer.canManage ? (
            <Button
              type="button"
              onClick={() => setAdding(true)}
              disabled={props.candidates.length === 0}
              className="w-full sm:w-auto"
            >
              <UserPlus aria-hidden />
              {t('actions.addMember')}
            </Button>
          ) : null}
        </CardHeader>
        <CardContent className="px-0 py-0 sm:px-0">
          {props.viewer.canManage && props.candidates.length === 0 ? (
            <p className="border-b border-[var(--pf-border-default)] px-4 py-3 text-xs text-[var(--pf-text-muted)] sm:px-5">
              {t('add.noCandidates')}
            </p>
          ) : null}
          {active.length === 0 ? (
            <EmptyState
              icon={Users}
              size="sm"
              title={t('members.emptyTitle')}
              description={props.viewer.canManage ? t('members.emptyManage') : t('members.emptyReadOnly')}
            />
          ) : (
            <MemberList
              members={active}
              templates={props.templates}
              viewerUserId={props.viewer.userId}
              canManage={props.viewer.canManage}
              pendingStatusId={pendingStatusId}
              onEdit={setEditing}
              onStatus={changeStatus}
            />
          )}
        </CardContent>
      </Card>

      {inactive.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>{t('members.inactiveHeading', { count: inactive.length })}</CardTitle>
          </CardHeader>
          <CardContent className="px-0 py-0 sm:px-0">
            <MemberList
              members={inactive}
              templates={props.templates}
              viewerUserId={props.viewer.userId}
              canManage={props.viewer.canManage}
              pendingStatusId={pendingStatusId}
              onEdit={setEditing}
              onStatus={changeStatus}
            />
          </CardContent>
        </Card>
      ) : null}

      {editing ? (
        <EditMemberDialog
          key={editing.id}
          projectId={props.projectId}
          member={editing}
          templates={props.templates}
          actor={actor}
          readOnly={!props.viewer.canManage || editing.status === 'inactive'}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            onDone(t('toasts.saved'));
          }}
        />
      ) : null}

      {adding ? (
        <AddMemberDialog
          projectId={props.projectId}
          candidates={props.candidates}
          templates={props.templates}
          actor={actor}
          onClose={() => setAdding(false)}
          onAdded={() => {
            setAdding(false);
            onDone(t('toasts.added'));
          }}
        />
      ) : null}
    </div>
  );
}

function TemplateLabel({
  member,
  templates,
}: {
  member: TeamMemberView;
  templates: readonly TeamTemplateOption[];
}) {
  const t = useTranslations('projectTeam');
  const template = templates.find((candidate) => candidate.key === member.templateKey);
  if (!template) return <span>{t('members.customCapabilities')}</span>;
  const customized = matchingTemplateKey([template], member.capabilities) === null;
  return (
    <span>
      {t(`templates.${template.key}`)}
      {customized ? ` · ${t('members.customized')}` : ''}
    </span>
  );
}

function MemberList({
  members,
  templates,
  viewerUserId,
  canManage,
  pendingStatusId,
  onEdit,
  onStatus,
}: {
  members: readonly TeamMemberView[];
  templates: readonly TeamTemplateOption[];
  viewerUserId: string;
  canManage: boolean;
  pendingStatusId: string | null;
  onEdit: (member: TeamMemberView) => void;
  onStatus: (member: TeamMemberView, active: boolean) => void;
}) {
  const t = useTranslations('projectTeam');
  return (
    <ul className="divide-y divide-[var(--pf-border-default)]">
      {members.map((member) => {
        const financial = hasFinancial(member.capabilities);
        return (
          <li
            key={member.id}
            className="flex flex-col gap-3 px-4 py-3 sm:px-5 md:flex-row md:items-center md:justify-between"
          >
            <div className="flex min-w-0 flex-col gap-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="truncate font-medium">{member.name}</span>
                {member.userId === viewerUserId ? <Badge tone="brand">{t('members.you')}</Badge> : null}
                {member.status === 'inactive' ? (
                  <Badge tone="neutral">{t('members.inactive')}</Badge>
                ) : null}
                {financial ? (
                  <Badge tone="warning">{t('members.financialAccess')}</Badge>
                ) : (
                  <Badge tone="success">{t('members.noFinancialAccess')}</Badge>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-[var(--pf-text-secondary)]">
                {member.title ? <span>{member.title}</span> : null}
                {member.title ? <span aria-hidden>·</span> : null}
                <TemplateLabel member={member} templates={templates} />
                {member.name !== member.email ? (
                  <>
                    <span aria-hidden>·</span>
                    <span className="truncate" dir="ltr">
                      {member.email}
                    </span>
                  </>
                ) : null}
              </div>
              <div className="flex flex-wrap gap-1.5 text-xs text-[var(--pf-text-muted)]">
                {groupCounts(member.capabilities).map((entry) => (
                  <span key={entry.group}>
                    {t('members.groupCount', { group: t(`groups.${entry.group}`), count: entry.count })}
                  </span>
                ))}
              </div>
            </div>
            <div className="flex flex-wrap gap-2 md:shrink-0">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="flex-1 md:flex-none"
                onClick={() => onEdit(member)}
              >
                {canManage && member.status === 'active'
                  ? t('actions.editCapabilities')
                  : t('actions.viewCapabilities')}
              </Button>
              {canManage ? (
                member.status === 'active' ? (
                  <Button
                    type="button"
                    variant="dangerGhost"
                    size="sm"
                    className="flex-1 md:flex-none"
                    loading={pendingStatusId === member.id}
                    onClick={() => onStatus(member, false)}
                  >
                    {t('actions.deactivate')}
                  </Button>
                ) : (
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="flex-1 md:flex-none"
                    loading={pendingStatusId === member.id}
                    onClick={() => onStatus(member, true)}
                  >
                    {t('actions.reactivate')}
                  </Button>
                )
              ) : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function ResultAlert({ result }: { result: ProjectTeamActionResult | null }) {
  if (!result || result.ok || !result.error) return null;
  return <Alert tone="danger">{result.error}</Alert>;
}

function ChangeSummary({
  current,
  next,
  actor,
}: {
  current: readonly string[];
  next: readonly string[];
  actor: ReadonlySet<string>;
}) {
  const t = useTranslations('projectTeam');
  const plan = planCapabilityChange({ current, next, actor, isFinancial });
  if (plan.added.length === 0 && plan.removed.length === 0) {
    return <p className="text-xs text-[var(--pf-text-muted)]">{t('editor.noChanges')}</p>;
  }
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-[var(--pf-text-secondary)]">
        {t('editor.changeSummary', { added: plan.added.length, removed: plan.removed.length })}
      </p>
      {plan.beyondActor.length > 0 ? <Alert tone="danger">{t('editor.beyondActor')}</Alert> : null}
    </div>
  );
}

function EditMemberDialog({
  projectId,
  member,
  templates,
  actor,
  readOnly,
  onClose,
  onSaved,
}: {
  projectId: string;
  member: TeamMemberView;
  templates: readonly TeamTemplateOption[];
  actor: ReadonlySet<string>;
  readOnly: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useTranslations('projectTeam');
  const [selection, setSelection] = React.useState<string[]>([...member.capabilities]);
  const [title, setTitle] = React.useState(member.title ?? '');
  const [result, setResult] = React.useState<ProjectTeamActionResult | null>(null);
  const [pending, startTransition] = React.useTransition();
  const plan = planCapabilityChange({ current: member.capabilities, next: selection, actor, isFinancial });
  const titleChanged = title.trim() !== (member.title ?? '');
  const canSave =
    !readOnly &&
    selection.length > 0 &&
    plan.beyondActor.length === 0 &&
    (plan.added.length > 0 || plan.removed.length > 0 || titleChanged);

  function save() {
    startTransition(async () => {
      const outcome = await setProjectMemberCapabilitiesAction({
        projectId,
        memberId: member.id,
        capabilities: selection,
        templateKey: matchingTemplateKey(templates, selection),
        title: titleChanged ? title.trim() || null : undefined,
      });
      setResult(outcome);
      if (outcome.ok) onSaved();
    });
  }

  return (
    <Dialog open onOpenChange={(open) => (open ? null : onClose())}>
      <DialogContent className="sm:max-w-3xl" closeLabel={t('actions.close')}>
        <DialogHeader>
          <DialogTitle>{t(readOnly ? 'edit.viewTitle' : 'edit.title', { name: member.name })}</DialogTitle>
          <DialogDescription>{readOnly ? t('edit.viewDescription') : t('edit.description')}</DialogDescription>
        </DialogHeader>
        <DialogBody className="flex flex-col gap-4">
          <ResultAlert result={result} />
          {readOnly ? null : (
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium" htmlFor="project-team-edit-title">
                {t('add.titleLabel')}
              </label>
              <Input
                id="project-team-edit-title"
                value={title}
                maxLength={120}
                placeholder={t('add.titlePlaceholder')}
                onChange={(event) => setTitle(event.target.value)}
              />
            </div>
          )}
          <CapabilityEditor
            templates={templates}
            selection={selection}
            onSelectionChange={(next) => {
              setSelection(next);
              setResult(null);
            }}
            actorCapabilities={actor}
            readOnly={readOnly}
            blocked={result?.blockedCapabilities}
            originalSelection={member.capabilities}
          />
          {readOnly ? null : <ChangeSummary current={member.capabilities} next={selection} actor={actor} />}
        </DialogBody>
        <DialogFooter>
          <Button type="button" variant="secondary" onClick={onClose}>
            {readOnly ? t('actions.close') : t('actions.cancel')}
          </Button>
          {readOnly ? null : (
            <Button type="button" onClick={save} disabled={!canSave} loading={pending}>
              {t('actions.save')}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AddMemberDialog({
  projectId,
  candidates,
  templates,
  actor,
  onClose,
  onAdded,
}: {
  projectId: string;
  candidates: ProjectTeamScreenProps['candidates'];
  templates: readonly TeamTemplateOption[];
  actor: ReadonlySet<string>;
  onClose: () => void;
  onAdded: () => void;
}) {
  const t = useTranslations('projectTeam');
  const [query, setQuery] = React.useState('');
  const [userId, setUserId] = React.useState('');
  const [title, setTitle] = React.useState('');
  const [selection, setSelection] = React.useState<string[]>([]);
  const [result, setResult] = React.useState<ProjectTeamActionResult | null>(null);
  const [pending, startTransition] = React.useTransition();

  const normalized = query.trim().toLowerCase();
  const visible = normalized
    ? candidates.filter(
        (candidate) =>
          candidate.name.toLowerCase().includes(normalized) ||
          (candidate.secondary?.toLowerCase().includes(normalized) ?? false) ||
          candidate.userId === userId,
      )
    : candidates;
  const plan = planCapabilityChange({ current: [], next: selection, actor, isFinancial });
  const canSubmit = Boolean(userId) && selection.length > 0 && plan.beyondActor.length === 0;

  function submit() {
    startTransition(async () => {
      const outcome = await addProjectMemberAction({
        projectId,
        userId,
        title: title.trim() || null,
        templateKey: matchingTemplateKey(templates, selection),
        capabilities: selection,
      });
      setResult(outcome);
      if (outcome.ok) onAdded();
    });
  }

  return (
    <Dialog open onOpenChange={(open) => (open ? null : onClose())}>
      <DialogContent className="sm:max-w-3xl" closeLabel={t('actions.close')}>
        <DialogHeader>
          <DialogTitle>{t('add.title')}</DialogTitle>
          <DialogDescription>{t('add.description')}</DialogDescription>
        </DialogHeader>
        <DialogBody className="flex flex-col gap-4">
          <ResultAlert result={result} />
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium" htmlFor="project-team-person">
                {t('add.personLabel')}
                <span className="ms-1 text-[var(--pf-action-danger)]" aria-hidden>
                  *
                </span>
              </label>
              {candidates.length > 8 ? (
                <Input
                  type="search"
                  value={query}
                  placeholder={t('add.searchPlaceholder')}
                  aria-label={t('add.searchPlaceholder')}
                  onChange={(event) => setQuery(event.target.value)}
                />
              ) : null}
              <Select value={userId} onValueChange={setUserId}>
                <SelectTrigger id="project-team-person">
                  <SelectValue placeholder={t('add.personPlaceholder')} />
                </SelectTrigger>
                <SelectContent>
                  {visible.map((candidate) => (
                    <SelectItem key={candidate.userId} value={candidate.userId}>
                      {candidate.secondary ? `${candidate.name} · ${candidate.secondary}` : candidate.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-[var(--pf-text-muted)]">{t('add.personHint')}</p>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium" htmlFor="project-team-title">
                {t('add.titleLabel')}
              </label>
              <Input
                id="project-team-title"
                value={title}
                maxLength={120}
                placeholder={t('add.titlePlaceholder')}
                onChange={(event) => setTitle(event.target.value)}
              />
            </div>
          </div>
          <CapabilityEditor
            templates={templates}
            selection={selection}
            onSelectionChange={(next) => {
              setSelection(next);
              setResult(null);
            }}
            actorCapabilities={actor}
            readOnly={false}
            blocked={result?.blockedCapabilities}
            originalSelection={[]}
          />
          {selection.length === 0 ? (
            <p className="text-xs text-[var(--pf-text-muted)]">{t('add.chooseCapabilities')}</p>
          ) : null}
        </DialogBody>
        <DialogFooter>
          <Button type="button" variant="secondary" onClick={onClose}>
            {t('actions.cancel')}
          </Button>
          <Button type="button" onClick={submit} disabled={!canSubmit} loading={pending}>
            {t('actions.add')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
