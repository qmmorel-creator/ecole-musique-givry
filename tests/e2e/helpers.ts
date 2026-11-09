import { expect, type Page } from '@playwright/test';

export const DEMO_NOW = new Date('2026-11-09T10:00:00+01:00');

/** Date figée au 9 novembre 2026 et démonstration réinitialisée. */
export async function freshDemo(page: Page, path = '/') {
  await page.clock.setFixedTime(DEMO_NOW);
  await page.goto(path);
  await page.evaluate(() => { for (const k of Object.keys(localStorage)) if (k.startsWith('emg-demo')) localStorage.removeItem(k); });
  await page.goto(path);
}

export async function expectNoHorizontalScroll(page: Page) {
  const { sw, iw } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
  expect(sw, 'pas de défilement horizontal').toBeLessThanOrEqual(iw);
}

export function collectConsoleErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}

export async function loginAs(page: Page, role: 'Présidence' | 'Trésorerie' | 'Secrétariat') {
  await page.goto('/bureau');
  await page.getByRole('button', { name: new RegExp(role) }).click();
  await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
}
