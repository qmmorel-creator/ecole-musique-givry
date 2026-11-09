import { expect, test } from '@playwright/test';
import { collectConsoleErrors, expectNoHorizontalScroll, freshDemo } from './helpers.ts';

test('inscription complète sur téléphone, fratrie reconnue', async ({ page }) => {
  const errors = collectConsoleErrors(page);
  await freshDemo(page, '/');
  await expect(page.getByText('Données de démonstration')).toBeVisible();
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
  await page.getByRole('link', { name: 'Inscrire un élève' }).click();

  // Étape 1 : responsable légal
  await expect(page.getByText('Étape 1 sur 3')).toBeVisible();
  await expectNoHorizontalScroll(page);
  await page.getByRole('button', { name: 'Continuer' }).click();
  await expect(page.getByText('Indiquez le prénom.')).toBeVisible();
  await page.getByLabel('Prénom', { exact: true }).fill('Camille');
  await page.getByLabel('Nom', { exact: true }).fill('Roux');
  await page.getByLabel('Adresse mail').fill('camille.roux@example.com');
  await page.getByLabel('Téléphone').fill('06 12 34 56 41');
  await page.getByLabel('Adresse', { exact: true }).fill('3 rue du Moulin');
  await page.getByLabel('Code postal').fill('71640');
  await page.getByLabel('Commune').fill('Mellecey');
  await page.getByRole('button', { name: 'Continuer' }).click();

  // Étape 2 : fratrie et élève
  await expect(page.getByText('Étape 2 sur 3')).toBeVisible();
  await page.getByRole('group', { name: 'Un enfant de votre famille est-il déjà inscrit ?' }).getByRole('button', { name: 'Oui' }).click();
  await page.getByRole('button', { name: 'Rechercher ma famille' }).click();
  await expect(page.getByTestId('famille-trouvee')).toBeVisible();
  // Aucune information sur les autres enfants n'est affichée
  await expect(page.getByText('Chloé')).toHaveCount(0);
  await page.getByLabel('Prénom de l’élève').fill('Lina');
  await page.getByLabel('Date de naissance').fill('2017-05-02');
  await expectNoHorizontalScroll(page);
  await page.getByRole('button', { name: 'Choisir l’instrument' }).click();

  // Étape 3 : cours et règlement
  await expect(page.getByText('Étape 3 sur 3')).toBeVisible();
  await page.getByRole('button', { name: /Guitare/ }).click();
  await page.getByLabel('Niveau').selectOption('1re année');
  await page.getByLabel('Créneau souhaité').selectOption('Mer. 14 h');
  await expect(page.getByTestId('fm-auto')).toBeVisible();
  await expect(page.getByText(/Réduction fratrie \(−10 %\)/)).toBeVisible();
  await page.getByRole('button', { name: /En 3 fois/ }).click();
  await page.getByRole('button', { name: 'J’autorise' }).click();
  await page.getByLabel(/règlement intérieur/).check();
  await page.getByLabel(/informations sur l’utilisation de mes données/).check();
  await expectNoHorizontalScroll(page);
  await page.getByRole('button', { name: 'Envoyer l’inscription' }).click();

  const conf = page.getByTestId('confirmation');
  await expect(conf).toBeVisible();
  await expect(conf).toContainText('Lina');
  await expect(conf).toContainText(/EMG-26-/);
  await expect(conf).toContainText('Réduction fratrie');
  await expect(conf).toContainText('Échéance 3/3');
  await page.getByRole('button', { name: 'Voir le mail simulé' }).click();
  await expect(page.getByTestId('mail-simule')).toContainText('camille.roux@example.com');
  await expectNoHorizontalScroll(page);
  await expect(page.getByText('Réalisé par QME')).toBeVisible();
  expect(errors).toEqual([]);
});

test('cours complet : la demande part sur liste d’attente', async ({ page }) => {
  await freshDemo(page, '/inscription');
  await page.getByLabel('Prénom', { exact: true }).fill('Luc');
  await page.getByLabel('Nom', { exact: true }).fill('Nouveau');
  await page.getByLabel('Adresse mail').fill('luc.nouveau@example.com');
  await page.getByLabel('Téléphone').fill('0612345678');
  await page.getByLabel('Adresse', { exact: true }).fill('1 place de la Halle');
  await page.getByLabel('Code postal').fill('71640');
  await page.getByLabel('Commune').fill('Givry');
  await page.getByRole('button', { name: 'Continuer' }).click();
  await page.getByRole('group', { name: 'Un enfant de votre famille est-il déjà inscrit ?' }).getByRole('button', { name: 'Non' }).click();
  await page.getByLabel('Prénom de l’élève').fill('Jules');
  await page.getByLabel('Date de naissance').fill('2016-01-20');
  await page.getByRole('button', { name: 'Choisir l’instrument' }).click();
  await page.getByRole('button', { name: /Piano/ }).click();
  await expect(page.getByText(/Piano est complet/)).toBeVisible();
  await page.getByLabel('Niveau').selectOption('1re année');
  await page.getByLabel('Créneau souhaité').selectOption({ index: 1 });
  await page.getByRole('button', { name: 'Je n’autorise pas' }).click();
  await page.getByLabel(/règlement intérieur/).check();
  await page.getByLabel(/informations sur l’utilisation de mes données/).check();
  await page.getByRole('button', { name: 'Demander la liste d’attente' }).click();
  await expect(page.getByTestId('confirmation')).toContainText('liste d’attente');
});

test('réinscription par le lien reçu par mail', async ({ page }) => {
  await freshDemo(page, '/reinscription/demo-reinscription');
  await expect(page.getByText('Bonjour Sandrine')).toBeVisible();
  await expect(page.getByText(/Alice/)).toBeVisible();
  await page.getByRole('button', { name: 'J’autorise' }).click();
  await page.getByLabel(/règlement intérieur/).check();
  await page.getByLabel(/informations sur l’utilisation de mes données/).check();
  await expectNoHorizontalScroll(page);
  await page.getByRole('button', { name: 'Envoyer la réinscription' }).click();
  await expect(page.getByTestId('confirmation').first()).toBeVisible();
  await expect(page.getByTestId('confirmation')).toHaveCount(2);
});

test('un lien de réinscription inconnu ne révèle rien', async ({ page }) => {
  await freshDemo(page, '/reinscription/inconnu');
  await expect(page.getByText(/invalide ou a expiré/)).toBeVisible();
});
