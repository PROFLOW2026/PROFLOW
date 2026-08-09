import 'server-only';

/**
 * Outbound email boundary (docs 71 §9, 75).
 *
 * Modules depend on this interface, never on Resend. That keeps the provider
 * swappable and, more importantly, lets every test and every un-configured
 * environment run the full flow without sending real mail.
 */

export interface EmailMessage {
  to: string;
  subject: string;
  /** Plain-text body. Required — an HTML-only email is not acceptable. */
  text: string;
  html?: string;
  replyTo?: string;
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
    if (process.env.NODE_ENV !== 'production') {
      console.info(`[email:noop] would send "${message.subject}" to ${message.to}`);
    }
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
      const { data, error } = await client.emails.send({
        from: this.from,
        to: message.to,
        subject: message.subject,
        text: message.text,
        ...(message.html ? { html: message.html } : {}),
        ...(message.replyTo ? { replyTo: message.replyTo } : {}),
      });

      if (error) return { delivered: false, reason: 'failed', message: error.message };
      return { delivered: true, providerId: data?.id ?? null };
    } catch (error) {
      // Email is never allowed to fail a business transaction (doc 75 §4).
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

  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  instance = apiKey && from ? new ResendEmailAdapter(apiKey, from) : new NoopEmailAdapter();
  return instance;
}

/** Test seam — lets integration tests assert on what would have been sent. */
export function setEmailPort(port: EmailPort | undefined): void {
  instance = port;
}
