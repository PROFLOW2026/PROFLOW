export interface ProjectCreateTeamPickerOption {
  readonly key: string;
  readonly displayName: string;
  readonly jobTitle: string | null;
  readonly kind: 'employee' | 'org_member';
}

export interface ProjectCreateTeamInput {
  readonly projectManagerKey?: string | null;
  readonly participantKeys?: readonly string[];
}
