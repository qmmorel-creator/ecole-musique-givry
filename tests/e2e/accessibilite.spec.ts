import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { freshDemo } from './helpers.ts';

async function audit(page: Page, name: string) {
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  const serious = r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  expect(serious.map((v) => `${name} · ${v.id} : ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`)).toEqual([]);
}

test('pages publiques : accessibles (WCAG AA)', async ({ page }) => {
  await freshDemo(page, '/');
  await audit(page, 'accueil');
  await page.goto('/inscription');
  await audit(page, 'inscription étape 1');
  await page.goto('/donnees-personnelles');
  await audit(page, 'données personnelles');
});

test('bureau : accessible (WCAG AA) et utilisable au clavier', async ({ page }) => {
  await freshDemo(page, '/bureau');
  await audit(page, 'connexion');
  // Le bouton du rôle Présidence est atteint et activé au clavier seulement
  for (let i = 0; i < 10 && !(await page.evaluate(() => document.activeElement?.tagName === 'BUTTON' && (document.activeElement.textContent ?? '').includes('Présidence'))); i++) await page.keyboard.press('Tab');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: /Bonjour/ }).first()).toBeVisible();
  for (const [path, name] of [['/bureau', 'accueil'], ['/bureau/eleves', 'élèves'], ['/bureau/places', 'places'], ['/bureau/encaissements', 'encaissements'], ['/bureau/comptabilite', 'comptabilité'], ['/bureau/parametres', 'paramètres'], ['/bureau/mails', 'mails'], ['/bureau/donnees', 'données']]) {
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
    await audit(page, name);
  }
});
