import { type DemoRoleKey } from './demo-org';

export type { DemoRoleKey };

export const DEMO_ROLE_CHOICES: ReadonlyArray<{ readonly key: DemoRoleKey; readonly label: string }> = [
  { key: 'owner', label: 'בעלים' },
  { key: 'manager', label: 'מנהל' },
  { key: 'finance', label: 'כספים' },
  { key: 'employee', label: 'עובד משרד' },
  { key: 'worker', label: 'עובד שטח' },
  { key: 'contractor', label: 'קבלן משנה' },
];

export function demoRoleHome(role: DemoRoleKey): '/' | '/employee' | '/contractor' {
  if (role === 'owner') return '/';
  if (role === 'contractor') return '/contractor';
  return '/employee';
}