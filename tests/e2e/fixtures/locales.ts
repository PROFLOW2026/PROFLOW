import { readFileSync } from 'node:fs';
import path from 'node:path';
import type auth from '../../../src/locales/he-IL/auth.json';
import type billing from '../../../src/locales/he-IL/billing.json';
import type common from '../../../src/locales/he-IL/common.json';
import type dashboard from '../../../src/locales/he-IL/dashboard.json';
import type errors from '../../../src/locales/he-IL/errors.json';
import type expenses from '../../../src/locales/he-IL/expenses.json';
import type financial from '../../../src/locales/he-IL/financial.json';
import type nav from '../../../src/locales/he-IL/nav.json';
import type organization from '../../../src/locales/he-IL/organization.json';
import type projects from '../../../src/locales/he-IL/projects.json';
import type settings from '../../../src/locales/he-IL/settings.json';

function loadLocale<T>(name: string): T {
  const filePath = path.resolve(process.cwd(), 'src/locales/he-IL', `${name}.json`);
  return JSON.parse(readFileSync(filePath, 'utf8')) as T;
}

export const he = {
  auth: loadLocale<typeof auth>('auth'),
  billing: loadLocale<typeof billing>('billing'),
  common: loadLocale<typeof common>('common'),
  dashboard: loadLocale<typeof dashboard>('dashboard'),
  errors: loadLocale<typeof errors>('errors'),
  expenses: loadLocale<typeof expenses>('expenses'),
  financial: loadLocale<typeof financial>('financial'),
  nav: loadLocale<typeof nav>('nav'),
  organization: loadLocale<typeof organization>('organization'),
  projects: loadLocale<typeof projects>('projects'),
  settings: loadLocale<typeof settings>('settings'),
};
