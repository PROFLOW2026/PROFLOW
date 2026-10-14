'use client';

import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/shared/ui/cn';
import { formatMentionToken } from '../domain/comment-mentions';
import { searchTaskMentionCandidatesAction } from '@/app/[locale]/(app)/work/actions';
import { CommentBodyDisplay } from './comment-body-display';

type MentionCandidate = {
  orgMemberId: string;
  displayName: string;
};

export function CommentMentionTextarea({
  taskId,
  name = 'body',
  placeholder,
  rows = 3,
  maxLength = 20_000,
  className,
  disabled,
  'aria-label': ariaLabel,
}: {
  taskId: string;
  name?: string;
  placeholder: string;
  rows?: number;
  maxLength?: number;
  className?: string;
  disabled?: boolean;
  'aria-label'?: string;
}) {
  const t = useTranslations('tasks.comments.mentions');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [body, setBody] = useState('');
  const [mentionLabels, setMentionLabels] = useState<Record<string, string>>({});
  const [query, setQuery] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<MentionCandidate[]>([]);
  const [highlightIndex, setHighlightIndex] = useState(0);
  const [searchPending, startSearch] = useTransition();

  const loadCandidates = useCallback(
    (term: string) => {
      startSearch(async () => {
        const rows = await searchTaskMentionCandidatesAction(taskId, term);
        setCandidates(
          rows.map((row) => ({
            orgMemberId: row.orgMemberId,
            displayName: row.displayName,
          })),
        );
        setHighlightIndex(0);
      });
    },
    [taskId],
  );

  useEffect(() => {
    if (query === null) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- clear mention suggestions when @ query closes
      setCandidates([]);
      return;
    }
    loadCandidates(query);
  }, [query, loadCandidates]);

  const detectMentionQuery = (value: string, caret: number) => {
    const before = value.slice(0, caret);
    const at = before.lastIndexOf('@');
    if (at < 0) {
      setQuery(null);
      return;
    }
    const slice = before.slice(at + 1);
    if (/\s/.test(slice) || slice.includes('[')) {
      setQuery(null);
      return;
    }
    setQuery(slice);
  };

  const insertMention = (candidate: MentionCandidate) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const caret = textarea.selectionStart ?? body.length;
    const before = body.slice(0, caret);
    const at = before.lastIndexOf('@');
    if (at < 0) return;

    const token = `${formatMentionToken(candidate.orgMemberId)} `;
    const nextBody = `${body.slice(0, at)}${token}${body.slice(caret)}`;
    setBody(nextBody);
    setMentionLabels((current) => ({
      ...current,
      [candidate.orgMemberId]: candidate.displayName,
    }));
    setQuery(null);
    setCandidates([]);

    requestAnimationFrame(() => {
      textarea.focus();
      const nextCaret = at + token.length;
      textarea.setSelectionRange(nextCaret, nextCaret);
    });
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (query === null || candidates.length === 0) return;

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setHighlightIndex((index) => (index + 1) % candidates.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setHighlightIndex((index) => (index - 1 + candidates.length) % candidates.length);
    } else if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      insertMention(candidates[highlightIndex]!);
    } else if (event.key === 'Escape') {
      setQuery(null);
      setCandidates([]);
    }
  };

  const showPreview = Object.keys(mentionLabels).length > 0 && body.includes('@[');

  return (
    <div className="relative flex flex-col gap-1.5">
      <input type="hidden" name={name} value={body} />
      <Textarea
        ref={textareaRef}
        value={body}
        placeholder={placeholder}
        rows={rows}
        maxLength={maxLength}
        className={cn('min-h-20', className)}
        aria-label={ariaLabel ?? placeholder}
        disabled={disabled}
        onChange={(event) => {
          const value = event.target.value;
          setBody(value);
          detectMentionQuery(value, event.target.selectionStart ?? value.length);
        }}
        onClick={(event) =>
          detectMentionQuery(
            event.currentTarget.value,
            event.currentTarget.selectionStart ?? event.currentTarget.value.length,
          )
        }
        onKeyUp={(event) =>
          detectMentionQuery(
            event.currentTarget.value,
            event.currentTarget.selectionStart ?? event.currentTarget.value.length,
          )
        }
        onKeyDown={onKeyDown}
      />

      {query !== null && candidates.length > 0 ? (
        <ul
          role="listbox"
          aria-label={t('pickerLabel')}
          className="absolute z-20 max-h-44 w-full overflow-y-auto rounded-md border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] py-1 shadow-md"
          style={{ top: '100%', marginTop: '0.25rem' }}
        >
          {candidates.map((candidate, index) => (
            <li key={candidate.orgMemberId} role="presentation">
              <button
                type="button"
                role="option"
                aria-selected={index === highlightIndex}
                className={cn(
                  'flex w-full px-3 py-2 text-start text-sm hover:bg-[var(--pf-bg-muted)]',
                  index === highlightIndex && 'bg-[var(--pf-bg-muted)]',
                )}
                onMouseDown={(event) => {
                  event.preventDefault();
                  insertMention(candidate);
                }}
              >
                {candidate.displayName}
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {query !== null && !searchPending && candidates.length === 0 ? (
        <p className="text-xs text-[var(--pf-text-muted)]">{t('noMatches')}</p>
      ) : null}

      {showPreview ? (
        <p className="text-xs text-[var(--pf-text-muted)]">
          <span className="me-1">{t('preview')}:</span>
          <CommentBodyDisplay body={body} mentionLabels={mentionLabels} />
        </p>
      ) : null}
    </div>
  );
}
