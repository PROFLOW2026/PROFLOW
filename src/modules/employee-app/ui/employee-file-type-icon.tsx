import { createElement } from 'react';
import {
  File,
  FileArchive,
  FileImage,
  FileSpreadsheet,
  FileText,
  FileType2,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/shared/ui/cn';
import { employeeIconTileMutedClass } from './employee-surface-styles';

function resolveFileIcon(mimeType: string | null | undefined, filename: string): LucideIcon {
  const mime = (mimeType ?? '').toLowerCase();
  const ext = filename.includes('.') ? filename.slice(filename.lastIndexOf('.') + 1).toLowerCase() : '';

  if (mime.startsWith('image/') || ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext)) {
    return FileImage;
  }
  if (
    mime.includes('spreadsheet') ||
    mime.includes('excel') ||
    ['xls', 'xlsx', 'csv'].includes(ext)
  ) {
    return FileSpreadsheet;
  }
  if (mime.includes('pdf') || ext === 'pdf') {
    return FileType2;
  }
  if (
    mime.includes('zip') ||
    mime.includes('compressed') ||
    ['zip', 'rar', '7z'].includes(ext)
  ) {
    return FileArchive;
  }
  if (
    mime.startsWith('text/') ||
    mime.includes('word') ||
    mime.includes('document') ||
    ['doc', 'docx', 'txt', 'rtf', 'md'].includes(ext)
  ) {
    return FileText;
  }
  return File;
}

export function EmployeeFileTypeIcon({
  mimeType,
  filename,
  className,
}: {
  readonly mimeType?: string | null;
  readonly filename: string;
  readonly className?: string;
}) {
  return (
    <span className={cn(employeeIconTileMutedClass, className)} aria-hidden>
      {createElement(resolveFileIcon(mimeType, filename), { className: 'size-4' })}
    </span>
  );
}
