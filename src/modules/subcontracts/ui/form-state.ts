export interface SubcontractFormState {
  readonly error?: string;
  readonly fieldErrors?: Record<string, string>;
  readonly success?: boolean;
  readonly createdId?: string;
}

export const INITIAL_FORM_STATE: SubcontractFormState = {};
