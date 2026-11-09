import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { collectConsoleErrors, freshDemo, loginAs } from './helpers.ts';

test.beforeEach(async ({ page }) => { await freshDemo(page, '/bureau'); });

test('accueil du bureau : indicateurs et liste à faire', async ({ page }) => {
  const errors = collectConsoleErrors(page);
  await loginAs(page, 'Trésorerie');
  await expect(page.getByRole('heading', { name: 'Bonjour Claire' }).first()).toBeVisible();
  await expect(page.getByText('Élèves inscrits')).toBeVisible();
  await expect(page.getByText('94', { exact: true }).first()).toBeVisible();
  await expect(page.getByRole('heading', { name: 'À faire cette semaine' })).toBeVisible();
  await expect(page.getByText(/Relancer 3 familles/)).toBeVisible();
  expect(errors).toEqual([]);
});

test('base des élèves : recherche, filtre, fiche famille et export Excel', async ({ page }) => {
  await loginAs(page, 'Secrétariat');
  await page.getByRole('navigation', { name: 'Menu du bureau' }).getByRole('link', { name: /Élèves/ }).click();
  await page.getByPlaceholder(/Rechercher un élève/).fill('roux');
  const rows = page.locator('table.t tbody tr');
  await expect(rows).toHaveCount(2);
  await page.getByLabel('Instrument').selectOption('Guitare');
  await expect(rows).toHaveCount(1);
  await rows.first().click();
  const dialog = page.getByRole('dialog', { name: 'Famille Roux' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText('Historique des saisons').first()).toBeVisible();
  await dialog.getByRole('button', { name: 'Fermer' }).first().click();
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Exporter en Excel' }).click()]);
  expect(dl.suggestedFilename()).toBe('eleves-2026-2027.xlsx');
  const buf = readFileSync((await dl.path())!);
  expect(buf.subarray(0, 2).toString()).toBe('PK');
});

test('règlement par virement, puis bordereau de chèques PDF déposé', async ({ page }) => {
  await loginAs(page, 'Trésorerie');
  await page.getByRole('navigation', { name: 'Menu du bureau' }).getByRole('link', { name: /Encaissements/ }).click();
  await page.getByRole('button', { name: /En retard ·/ }).click();
  await page.getByRole('button', { name: 'Enregistrer', exact: true }).first().click();
  const dlg = page.getByRole('dialog', { name: 'Enregistrer un règlement' });
  await dlg.getByLabel('Mode de règlement').selectOption('virement');
  await dlg.getByLabel('Référence du virement').fill('EMG-TEST-1');
  await dlg.getByRole('button', { name: 'Enregistrer le règlement' }).click();
  await expect(page.getByText(/Virement enregistré/)).toBeVisible();

  await page.getByRole('button', { name: 'Tout sélectionner' }).click();
  await page.getByRole('button', { name: 'Préparer le bordereau' }).click();
  await expect(page.getByRole('heading', { name: 'Bordereau de remise n° 7' })).toBeVisible();
  const [pdf] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Générer le bordereau PDF' }).click()]);
  expect(pdf.suggestedFilename()).toBe('bordereau-7.pdf');
  expect(readFileSync((await pdf.path())!).subarray(0, 5).toString()).toBe('%PDF-');
  await page.getByRole('button', { name: 'Marquer comme déposé' }).click();
  await expect(page.getByText(/Bordereau déposé/)).toBeVisible();
  await expect(page.getByText('Aucune pièce en attente de dépôt.')).toBeVisible();
});

test('relances : préparées, relues puis envoyées après validation', async ({ page }) => {
  await loginAs(page, 'Trésorerie');
  await page.getByRole('navigation', { name: 'Menu du bureau' }).getByRole('link', { name: /Encaissements/ }).click();
  await page.getByRole('button', { name: 'Préparer les relances' }).click();
  await page.getByRole('link', { name: 'Relire et envoyer' }).click();
  await expect(page.getByRole('heading', { name: 'À valider avant envoi' })).toBeVisible();
  await page.getByRole('button', { name: 'Relire' }).first().click();
  await expect(page.getByRole('dialog')).toContainText('Sauf erreur de notre part');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Tout sélectionner' }).click();
  await page.getByRole('button', { name: /Valider et envoyer \(3\)/ }).click();
  await expect(page.getByText('Aucun mail en attente.', { exact: false })).toBeVisible();
  await expect(page.locator('table.t tbody tr').filter({ hasText: 'Relance' })).toHaveCount(3);
});

test('liste d’attente : proposer la place libre au premier', async ({ page }) => {
  await loginAs(page, 'Secrétariat');
  await page.getByRole('navigation', { name: 'Menu du bureau' }).getByRole('link', { name: /Inscriptions et places/ }).click();
  await expect(page.getByRole('heading', { name: 'Liste d’attente' })).toBeVisible();
  // Piano est complet : son bouton reste désactivé ; l'éveil musical a une place libre.
  await expect(page.getByRole('button', { name: 'Proposer la place' }).first()).toBeDisabled();
  await page.locator('button:not([disabled])', { hasText: 'Proposer la place' }).click();
  await expect(page.getByText(/Place proposée/).first()).toBeVisible();
  await page.getByRole('button', { name: 'Inscrire', exact: true }).first().click();
  await expect(page.getByText('Inscription créée.')).toBeVisible();
});

test('le secrétariat n’a pas accès à la comptabilité', async ({ page }) => {
  await loginAs(page, 'Secrétariat');
  await expect(page.getByRole('navigation', { name: 'Menu du bureau' }).getByRole('link', { name: /Comptabilité/ })).toHaveCount(0);
  await page.goto('/bureau/comptabilite');
  await expect(page).toHaveURL(/\/bureau$/);
});

test('sans connexion, aucune donnée d’élève n’est affichée', async ({ page }) => {
  await page.goto('/bureau/eleves');
  await expect(page.getByRole('heading', { name: 'Connexion' })).toBeVisible();
  await expect(page.locator('body')).not.toContainText('example.com');
  await expect(page.locator('table')).toHaveCount(0);
});
