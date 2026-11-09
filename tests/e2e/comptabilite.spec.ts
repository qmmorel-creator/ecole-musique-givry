import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { freshDemo, loginAs } from './helpers.ts';

const nav = (page: Page, name: RegExp) => page.getByRole('navigation', { name: 'Menu du bureau' }).getByRole('link', { name }).click();

test.beforeEach(async ({ page }) => { await freshDemo(page, '/bureau'); await loginAs(page, 'Trésorerie'); });

test('un encaissement saisi crée sa recette en comptabilité, sans ressaisie', async ({ page }) => {
  await nav(page, /Comptabilité/);
  const autoRow = page.locator('table.t').first().locator('tr', { hasText: 'Inscriptions encaissées' });
  const before = await autoRow.locator('td.r').innerText();

  await nav(page, /Encaissements/);
  await page.getByRole('button', { name: /En retard ·/ }).click();
  await page.getByRole('button', { name: 'Enregistrer', exact: true }).first().click();
  const dlg = page.getByRole('dialog', { name: 'Enregistrer un règlement' });
  const amount = await dlg.getByLabel('Montant (€)').inputValue();
  await dlg.getByLabel('Mode de règlement').selectOption('virement');
  await dlg.getByLabel('Référence du virement').fill('EMG-E2E');
  await dlg.getByRole('button', { name: 'Enregistrer le règlement' }).click();
  await expect(page.getByText(/recette ajoutée en comptabilité/)).toBeVisible();

  await nav(page, /Comptabilité/);
  const after = await autoRow.locator('td.r').innerText();
  const n = (t: string) => Number(t.replace(/[^\d,]/g, '').replace(',', '.'));
  expect(n(after) - n(before)).toBeCloseTo(Number(amount), 2);
  await page.getByPlaceholder(/Rechercher un libellé/).fill('Inscription');
  await expect(page.locator('table.t').last().locator('tr').filter({ hasText: 'auto' }).first()).toBeVisible();
});

test('saisie d’une dépense avec justificatif, puis bilan PDF et export pour le CA', async ({ page }) => {
  await nav(page, /Comptabilité/);
  const form = page.locator('section', { has: page.getByRole('heading', { name: 'Saisir une opération' }) });
  await form.getByLabel('Catégorie').selectOption({ label: 'Événements · salle, communication, réception' });
  await form.getByLabel('Événement (facultatif)').selectOption({ label: 'Audition de Noël' });
  await form.getByLabel('Montant (€)').fill('85,40');
  await form.getByLabel('Libellé').fill('Décoration de la salle');
  await form.getByLabel(/Justificatif/).setInputFiles('tests/e2e/fixtures/facture-test.pdf');
  await expect(form.getByText(/Justificatif joint : facture-test.pdf/)).toBeVisible();
  await form.getByRole('button', { name: 'Enregistrer la dépense' }).click();
  await expect(page.getByText('Dépense enregistrée.')).toBeVisible();
  await expect(page.getByText('Décoration de la salle')).toBeVisible();

  const [pdf] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Générer le bilan PDF' }).click()]);
  expect(pdf.suggestedFilename()).toBe('bilan-2026-2027.pdf');
  const bytes = readFileSync((await pdf.path())!);
  expect(bytes.subarray(0, 5).toString()).toBe('%PDF-');
  expect(bytes.length).toBeGreaterThan(5000);

  const [xlsx] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Exporter pour le CA' }).click()]);
  expect(xlsx.suggestedFilename()).toBe('comptes-2026-2027.xlsx');
});

test('reçu de paiement et attestation en PDF depuis la fiche famille', async ({ page }) => {
  await nav(page, /Élèves/);
  await page.getByPlaceholder(/Rechercher un élève/).fill('Tissot');
  await page.locator('table.t tbody tr').first().click();
  const dlg = page.getByRole('dialog', { name: 'Famille Tissot' });
  const [recu] = await Promise.all([page.waitForEvent('download'), dlg.getByRole('button', { name: 'Reçu de paiement PDF' }).click()]);
  expect(recu.suggestedFilename()).toMatch(/^recu-tissot-2026-2027\.pdf$/);
  const [att] = await Promise.all([page.waitForEvent('download'), dlg.getByRole('button', { name: 'Attestation PDF' }).first().click()]);
  expect(att.suggestedFilename()).toMatch(/^attestation-.*-2026-2027\.pdf$/);
  expect(readFileSync((await att.path())!).subarray(0, 5).toString()).toBe('%PDF-');
});

test('export complet des données en XLSX et CSV, journal des actions', async ({ page }) => {
  await nav(page, /Données et RGPD/);
  const [x] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Exporter en Excel (.xlsx)' }).click()]);
  expect(x.suggestedFilename()).toMatch(/^export-complet-.*\.xlsx$/);
  const [z] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Exporter en CSV (.zip)' }).click()]);
  const zip = readFileSync((await z.path())!);
  expect(zip.subarray(0, 2).toString()).toBe('PK');
  expect(zip.toString('latin1')).toContain('families.csv');
  await expect(page.getByRole('cell', { name: 'Connexion' }).first()).toBeVisible();
  await page.getByRole('button', { name: 'Voir les données à purger' }).click();
  await expect(page.getByRole('dialog', { name: 'Purge des anciennes saisons' })).toBeVisible();
});

test('la grille tarifaire est paramétrable', async ({ page }) => {
  await nav(page, /Paramètres/);
  await page.getByLabel('Réduction fratrie (%)').fill('15');
  await page.getByRole('button', { name: 'Enregistrer la grille' }).click();
  await expect(page.getByText(/Grille tarifaire enregistrée/)).toBeVisible();
  await page.goto('/inscription');
  // La nouvelle règle est visible dans le journal
  await page.goto('/bureau/donnees');
  await expect(page.getByText(/fratrie −15 %/)).toBeVisible();
});
