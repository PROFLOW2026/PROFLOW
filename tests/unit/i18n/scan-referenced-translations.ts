import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import {
  APP_CLIENT_MESSAGE_NAMESPACES,
  AUTH_CLIENT_MESSAGE_NAMESPACES,
  CONTRACTOR_AUTH_CLIENT_MESSAGE_NAMESPACES,
  CONTRACTOR_PORTAL_CLIENT_MESSAGE_NAMESPACES,
  MARKETING_CLIENT_MESSAGE_NAMESPACES,
  MESSAGE_NAMESPACES,
  ONBOARDING_CLIENT_MESSAGE_NAMESPACES,
  ROOT_CLIENT_MESSAGE_NAMESPACES,
  type MessageNamespace,
} from '@/shared/i18n/config';
import { flattenLocaleCatalog, readLocaleCatalog } from '../shared/i18n-messages.test';

const SRC_DIR = join(process.cwd(), 'src');

/** Embedded modules always rendered inside a known WithClientMessages scope. */
const MODULE_PATH_NAMESPACE_ALLOW: ReadonlyArray<{
  readonly pathPrefix: string;
  readonly namespaces: readonly MessageNamespace[];
}> = [
  { pathPrefix: 'src/modules/marketing/', namespaces: ['marketing'] },
  { pathPrefix: 'src/modules/ap/', namespaces: ['ap'] },
  { pathPrefix: 'src/modules/banking/', namespaces: ['banking'] },
  { pathPrefix: 'src/modules/field/', namespaces: ['fieldOps'] },
  { pathPrefix: 'src/modules/field-ops/', namespaces: ['fieldOps'] },
  { pathPrefix: 'src/modules/imports/', namespaces: ['imports'] },
  { pathPrefix: 'src/modules/forms/', namespaces: ['forms'] },
  { pathPrefix: 'src/modules/month-close/', namespaces: ['monthClose'] },
  { pathPrefix: 'src/modules/quotes/', namespaces: ['quotes'] },
  { pathPrefix: 'src/modules/recurring-drafts/', namespaces: ['recurringDrafts'] },
  { pathPrefix: 'src/modules/crm/', namespaces: ['crm'] },
  { pathPrefix: 'src/modules/assets/', namespaces: ['assets'] },
  { pathPrefix: 'src/modules/invoicing-integration/ui/', namespaces: ['invoicingIntegration'] },
  { pathPrefix: 'src/modules/commercial/', namespaces: ['contracts'] },
  { pathPrefix: 'src/modules/procurement/', namespaces: ['procurement'] },
  { pathPrefix: 'src/app/[locale]/(app)/contracts/', namespaces: ['contracts'] },
  { pathPrefix: 'src/modules/collaboration/', namespaces: ['collaboration'] },
  { pathPrefix: 'src/modules/contractor-access/', namespaces: ['contractorAccess'] },
  { pathPrefix: 'src/modules/contractor-compliance/', namespaces: ['contractorCompliance'] },
  { pathPrefix: 'src/modules/contractor-closeout/', namespaces: ['handover'] },
  { pathPrefix: 'src/modules/contractor-procurement/ui/', namespaces: ['awards'] },
  { pathPrefix: 'src/modules/coordination/', namespaces: ['coordination'] },
  { pathPrefix: 'src/modules/defects/', namespaces: ['defects'] },
  { pathPrefix: 'src/modules/deliveries/', namespaces: ['deliveries'] },
  { pathPrefix: 'src/modules/evidence/', namespaces: ['projectPlans'] },
  { pathPrefix: 'src/modules/inspections/', namespaces: ['inspections'] },
  { pathPrefix: 'src/modules/project-plans/', namespaces: ['projectPlans'] },
  { pathPrefix: 'src/modules/project-profile/', namespaces: ['projectProfile'] },
  { pathPrefix: 'src/modules/project-team/', namespaces: ['projectTeam'] },
  { pathPrefix: 'src/modules/rfi/', namespaces: ['rfi'] },
  { pathPrefix: 'src/modules/safety/contractor/', namespaces: ['contractorCompliance'] },
  { pathPrefix: 'src/modules/subcontract-claims/', namespaces: ['subcontractClaims'] },
  { pathPrefix: 'src/modules/connected-projects/ui/', namespaces: ['connectedProjects', 'projectPlans', 'projects'] },
  { pathPrefix: 'src/modules/subcontracts/', namespaces: ['subcontracts'] },
  { pathPrefix: 'src/modules/submittals/', namespaces: ['submittals'] },
];

const FILE_NAMESPACE_ALLOW: Readonly<Record<string, readonly MessageNamespace[]>> = {
  'src/components/ui/password-input.tsx': ['auth'],
  'src/components/shell/unused-capability-dashboard-tip.tsx': ['settings'],
  'src/modules/projects/ui/project-scoped-access-panel.tsx': ['settings'],
  'src/modules/employee-app/ui/member-document-folder-grants-panel.tsx': ['settings'],
};

export interface ReferencedTranslation {
  readonly file: string;
  readonly rootNamespace: string;
  readonly catalogKey: string;
}

export interface TranslationCoverageReport {
  readonly missingHebrewKeys: readonly ReferencedTranslation[];
  readonly missingClientNamespaces: ReadonlyArray<{ file: string; namespace: string }>;
}

function walkSourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      walkSourceFiles(full, out);
    } else if (/\.(tsx|ts)$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

function isClientModule(source: string): boolean {
  return /^\s*['"]use client['"]\s*;?/m.test(source);
}

function resolveCatalogKey(namespaceArg: string, relativeKey: string): {
  rootNamespace: string;
  catalogKey: string;
} {
  const parts = namespaceArg.split('.');
  const rootNamespace = parts[0]!;
  const prefix = parts.slice(1).join('.');
  return {
    rootNamespace,
    catalogKey: prefix ? `${prefix}.${relativeKey}` : relativeKey,
  };
}

function splitFunctionChunks(source: string): string[] {
  const parts = source.split(/\n(?=(?:export\s+)?(?:async\s+)?function\s+\w+)/);
  return parts.length > 0 ? parts : [source];
}

function extractTranslatorDeclarations(source: string): Array<{ varName: string; namespace: string }> {
  const decls: Array<{ varName: string; namespace: string }> = [];
  const pattern =
    /const\s+(\w+)\s*=\s*(?:await\s+)?(?:useTranslations|getTranslations)\(\s*(?:\{[^}]*namespace:\s*['"]([^'"]+)['"][^}]*\}|['"]([^'"]+)['"])\s*\)/g;
  for (const match of source.matchAll(pattern)) {
    const namespace = match[2] ?? match[3];
    if (!namespace) continue;
    decls.push({ varName: match[1]!, namespace });
  }
  return decls;
}

function extractStaticTranslationKeys(source: string, varName: string): readonly string[] {
  const keys: string[] = [];
  const pattern = new RegExp(`\\b${varName}\\(\\s*['"]([^'"]+)['"]`, 'g');
  for (const match of source.matchAll(pattern)) {
    const key = match[1]!;
    if (key.includes('${') || key.endsWith('.')) continue;
    keys.push(key);
  }
  return keys;
}

function parseMessageWrapperExtras(source: string): readonly string[] {
  const extras: string[] = [];
  for (const tag of [
    'WithAppClientMessages',
    'WithPortalClientMessages',
    'WithClientMessages',
  ] as const) {
    if (!source.includes(tag)) continue;
    const extraMatch = source.match(
      new RegExp(`${tag}[\\s\\S]*?extra=\\{?\\[([\\s\\S]*?)\\]\\s*\\}`),
    );
    const block = extraMatch?.[1] ?? '';
    for (const match of block.matchAll(/['"]([a-zA-Z0-9_-]+)['"]/g)) {
      extras.push(match[1]!);
    }
    const nsMatch = source.match(
      new RegExp(`${tag}[\\s\\S]*?namespaces=\\{\\[\\.\\.\\.([A-Z_]+)\\]\\}`),
    );
    if (nsMatch?.[1] === 'AUTH_CLIENT_MESSAGE_NAMESPACES') {
      for (const ns of AUTH_CLIENT_MESSAGE_NAMESPACES) extras.push(ns);
    }
    if (nsMatch?.[1] === 'MARKETING_CLIENT_MESSAGE_NAMESPACES') {
      for (const ns of MARKETING_CLIENT_MESSAGE_NAMESPACES) extras.push(ns);
    }
    if (nsMatch?.[1] === 'ONBOARDING_CLIENT_MESSAGE_NAMESPACES') {
      for (const ns of ONBOARDING_CLIENT_MESSAGE_NAMESPACES) extras.push(ns);
    }
    if (nsMatch?.[1] === 'CONTRACTOR_AUTH_CLIENT_MESSAGE_NAMESPACES') {
      for (const ns of CONTRACTOR_AUTH_CLIENT_MESSAGE_NAMESPACES) extras.push(ns);
    }
  }
  return extras;
}

function routeGroupBaseNamespaces(relativePath: string): readonly string[] {
  const normalized = relativePath.replace(/\\/g, '/');
  if (normalized.includes('/modules/marketing/')) {
    return MARKETING_CLIENT_MESSAGE_NAMESPACES;
  }
  if (normalized.includes('/contractor/(portal)/') || normalized.includes('/modules/contractor-portal/')) {
    return CONTRACTOR_PORTAL_CLIENT_MESSAGE_NAMESPACES;
  }
  if (normalized.includes('/contractor/(auth)/')) {
    return CONTRACTOR_AUTH_CLIENT_MESSAGE_NAMESPACES;
  }
  if (normalized.includes('/(auth)/')) {
    return AUTH_CLIENT_MESSAGE_NAMESPACES;
  }
  if (normalized.includes('/onboarding/')) {
    return ONBOARDING_CLIENT_MESSAGE_NAMESPACES;
  }
  if (
    normalized.includes('/(app)/') ||
    normalized.includes('/employee/(shell)/') ||
    normalized.startsWith('src/modules/') ||
    normalized.startsWith('src/components/')
  ) {
    return APP_CLIENT_MESSAGE_NAMESPACES;
  }
  return ROOT_CLIENT_MESSAGE_NAMESPACES;
}

function layoutExtrasForFile(relativePath: string): Set<string> {
  const available = new Set<string>(routeGroupBaseNamespaces(relativePath) as readonly string[]);
  let dir = dirname(relativePath).replace(/\\/g, '/');

  while (dir.startsWith('src')) {
    for (const fileName of ['layout.tsx', 'page.tsx'] as const) {
      const routeFilePath = join(process.cwd(), dir, fileName);
      if (existsSync(routeFilePath)) {
        const source = readFileSync(routeFilePath, 'utf8');
        for (const ns of parseMessageWrapperExtras(source)) {
          available.add(ns);
        }
        if (source.includes('WithAppClientMessages') && !source.includes('extra=')) {
          for (const ns of APP_CLIENT_MESSAGE_NAMESPACES) available.add(ns);
        }
        if (source.includes('WithPortalClientMessages') && !source.includes('extra=')) {
          for (const ns of CONTRACTOR_PORTAL_CLIENT_MESSAGE_NAMESPACES) available.add(ns);
        }
      }
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  return available;
}

function fileProvidesClientNamespace(fileSource: string, rootNamespace: string): boolean {
  if (
    !fileSource.includes('WithClientMessages') &&
    !fileSource.includes('WithAppClientMessages') &&
    !fileSource.includes('WithPortalClientMessages')
  ) {
    return false;
  }
  return (
    fileSource.includes(`'${rootNamespace}'`) || fileSource.includes(`"${rootNamespace}"`)
  );
}

function moduleAllowsNamespace(relativePath: string, rootNamespace: string): boolean {
  const normalized = relativePath.replace(/\\/g, '/');
  for (const entry of MODULE_PATH_NAMESPACE_ALLOW) {
    if (!normalized.startsWith(entry.pathPrefix)) continue;
    if ((entry.namespaces as readonly string[]).includes(rootNamespace)) return true;
  }
  const fileAllow = FILE_NAMESPACE_ALLOW[normalized];
  if (fileAllow?.includes(rootNamespace as MessageNamespace)) return true;
  return false;
}

function clientNamespaceCovered(
  relativePath: string,
  rootNamespace: string,
  fileSource: string,
): boolean {
  if (layoutExtrasForFile(relativePath).has(rootNamespace)) return true;
  if (fileProvidesClientNamespace(fileSource, rootNamespace)) return true;
  if (moduleAllowsNamespace(relativePath, rootNamespace)) return true;
  return false;
}

export function collectReferencedClientTranslations(): ReferencedTranslation[] {
  const refs: ReferencedTranslation[] = [];
  const seen = new Set<string>();

  for (const absolutePath of walkSourceFiles(SRC_DIR)) {
    const source = readFileSync(absolutePath, 'utf8');
    if (!isClientModule(source) || !source.includes('useTranslations')) continue;

    const relativePath = relative(process.cwd(), absolutePath).replace(/\\/g, '/');

    for (const chunk of splitFunctionChunks(source)) {
      for (const decl of extractTranslatorDeclarations(chunk)) {
        for (const relativeKey of extractStaticTranslationKeys(chunk, decl.varName)) {
          const { rootNamespace, catalogKey } = resolveCatalogKey(decl.namespace, relativeKey);
          const dedupe = `${relativePath}::${rootNamespace}::${catalogKey}`;
          if (seen.has(dedupe)) continue;
          seen.add(dedupe);
          refs.push({ file: relativePath, rootNamespace, catalogKey });
        }
      }
    }
  }

  return refs;
}

export function analyzeTranslationCoverage(): TranslationCoverageReport {
  const hebrewByNamespace = new Map<string, Map<string, string>>();
  for (const namespace of MESSAGE_NAMESPACES) {
    hebrewByNamespace.set(namespace, flattenLocaleCatalog(readLocaleCatalog('he-IL', namespace)));
  }

  const missingHebrewKeys: ReferencedTranslation[] = [];
  const missingClientNamespaces: Array<{ file: string; namespace: string }> = [];
  const seenClientNamespaceChecks = new Set<string>();

  for (const ref of collectReferencedClientTranslations()) {
    const catalog = hebrewByNamespace.get(ref.rootNamespace);
    const value = catalog?.get(ref.catalogKey);
    if (!value || value.trim() === '') {
      missingHebrewKeys.push(ref);
    }

    const clientKey = `${ref.file}::${ref.rootNamespace}`;
    if (seenClientNamespaceChecks.has(clientKey)) continue;
    seenClientNamespaceChecks.add(clientKey);

    const fileSource = readFileSync(join(process.cwd(), ref.file), 'utf8');
    if (!clientNamespaceCovered(ref.file, ref.rootNamespace, fileSource)) {
      missingClientNamespaces.push({ file: ref.file, namespace: ref.rootNamespace });
    }
  }

  return { missingHebrewKeys, missingClientNamespaces };
}

/** Deterministic guard: removing a referenced Hebrew key should fail CI. */
export function assertReferencedHebrewTranslationExists(
  rootNamespace: string,
  catalogKey: string,
): boolean {
  const catalog = flattenLocaleCatalog(readLocaleCatalog('he-IL', rootNamespace));
  const value = catalog.get(catalogKey);
  return Boolean(value && value.trim() !== '');
}

export function assertClientNamespaceShipped(rootNamespace: string): boolean {
  return (APP_CLIENT_MESSAGE_NAMESPACES as readonly string[]).includes(rootNamespace);
}

export function sourceTreeExists(): boolean {
  return existsSync(SRC_DIR);
}

export function clientNamespacesAvailableForFile(relativePath: string): readonly string[] {
  return [...layoutExtrasForFile(relativePath)];
}
