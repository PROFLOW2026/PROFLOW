'use client';

/**
 * Client component for task approval gate interactions:
 *   - "request" mode: submit a new approval request
 *   - "decide" mode: approve or reject an open request
 */

import { useActionState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  requestTaskApprovalAction,
  decideTaskApprovalAction,
  type TaskActionState,
} from './actions';

interface ApprovalGateRequestProps {
  taskId: string;
  mode: 'request';
  requestLabel: string;
}

interface ApprovalGateDecideProps {
  taskId: string;
  requestId: string;
  mode: 'decide';
  approveLabel: string;
  rejectLabel: string;
  decisionNotePlaceholder: string;
}

type ApprovalGateClientProps = ApprovalGateRequestProps | ApprovalGateDecideProps;

export function ApprovalGateClient(props: ApprovalGateClientProps) {
  if (props.mode === 'request') {
    return <RequestApprovalForm taskId={props.taskId} requestLabel={props.requestLabel} />;
  }
  return (
    <DecideApprovalForm
      taskId={props.taskId}
      requestId={props.requestId}
      approveLabel={props.approveLabel}
      rejectLabel={props.rejectLabel}
      decisionNotePlaceholder={props.decisionNotePlaceholder}
    />
  );
}

// ─── Request Form ──────────────────────────────────────────────────────────────

function RequestApprovalForm({
  taskId,
  requestLabel,
}: {
  taskId: string;
  requestLabel: string;
}) {
  const [state, formAction, pending] = useActionState(
    requestTaskApprovalAction,
    {} as TaskActionState,
  );

  return (
    <form action={formAction}>
      <input type="hidden" name="taskId" value={taskId} />
      <Button type="submit" size="sm" loading={pending}>
        {requestLabel}
      </Button>
      {state.error ? (
        <Alert tone="danger" role="alert" className="mt-2">
          {state.error}
        </Alert>
      ) : null}
      {state.ok ? (
        <Alert tone="success" role="status" className="mt-2">
          Submitted for approval
        </Alert>
      ) : null}
    </form>
  );
}

// ─── Decide Form ───────────────────────────────────────────────────────────────

function DecideApprovalForm({
  taskId,
  requestId,
  approveLabel,
  rejectLabel,
  decisionNotePlaceholder,
}: {
  taskId: string;
  requestId: string;
  approveLabel: string;
  rejectLabel: string;
  decisionNotePlaceholder: string;
}) {
  const [state, formAction, pending] = useActionState(
    decideTaskApprovalAction,
    {} as TaskActionState,
  );

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="taskId" value={taskId} />
      <input type="hidden" name="requestId" value={requestId} />
      <Textarea
        name="decisionNote"
        placeholder={decisionNotePlaceholder}
        rows={2}
        className="min-h-11"
      />
      <div className="flex flex-wrap gap-2">
        <Button
          type="submit"
          name="decision"
          value="approved"
          size="sm"
          loading={pending}
          className="min-h-11 flex-1 sm:flex-none"
        >
          {approveLabel}
        </Button>
        <Button
          type="submit"
          name="decision"
          value="rejected"
          variant="secondary"
          size="sm"
          disabled={pending}
          className="min-h-11 flex-1 sm:flex-none"
        >
          {rejectLabel}
        </Button>
      </div>
      {state.error ? (
        <Alert tone="danger" role="alert">
          {state.error}
        </Alert>
      ) : null}
      {state.ok ? (
        <Alert tone="success" role="status">
          Decision recorded
        </Alert>
      ) : null}
    </form>
  );
}
