/** One field shown in the business-change confirmation dialog. */
export interface BusinessChangeFieldDiff {
  readonly fieldLabel: string;
  readonly before: string;
  readonly after: string;
}

/** Optional impact line (monthly billing bucket, collections, etc.). */
export interface BusinessChangeImpactLine {
  readonly label: string;
  readonly detail: string;
}
