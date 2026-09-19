'use client';

/**
 * Client components for task comments:
 *   - CommentFormClient: add-comment form with optimistic state + useActionState
 *   - CommentActionsClient: edit / delete actions for own comments
 */

import { useActionState, useRef, useState } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import type { TaskActionState } from './actions';

// ─── Add Comment Form ──────────────────────────────────────────────────────────

export function CommentFormClient({
  taskId,
  action,
  placeholderText,
  submitLabel,
}: {
  taskId: string;
  action: (prev: TaskActionState, formData: FormData) => Promise<TaskActionState>;
  placeholderText: string;
  submitLabel: string;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, pending] = useActionState(action, {} as TaskActionState);

  // Reset textarea after successful submit.
  const handleAction = (formData: FormData) => {
    formAction(formData);
    // The form will reset via the key trick below after state.ok
  };

  return (
    <form
      ref={formRef}
      action={handleAction}
      key={state.ok ? 'reset' : 'idle'}
      className="flex flex-col gap-2"
    >
      <input type="hidden" name="taskId" value={taskId} />
      <Textarea
        name="body"
        placeholder={placeholderText}
        rows={3}
        required
        maxLength={20_000}
        className="min-h-20"
        aria-label={placeholderText}
      />
      <div className="flex items-center justify-end gap-2">
        <Button type="submit" size="sm" loading={pending}>
          {submitLabel}
        </Button>
      </div>
      {state.error ? (
        <Alert tone="danger" role="alert">
          {state.error}
        </Alert>
      ) : null}
    </form>
  );
}

// ─── Comment Actions (Edit / Delete) ──────────────────────────────────────────

export function CommentActionsClient({
  commentId,
  taskId,
  currentBody,
  editAction,
  deleteAction,
  labelEdit,
  labelDelete,
  labelSave,
  labelCancel,
}: {
  commentId: string;
  taskId: string;
  currentBody: string;
  editAction: (prev: TaskActionState, formData: FormData) => Promise<TaskActionState>;
  deleteAction: (prev: TaskActionState, formData: FormData) => Promise<TaskActionState>;
  labelEdit: string;
  labelDelete: string;
  labelSave: string;
  labelCancel: string;
}) {
  const [mode, setMode] = useState<'view' | 'edit'>('view');
  const [editState, editFormAction, editPending] = useActionState(
    editAction,
    {} as TaskActionState,
  );
  const [deleteState, deleteFormAction, deletePending] = useActionState(
    deleteAction,
    {} as TaskActionState,
  );

  if (mode === 'edit') {
    return (
      <form
        action={(fd) => {
          editFormAction(fd);
          setMode('view');
        }}
        className="w-full flex flex-col gap-2 mt-1"
      >
        <input type="hidden" name="taskId" value={taskId} />
        <input type="hidden" name="commentId" value={commentId} />
        <Textarea
          name="body"
          defaultValue={currentBody}
          rows={3}
          required
          maxLength={20_000}
          className="min-h-20"
          autoFocus
        />
        <div className="flex gap-2">
          <Button type="submit" size="sm" loading={editPending}>
            {labelSave}
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => setMode('view')}
          >
            {labelCancel}
          </Button>
        </div>
        {editState.error ? (
          <Alert tone="danger" role="alert">
            {editState.error}
          </Alert>
        ) : null}
      </form>
    );
  }

  return (
    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
      <Button
        type="button"
        variant="ghost"
        size="iconSm"
        onClick={() => setMode('edit')}
        aria-label={labelEdit}
        title={labelEdit}
      >
        <Pencil aria-hidden />
      </Button>

      <form action={deleteFormAction}>
        <input type="hidden" name="taskId" value={taskId} />
        <input type="hidden" name="commentId" value={commentId} />
        <Button
          type="submit"
          variant="ghost"
          size="iconSm"
          loading={deletePending}
          aria-label={labelDelete}
          title={labelDelete}
          className="text-[var(--pf-action-danger)] hover:text-[var(--pf-action-danger)]"
        >
          <Trash2 aria-hidden />
        </Button>
      </form>

      {deleteState.error ? (
        <Alert tone="danger" role="alert" className="text-xs">
          {deleteState.error}
        </Alert>
      ) : null}
    </div>
  );
}
