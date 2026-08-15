import 'server-only';
import { serverEnv } from '@/shared/env/server';
import { logger, redactEmail } from '@/shared/observability';

/**
 * Outbound email boundary (docs 71 §9, 75).
 *
 * Modules depend on this interface, never on Resend. That keeps the provider
 * swappable and, more importantly, lets every test and every un-configured
 * environment run the full flow without sending real mail.
 *
 * `EMAIL_DRIVER=console` always uses the no-op adapter, even if a Resend key
 * is present — preview/local must not accidentally send.
 */

export interface EmailAttachment {
  filename: string;
  contentType: string;
  bytes: Uint8Array;
}

export interface EmailMessage {
  to: string;
  subject: string;
  /** Plain-text body. Required — an HTML-only email is not acceptable. */
  text: string;
  html?: string;
  replyTo?: string;
  /** Optional file attachments (PDF report packs). Console driver ignores these. */
  attachments?: readonly EmailAttachment[];
}

/** Maps optional attachments for a provider. Empty input yields undefined (omit the field). */
export function toProviderAttachments(
  attachments: EmailMessage['attachments'],
): { filename: string; content: Buffer; contentType: string }[] | undefined {
  if (!attachments?.length) return undefined;
  return attachments.map((item) => ({
    filename: item.filename,
    content: Buffer.from(item.bytes),
    contentType: item.contentType,
  }));
}

export type EmailResult =
  | { delivered: true; providerId: string | null }
  /** Not an error: the caller is expected to offer a manual fallback such as a copyable link. */
  | { delivered: false; reason: 'not-configured' | 'failed'; message?: string };

export interface EmailPort {
  send(message: EmailMessage): Promise<EmailResult>;
  readonly configured: boolean;
}

class NoopEmailAdapter implements EmailPort {
  readonly configured = false;

  async send(message: EmailMessage): Promise<EmailResult> {
    logger.info('email.noop', {
      subject: message.subject,
      to: redactEmail(message.to),
      attachmentCount: message.attachments?.length ?? 0,
    });
    return { delivered: false, reason: 'not-configured' };
  }
}

class ResendEmailAdapter implements EmailPort {
  readonly configured = true;

  constructor(
    private readonly apiKey: string,
    private readonly from: string,
  ) {}

  async send(message: EmailMessage): Promise<EmailResult> {
    try {
      const { Resend } = await import('resend');
      const client = new Resend(this.apiKey);
      const attachments = toProviderAttachments(message.attachments);
      const { data, error } = await client.emails.send({
        from: this.from,
        to: message.to,
        subject: message.subject,
        text: message.text,
        ...(message.html ? { html: message.html } : {}),
        ...(message.replyTo ? { replyTo: message.replyTo } : {}),
        ...(attachments ? { attachments } : {}),
      });

      if (error) return { delivered: false, reason: 'failed', message: error.message };
      return { delivered: true, providerId: data?.id ?? null };
    } catch (error) {
      // Email is never allowed to fail a business transaction (doc 75 §4).
      logger.error('email.send_failed', {
        to: redactEmail(message.to),
        error,
      });
      return {
        delivered: false,
        reason: 'failed',
        message: error instanceof Error ? error.message : 'unknown error',
      };
    }
  }
}

let instance: EmailPort | undefined;

export function getEmailPort(): EmailPort {
  if (instance) return instance;

  const env = serverEnv();
  instance =
    env.EMAIL_DRIVER === 'resend' && env.RESEND_API_KEY && env.EMAIL_FROM
      ? new ResendEmailAdapter(env.RESEND_API_KEY, env.EMAIL_FROM)
      : new NoopEmailAdapter();
  return instance;
}

/** Test seam — lets integration tests assert on what would have been sent. */
export function setEmailPort(port: EmailPort | undefined): void {
  instance = port;
}
