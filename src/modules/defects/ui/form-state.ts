/** Client-safe form state shared by the quality (inspections + defects) server actions. */
export interface QualityFormState {
  readonly error?: string;
  readonly fieldErrors?: Record<string, string>;
  /** Success message key result (already translated). */
  readonly success?: string;
  /** Bumps on every success so forms can reset. */
  readonly nonce?: number;
}

export const INITIAL_QUALITY_FORM_STATE: QualityFormState = {};
