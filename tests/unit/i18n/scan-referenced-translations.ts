import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import {
  APP_CLIENT_MESSAGE_NAMESPACES,
  MESSAGE_NAMESPACES,
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
  { pathPrefix: 'src/app/[locale]/(app)/contracts/', namespaces: ['contracts'] },
];

const FILE_NAMESPACE_ALLOW: Readonly<Record<string, readonly MessageNamespace[]>> = {
  'src/components/ui/password-input.tsx': ['auth'],
  'src/components/shell/unused-capability-dashboard-tip.tsx': ['settings'],
  'src/modules/projects/ui/project-scoped-access-panel.tsx': ['settings'],
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

function parseWithClientMessagesExtras(source: string): readonly string[] {
  if (!source.includes('WithClientMessages')) return [];
  const extras: string[] = [];
  const blockMatch = source.match(/WithClientMessages[\s\S]*?extra=\{?\[([\s\S]*?)\]\s*\}/);
  const block = blockMatch?.[1] ?? '';
  for (const match of block.matchAll(/['"]([a-zA-Z0-9_-]+)['"]/g)) {
    extras.push(match[1]!);
  }
  return extras;
}

function layoutExtrasForFile(relativePath: string): Set<string> {
  const available = new Set<string>(APP_CLIENT_MESSAGE_NAMESPACES as readonly string[]);
  let dir = dirname(relativePath).replace(/\\/g, '/');

  while (dir.startsWith('src')) {
    for (const fileName of ['layout.tsx', 'page.tsx'] as const) {
      const routeFilePath = join(process.cwd(), dir, fileName);
      if (existsSync(routeFilePath)) {
        for (const ns of parseWithClientMessagesExtras(readFileSync(routeFilePath, 'utf8'))) {
          available.add(ns);
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
  if (!fileSource.includes('WithClientMessages')) return false;
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
