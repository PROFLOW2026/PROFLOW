'use client';

import { segmentCommentBody } from '../domain/comment-mentions';

export function CommentBodyDisplay({
  body,
  mentionLabels = {},
  className,
}: {
  body: string;
  mentionLabels?: Readonly<Record<string, string>>;
  className?: string;
}) {
  const segments = segmentCommentBody(body, mentionLabels);
  if (segments.length === 0) return null;

  return (
    <span className={className}>
      {segments.map((segment, index) =>
        segment.type === 'text' ? (
          <span key={`t-${index}`}>{segment.value}</span>
        ) : (
          <span
            key={`m-${segment.orgMemberId}-${index}`}
            className="font-medium text-[var(--pf-text-brand)]"
          >
            @{segment.label === '@' ? '…' : segment.label}
          </span>
        ),
      )}
    </span>
  );
}
