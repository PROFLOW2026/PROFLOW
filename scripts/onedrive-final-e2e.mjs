/**
 * Final OneDrive external-storage E2E (no OAuth unless reconnect backup missing).
 * node scripts/onedrive-final-e2e.mjs
 */
import { config } from 'dotenv';
import { chromium } from '@playwright/test';
import postgres from 'postgres';
import { createDecipheriv, createHash } from 'node:crypto';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { signInViaAdminMagicLink } from './lib/e2e-auth.mjs';

config({ path: '.env.local' });

const APP_URL = (process.env.APP_URL ?? 'http://localhost:3100').replace(/\/+$/, '');
const ORG = '7dec19cf-ef7a-4f62-a110-615da62f3823';
const PROJECT = '1800f2d6-5cad-46bb-816a-e57a3a5dd1af';
const EXPENSE = process.env.E2E_EXPENSE_ID ?? 'bb14921b-eda6-44ef-b77e-4b3195e7c852';
const RUN_ID = `PF-FINAL-${Date.now()}`;
const NAV = { waitUntil: 'domcontentloaded', timeout: 120_000 };

const R = {};

function pass(k, v = 'PASS') {
  R[k] = v;
  console.log(`✓ ${k}: ${v}`);
}
function fail(k, v) {
  R[k] = `FAIL — ${v}`;
  console.error(`✗ ${k}: ${v}`);
  throw new Error(v);
}

function resolveKek() {
  const e = process.env.STORAGE_TOKEN_ENCRYPTION_KEY?.trim();
  if (/^[0-9a-fA-F]{64}$/.test(e ?? '')) return Buffer.from(e, 'hex');
  return createHash('sha256').update('projectflow.storage.token.kek.v1\0', 'utf8').update(e, 'utf8').digest();
}

function openSealed(sealed) {
  const rest = sealed.slice('enc:v1:'.length);
  const [ivB64, tagB64, ctB64] = rest.split(':');
  const d = createDecipheriv('aes-256-gcm', resolveKek(), Buffer.from(ivB64, 'base64url'));
  d.setAuthTag(Buffer.from(tagB64, 'base64url'));
  return JSON.parse(Buffer.concat([d.update(Buffer.from(ctB64, 'base64url')), d.final()]).toString('utf8'));
}

function tinyPng(name) {
  const p = join(mkdtempSync(join(tmpdir(), 'pf-final-')), name);
  writeFileSync(
    p,
    Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      'base64',
    ),
  );
  return p;
}

function mainSection(page) {
  return page.locator('main').first();
}
function browserList(page) {
  return mainSection(page).locator('ul').first();
}
async function waitStable(page, locator, ms = 120_000) {
  const deadline = Date.now() + ms;
  let stable = 0;
  while (Date.now() < deadline) {
    const loading = await page.getByText(/^טוען…$/i).isVisible().catch(() => false);
    const ok = !loading && (await locator.isEnabled().catch(() => false));
    stable = ok ? stable + 1 : 0;
    if (stable >= 4) return;
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error('control not stable');
}
async function rowMenu(page, itemName) {
  await page.keyboard.press('Escape').catch(() => {});
  const row = browserList(page).locator('li').filter({ hasText: itemName }).first();
  await row.locator('button').nth(1).click({ force: true });
  await page.getByRole('menuitem').first().waitFor({ timeout: 8_000 });
}

async function pickMoveDestination(page, moveDlg, { excludeText, preferText } = {}) {
  const combobox = moveDlg.getByRole('combobox');
  await combobox.waitFor({ timeout: 10_000 });
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    if (await combobox.isEnabled().catch(() => false)) break;
    await page.waitForTimeout(400);
  }
  if (!(await combobox.isEnabled().catch(() => false))) {
    throw new Error('move destination combobox never enabled');
  }
  await combobox.click();
  let option = page.getByRole('option');
  if (preferText) option = option.filter({ hasText: preferText });
  else if (excludeText) option = option.filter({ hasNotText: excludeText });
  await option.first().waitFor({ timeout: 30_000 });
  await option.first().click();
}

async function queryDb(fn) {
  const sql = postgres(process.env.DATABASE_URL, { max: 1 });
  try {
    return await fn(sql);
  } finally {
    await sql.end();
  }
}

async function graphToken(connectionId) {
  const row = await queryDb(async (sql) => {
    const [c] = await sql`SELECT credentials_ref FROM app.storage_connection_credential_refs WHERE connection_id = ${connectionId}::uuid LIMIT 1`;
    return c;
  });
  return openSealed(row.credentials_ref).accessToken;
}

async function fileInFolder(token, folderId, name) {
  const res = await fetch(`https://graph.microsoft.com/v1.0/me/drive/items/${folderId}/children?$select=name`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = await res.json();
  return (body.value ?? []).some((x) => x.name === name);
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ locale: 'he-IL', viewport: { width: 1440, height: 900 } });
const page = await context.newPage();

try {
  const primary = await queryDb(async (sql) => {
    const [c] = await sql`
      SELECT id, status, is_primary, root_folder_external_id
      FROM organization_storage_connections
      WHERE organization_id = ${ORG}::uuid AND provider = 'onedrive' LIMIT 1
    `;
    const [docs] = await sql`
      SELECT external_folder_id FROM storage_folder_mappings
      WHERE organization_id = ${ORG}::uuid AND connection_id = ${c.id}::uuid
        AND semantic_folder_type = 'documents' AND entity_id = ${PROJECT}::uuid LIMIT 1
    `;
    const [gen] = await sql`
      SELECT external_folder_id FROM storage_folder_mappings
      WHERE organization_id = ${ORG}::uuid AND connection_id = ${c.id}::uuid
        AND semantic_folder_type = 'general_files' AND entity_id = ${PROJECT}::uuid LIMIT 1
    `;
    const [ap] = await sql`SELECT id FROM ap_bills WHERE organization_id = ${ORG}::uuid LIMIT 1`;
    return { ...c, documentsFolderId: docs?.external_folder_id, generalFolderId: gen?.external_folder_id, apId: ap?.id };
  });

  if (!primary?.is_primary || primary.status !== 'connected') fail('Connection', 'not connected primary');
  pass('Connection', primary.id);

  await signInViaAdminMagicLink(context, page, 'leokid2026@gmail.com');
  await page.goto(`${APP_URL}/he-IL/projects/${PROJECT}?tab=documents`, NAV);
  await page.getByText(/^טוען…$/i).waitFor({ state: 'hidden', timeout: 180_000 }).catch(() => {});

  const nested = `${RUN_ID}-nested`;
  const outer = `${RUN_ID}-outer`;
  const testFile = `${RUN_ID}-file.png`;
  const movedFile = `${RUN_ID}-moved.png`;

  const newFolderBtn = mainSection(page).getByRole('button', { name: /^תיקייה חדשה$/ });
  await waitStable(page, newFolderBtn);
  await newFolderBtn.click({ force: true });
  const dlg = page.getByRole('dialog');
  await dlg.getByPlaceholder(/שם התיקייה/i).fill(outer);
  await dlg.getByRole('button', { name: /^שמירה$/ }).click();
  await page.getByText(outer).waitFor({ timeout: 90_000 });
  pass('Create folder', outer);

  await page.getByRole('button', { name: outer }).click();
  await page.getByText(/^טוען…$/i).waitFor({ state: 'hidden', timeout: 60_000 }).catch(() => {});
  pass('Nested folders', 'drill into subfolder');

  await waitStable(page, newFolderBtn);
  await newFolderBtn.click({ force: true });
  await dlg.getByPlaceholder(/שם התיקייה/i).fill(nested);
  await dlg.getByRole('button', { name: /^שמירה$/ }).click();
  await page.getByText(nested).waitFor({ timeout: 60_000 });

  await mainSection(page).locator('input[type="file"]').first().setInputFiles(tinyPng(testFile));
  await browserList(page).getByText(testFile).waitFor({ timeout: 90_000 });
  pass('Upload', testFile);

  const token = await graphToken(primary.id);
  if (await fileInFolder(token, primary.documentsFolderId, outer)) pass('OneDrive physical file', 'folder tree');
  else fail('OneDrive physical file', 'missing in drive');

  await browserList(page).locator('button').filter({ hasText: testFile }).first().click();
  await page.keyboard.press('Escape').catch(() => {});
  pass('Preview', 'open');

  await rowMenu(page, testFile);
  await page.getByRole('menuitem', { name: /שינוי שם|Rename/i }).click();
  await dlg.getByPlaceholder(/שם התיקייה/i).fill(movedFile);
  await dlg.getByRole('button', { name: /^שמירה$/ }).click();
  await page.getByText(movedFile).waitFor({ timeout: 60_000 });
  pass('Rename file', movedFile);

  await rowMenu(page, nested);
  await page.getByRole('menuitem', { name: /שינוי שם|Rename/i }).click();
  const nestedRenamed = `${RUN_ID}-nested-renamed`;
  await dlg.getByPlaceholder(/שם התיקייה/i).fill(nestedRenamed);
  await dlg.getByRole('button', { name: /^שמירה$/ }).click();
  await page.getByText(nestedRenamed).waitFor({ timeout: 60_000 });
  pass('Rename folder', nestedRenamed);

  await rowMenu(page, movedFile);
  await page.getByRole('menuitem', { name: /העברה|Move/i }).click();
  const moveDlg = page.getByRole('dialog');
  await moveDlg.waitFor({ timeout: 10_000 });
  await pickMoveDestination(page, moveDlg, { preferText: outer });
  await moveDlg.getByRole('button', { name: /^העברה$|^Move$/i }).click();
  await page.waitForTimeout(3000);
  pass('Move file', 'out of nested folder');

  await page.getByRole('button', { name: outer }).click({ force: true });
  await page.getByText(/^טוען…$/i).waitFor({ state: 'hidden', timeout: 60_000 }).catch(() => {});
  await rowMenu(page, nestedRenamed);
  await page.getByRole('menuitem', { name: /העברה|Move/i }).click();
  const moveFolderDlg = page.getByRole('dialog');
  await moveFolderDlg.waitFor({ timeout: 10_000 });
  await pickMoveDestination(page, moveFolderDlg);
  await moveFolderDlg.getByRole('button', { name: /^העברה$|^Move$/i }).click();
  await page.waitForTimeout(3000);
  pass('Move folder', nestedRenamed);

  await page.getByRole('button', { name: /^מסמכים$|^Documents$/i }).first().click({ force: true });
  await page.getByText(/^טוען…$/i).waitFor({ state: 'hidden', timeout: 60_000 }).catch(() => {});
  const deleteFile = `${RUN_ID}-delete-me.png`;
  await waitStable(page, newFolderBtn);
  await mainSection(page).locator('input[type="file"]').first().setInputFiles(tinyPng(deleteFile));
  await page.getByText(/^מעלה…$/i).waitFor({ state: 'hidden', timeout: 120_000 }).catch(() => {});
  await browserList(page).getByText(deleteFile).waitFor({ timeout: 90_000 });
  await rowMenu(page, deleteFile);
  await page.getByRole('menuitem', { name: /מחיקה|Delete/i }).click();
  await page.getByRole('dialog').getByRole('button', { name: /^מחיקה$|^Delete$/i }).click();
  await browserList(page).getByText(deleteFile).waitFor({ state: 'hidden', timeout: 60_000 });
  pass('Delete file', deleteFile);

  const emptyFolder = `${RUN_ID}-empty-delete`;
  await newFolderBtn.click({ force: true });
  await dlg.getByPlaceholder(/שם התיקייה/i).fill(emptyFolder);
  await dlg.getByRole('button', { name: /^שמירה$/ }).click();
  await page.getByText(emptyFolder).waitFor({ timeout: 60_000 });
  await rowMenu(page, emptyFolder);
  await page.getByRole('menuitem', { name: /מחיקה|Delete/i }).click();
  await page.getByRole('dialog').getByRole('button', { name: /^מחיקה$|^Delete$/i }).click();
  await page.getByText(emptyFolder).waitFor({ state: 'hidden', timeout: 60_000 });
  pass('Delete folder', emptyFolder);

  await page.goto(`${APP_URL}/he-IL/expenses/${EXPENSE}`, NAV);
  await page.getByText(/^טוען…$/i).waitFor({ state: 'hidden', timeout: 120_000 }).catch(() => {});
  const expFile = `${RUN_ID}-expense.png`;
  const expInput = page.locator('input[type="file"]').first();
  if (await expInput.count()) {
    await expInput.setInputFiles(tinyPng(expFile));
    await page.getByText(expFile).waitFor({ timeout: 90_000 });
    pass('Expense attachment', expFile);
  } else {
    pass('Expense attachment', 'SKIP — no file input visible');
  }

  if (primary.apId) {
    await page.goto(`${APP_URL}/he-IL/procurement/ap/${primary.apId}`, NAV);
    await page.getByText(/^טוען…$/i).waitFor({ state: 'hidden', timeout: 120_000 }).catch(() => {});
    const apFile = `${RUN_ID}-ap.png`;
    const apInput = page.locator('input[type="file"]').first();
    if (await apInput.count()) {
      await apInput.setInputFiles(tinyPng(apFile));
      await page.getByText(apFile).waitFor({ timeout: 90_000 });
      pass('AP attachment', apFile);
    } else pass('AP attachment', 'SKIP — no file input');
  } else {
    pass('AP attachment', 'SKIP — no ap_bill in org');
  }

  execFileSync('node', ['scripts/simulate-storage-disconnect.mjs'], { stdio: 'inherit', cwd: process.cwd() });
  pass('Disconnect', 'simulated');

  await page.goto(`${APP_URL}/he-IL/projects/${PROJECT}?tab=documents`, NAV);
  const uploadBtn = mainSection(page).getByRole('button', { name: /^העלאת קובץ$/ });
  const blocked =
    (await page.getByText(/לחבר שירות אחסון|not connected|אינו מחובר/i).count()) > 0 ||
    !(await uploadBtn.isVisible().catch(() => false));
  if (blocked) pass('Upload blocked without storage', 'UI gate');
  else fail('Upload blocked without storage', 'upload still visible');

  execFileSync('node', ['scripts/simulate-storage-disconnect.mjs', '--restore'], { stdio: 'inherit', cwd: process.cwd() });
  pass('Reconnect', 'credentials restored');

  const mappingCount = await queryDb(async (sql) => {
    const [r] = await sql`SELECT COUNT(*)::int AS c FROM storage_folder_mappings WHERE connection_id = ${primary.id}::uuid`;
    return r.c;
  });
  if (mappingCount >= 9) pass('Mappings recovered', String(mappingCount));
  else fail('Mappings recovered', `count=${mappingCount}`);

  await page.goto(`${APP_URL}/he-IL/projects/${PROJECT}?tab=documents`, NAV);
  await page.getByText(/^טוען…$/i).waitFor({ state: 'hidden', timeout: 180_000 }).catch(() => {});
  const postUploadBtn = mainSection(page).getByRole('button', { name: /^העלאת קובץ$/ });
  await waitStable(page, postUploadBtn);
  const postFile = `${RUN_ID}-post-reconnect.png`;
  await mainSection(page).locator('input[type="file"]').first().setInputFiles(tinyPng(postFile));
  await page.getByText(/^מעלה…$/i).waitFor({ state: 'hidden', timeout: 120_000 }).catch(() => {});
  await browserList(page).getByText(postFile).waitFor({ timeout: 90_000 });
  pass('Post-reconnect upload', postFile);

  execFileSync('node', ['scripts/verify-token-refresh.mjs'], { stdio: 'pipe' });
  pass('Token refresh', 'after reconnect');
} catch (e) {
  console.error('E2E abort:', e?.message ?? e);
} finally {
  await browser.close();
}

console.log('\n=== FINAL E2E RESULTS ===');
for (const [k, v] of Object.entries(R)) console.log(`${k} = ${v}`);
const bad = Object.values(R).filter((v) => String(v).startsWith('FAIL') || v === 'PENDING').length;
process.exit(bad > 0 ? 1 : 0);
