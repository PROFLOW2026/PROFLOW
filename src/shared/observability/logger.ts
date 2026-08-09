/**
 * Application logging (docs 69 §6, 71 observability).
 *
 * AuditEvent is the domain audit trail; this logger is operational only.
 * Secrets and common PII shapes are redacted before anything reaches stdout.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const SECRET_KEY_PATTERN =
  /pass(word)?|secret|token|api[_-]?key|authorization|cookie|service[_-]?role|private[_-]?key|database[_-]?url|connection[_-]?string|jwt|bearer/i;

const EMAIL_PATTERN = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;

const REDACTED = '[redacted]';

function resolveLevel(): LogLevel {
  const raw = process.env.LOG_LEVEL?.trim().toLowerCase();
  if (raw === 'debug' || raw === 'info' || raw === 'warn' || raw === 'error') return raw;
  return 'info';
}

/** Masks an email while keeping enough shape for support triage. */
export function redactEmail(value: string): string {
  const at = value.indexOf('@');
  if (at <= 0) return REDACTED;
  const local = value.slice(0, at);
  const domain = value.slice(at + 1);
  const visible = local.slice(0, Math.min(1, local.length));
  return `${visible}***@${domain || 'redacted'}`;
}

export function redactForLog(value: unknown, depth = 0): unknown {
  if (depth > 6) return REDACTED;
  if (value === null || value === undefined) return value ?? null;
  if (typeof value === 'string') {
    return value.replace(EMAIL_PATTERN, (match) => redactEmail(match));
  }
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (value instanceof Error) {
    return {
      name: value.name,
      message: redactForLog(value.message, depth + 1),
    };
  }
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map((item) => redactForLog(item, depth + 1));
  if (typeof value !== 'object') return String(value);

  const result: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    result[key] = SECRET_KEY_PATTERN.test(key) ? REDACTED : redactForLog(entry, depth + 1);
  }
  return result;
}

function write(level: LogLevel, event: string, fields?: Record<string, unknown>): void {
  if (LEVEL_ORDER[level] < LEVEL_ORDER[resolveLevel()]) return;

  const line = JSON.stringify({
    level,
    event,
    ts: new Date().toISOString(),
    ...(fields ? (redactForLog(fields) as Record<string, unknown>) : {}),
  });

  if (level === 'error') {
    console.error(line);
    return;
  }
  if (level === 'warn') {
    console.warn(line);
    return;
  }
  console.info(line);
}

export interface Logger {
  debug(event: string, fields?: Record<string, unknown>): void;
  info(event: string, fields?: Record<string, unknown>): void;
  warn(event: string, fields?: Record<string, unknown>): void;
  error(event: string, fields?: Record<string, unknown>): void;
}

export const logger: Logger = {
  debug: (event, fields) => write('debug', event, fields),
  info: (event, fields) => write('info', event, fields),
  warn: (event, fields) => write('warn', event, fields),
  error: (event, fields) => write('error', event, fields),
};
