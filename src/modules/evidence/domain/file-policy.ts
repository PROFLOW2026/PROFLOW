import type { EvidenceKind } from './types';

/**
 * Evidence upload policy: exact MIME allow-list (no prefix matching), per-kind size limits,
 * extension <-> MIME consistency, content sniffing, and provider-safe file names.
 * Pure - shared by internal and contractor uploads, client and server.
 */

const MB = 1024 * 1024;

export const EVIDENCE_SIZE_LIMITS: Readonly<Record<EvidenceKind, number>> = {
  photo: 25 * MB,
  video: 200 * MB,
  document: 25 * MB,
};

interface MimeRule {
  readonly kind: EvidenceKind;
  readonly extensions: readonly string[];
}

const MIME_RULES: Readonly<Record<string, MimeRule>> = {
  'image/jpeg': { kind: 'photo', extensions: ['jpg', 'jpeg', 'jfif'] },
  'image/png': { kind: 'photo', extensions: ['png'] },
  'image/webp': { kind: 'photo', extensions: ['webp'] },
  'image/gif': { kind: 'photo', extensions: ['gif'] },
  'image/heic': { kind: 'photo', extensions: ['heic'] },
  'image/heif': { kind: 'photo', extensions: ['heif'] },
  'video/mp4': { kind: 'video', extensions: ['mp4', 'm4v'] },
  'video/quicktime': { kind: 'video', extensions: ['mov', 'qt'] },
  'video/webm': { kind: 'video', extensions: ['webm'] },
  'video/3gpp': { kind: 'video', extensions: ['3gp'] },
  'application/pdf': { kind: 'document', extensions: ['pdf'] },
  'application/msword': { kind: 'document', extensions: ['doc'] },
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': {
    kind: 'document',
    extensions: ['docx'],
  },
  'application/vnd.ms-excel': { kind: 'document', extensions: ['xls'] },
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': {
    kind: 'document',
    extensions: ['xlsx'],
  },
  'application/vnd.ms-powerpoint': { kind: 'document', extensions: ['ppt'] },
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': {
    kind: 'document',
    extensions: ['pptx'],
  },
};

const MIME_ALIASES: Readonly<Record<string, string>> = {
  'image/jpg': 'image/jpeg',
  'image/pjpeg': 'image/jpeg',
  'image/x-png': 'image/png',
  'video/x-m4v': 'video/mp4',
};

const GENERIC_MIMES = new Set(['', 'application/octet-stream', 'binary/octet-stream', 'application/x-download']);

const EXTENSION_TO_MIME: ReadonlyMap<string, string> = new Map(
  Object.entries(MIME_RULES).flatMap(([mime, rule]) => rule.extensions.map((ext) => [ext, mime] as const)),
);

export const EVIDENCE_ALLOWED_MIME_TYPES: readonly string[] = Object.keys(MIME_RULES);

/** `accept` attribute for a file input restricted to the given kinds. */
export function evidenceAcceptAttribute(kinds: readonly EvidenceKind[]): string {
  const wanted = new Set(kinds);
  const parts: string[] = [];
  for (const [mime, rule] of Object.entries(MIME_RULES)) {
    if (!wanted.has(rule.kind)) continue;
    parts.push(mime, ...rule.extensions.map((ext) => `.${ext}`));
  }
  return parts.join(',');
}

function extensionOf(fileName: string): string {
  return fileName.trim().toLowerCase().match(/\.([a-z0-9]{1,8})$/)?.[1] ?? '';
}

export function evidenceKindForMime(mimeType: string): EvidenceKind | null {
  return MIME_RULES[mimeType]?.kind ?? null;
}

const MAX_FILE_NAME_LENGTH = 120;
// Windows-reserved device names are rejected by OneDrive / SharePoint.
const RESERVED_BASENAMES = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])$/i;

/**
 * Provider-safe display name: strips any path, control and reserved characters, collapses
 * whitespace, caps length (keeping the extension), and forces the canonical extension of the MIME.
 */
export function sanitizeEvidenceFileName(rawName: string, mimeType: string): string {
  const rule = MIME_RULES[mimeType];
  const lastSegment = rawName.split(/[\\/]/).pop() ?? '';
  const cleaned = lastSegment
    .normalize('NFC')
    .replace(/[\u0000-\u001f\u007f<>:"|?*]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+/, '')
    .replace(/[. ]+$/, '');
  const extension = extensionOf(cleaned);
  const keepsExtension = Boolean(rule && rule.extensions.includes(extension));
  let base = keepsExtension ? cleaned.slice(0, cleaned.length - extension.length - 1) : cleaned;
  base = base.replace(/[. ]+$/, '').trim();
  if (!base || RESERVED_BASENAMES.test(base)) base = rule?.kind ?? 'file';
  const finalExtension = keepsExtension ? extension : (rule?.extensions[0] ?? 'bin');
  const maxBase = MAX_FILE_NAME_LENGTH - finalExtension.length - 1;
  if (base.length > maxBase) base = base.slice(0, maxBase).trim();
  return `${base}.${finalExtension}`;
}

export type EvidenceFileRejection = 'mime' | 'extension' | 'empty' | 'too_large' | 'kind_not_accepted';

export type EvidenceFileCheck =
  | {
      readonly ok: true;
      readonly mimeType: string;
      readonly kind: EvidenceKind;
      readonly fileName: string;
      readonly maxBytes: number;
    }
  | { readonly ok: false; readonly reason: EvidenceFileRejection; readonly maxBytes?: number };

/**
 * Validates a declared file before any bytes move. The browser-reported type wins when specific;
 * a generic/empty type is inferred from the extension. A specific type whose extension belongs to a
 * different allowed type (e.g. `photo.pdf` declared as image/jpeg) is rejected.
 */
export function checkEvidenceFile(input: {
  readonly fileName: string;
  readonly mimeType: string | null | undefined;
  readonly sizeBytes: number;
  readonly accept?: readonly EvidenceKind[];
}): EvidenceFileCheck {
  const reported = (input.mimeType ?? '').trim().toLowerCase();
  const aliased = MIME_ALIASES[reported] ?? reported;
  const extension = extensionOf(input.fileName);

  let mimeType: string;
  if (GENERIC_MIMES.has(aliased)) {
    const inferred = EXTENSION_TO_MIME.get(extension);
    if (!inferred) return { ok: false, reason: 'mime' };
    mimeType = inferred;
  } else {
    if (!MIME_RULES[aliased]) return { ok: false, reason: 'mime' };
    mimeType = aliased;
    const byExtension = EXTENSION_TO_MIME.get(extension);
    if (byExtension && MIME_RULES[byExtension]!.kind !== MIME_RULES[aliased]!.kind) {
      return { ok: false, reason: 'extension' };
    }
  }

  const kind = MIME_RULES[mimeType]!.kind;
  if (input.accept && input.accept.length > 0 && !input.accept.includes(kind)) {
    return { ok: false, reason: 'kind_not_accepted' };
  }
  const maxBytes = EVIDENCE_SIZE_LIMITS[kind];
  if (!Number.isFinite(input.sizeBytes) || input.sizeBytes <= 0) return { ok: false, reason: 'empty' };
  if (input.sizeBytes > maxBytes) return { ok: false, reason: 'too_large', maxBytes };
  return { ok: true, mimeType, kind, fileName: sanitizeEvidenceFileName(input.fileName, mimeType), maxBytes };
}

function startsWith(bytes: Uint8Array, signature: readonly number[], offset = 0): boolean {
  if (bytes.length < offset + signature.length) return false;
  return signature.every((value, index) => bytes[offset + index] === value);
}

function asciiAt(bytes: Uint8Array, offset: number, text: string): boolean {
  return startsWith(
    bytes,
    [...text].map((char) => char.charCodeAt(0)),
    offset,
  );
}

const ZIP = [0x50, 0x4b, 0x03, 0x04];
const OLE = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];

/**
 * Magic-byte check of the first bytes against the declared MIME, so a renamed executable or HTML
 * file is never stored as "evidence". Container formats are checked at the container level.
 */
export function contentMatchesMime(head: Uint8Array, mimeType: string): boolean {
  switch (mimeType) {
    case 'image/jpeg':
      return startsWith(head, [0xff, 0xd8, 0xff]);
    case 'image/png':
      return startsWith(head, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    case 'image/gif':
      return asciiAt(head, 0, 'GIF87a') || asciiAt(head, 0, 'GIF89a');
    case 'image/webp':
      return asciiAt(head, 0, 'RIFF') && asciiAt(head, 8, 'WEBP');
    case 'image/heic':
    case 'image/heif':
    case 'video/mp4':
    case 'video/quicktime':
    case 'video/3gpp':
      return asciiAt(head, 4, 'ftyp') || (mimeType === 'video/quicktime' && (asciiAt(head, 4, 'moov') || asciiAt(head, 4, 'wide') || asciiAt(head, 4, 'mdat')));
    case 'video/webm':
      return startsWith(head, [0x1a, 0x45, 0xdf, 0xa3]);
    case 'application/pdf':
      return asciiAt(head, 0, '%PDF-');
    case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
    case 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':
    case 'application/vnd.openxmlformats-officedocument.presentationml.presentation':
      return startsWith(head, ZIP);
    case 'application/msword':
    case 'application/vnd.ms-excel':
    case 'application/vnd.ms-powerpoint':
      return startsWith(head, OLE);
    default:
      return false;
  }
}

export function isInlineImageMime(mimeType: string): boolean {
  return mimeType === 'image/jpeg' || mimeType === 'image/png' || mimeType === 'image/webp' || mimeType === 'image/gif';
}

export function isInlineVideoMime(mimeType: string): boolean {
  return mimeType === 'video/mp4' || mimeType === 'video/webm' || mimeType === 'video/quicktime';
}
