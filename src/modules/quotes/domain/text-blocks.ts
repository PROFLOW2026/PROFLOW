/** Max body length for quote text blocks (plain text, security ceiling — not a UX cap). */
export const QUOTE_TEXT_BLOCK_BODY_MAX = 512_000;

export interface QuoteDefaultTextBlockRecord {
  readonly id: string;
  readonly organizationId: string;
  readonly title: string;
  readonly body: string;
  readonly enabled: boolean;
  readonly sortOrder: number;
  readonly legacyKey: string | null;
}

export interface EstimateTextBlockRecord {
  readonly id: string;
  readonly organizationId: string;
  readonly estimateId: string;
  readonly title: string;
  readonly body: string;
  readonly enabled: boolean;
  readonly sortOrder: number;
  readonly sourceDefaultBlockId: string | null;
}

export interface QuoteTextBlockInput {
  readonly title: string;
  readonly body: string;
  readonly enabled: boolean;
  readonly sortOrder: number;
}
