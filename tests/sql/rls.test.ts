import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import type { PGlite } from '@electric-sql/pglite';
import { asRole, createDb } from './harness.ts';

const PRES = '00000000-0000-4000-8000-000000000001';
const TRES = '00000000-0000-4000-8000-000000000002';
const SECR = '00000000-0000-4000-8000-000000000003';
const NOBODY = '00000000-0000-4000-8000-000000000009';

const PERSONAL_TABLES = ['families', 'guardians', 'students', 'enrollments', 'waitlist', 'installments', 'payments', 'deposit_slips', 'ledger_entries', 'attachments', 'staff_profiles', 'audit_log', 'mail_outbox', 'rate_limits'];
const ALL_TABLES = [...PERSONAL_TABLES, 'settings', 'seasons', 'courses', 'fee_grid', 'fee_rules', 'ledger_categories', 'events'];

let db: PGlite;

/** Lecture sous un rôle : renvoie les lignes, ou [] si l'accès est refusé. */
async function rows(role: 'anon' | 'authenticated', user: string | null, sql: string) {
  try { return await asRole(db, role, user, sql); } catch (e) { if (/permission denied/.test((e as Error).message)) return []; throw e; }
}

beforeAll(async () => {
  db = await createDb();
  await db.exec(readFileSync('supabase/seed.sql', 'utf8'));
  await db.exec(`
    insert into auth.users (id, email) values ('${PRES}', 'p@example.com'), ('${TRES}', 't@example.com'), ('${SECR}', 's@example.com'), ('${NOBODY}', 'x@example.com');
    insert into public.staff_profiles (id, full_name, email, role) values ('${PRES}', 'Hélène Marchal', 'p@example.com', 'presidence'), ('${TRES}', 'Claire Dumas', 't@example.com', 'tresorerie'), ('${SECR}', 'Nicolas Perret', 's@example.com', 'secretariat');
  `);
}, 120_000);

describe('RLS : visiteur anonyme', () => {
  it('le jeu d’essai est bien chargé (contrôle du test)', async () => {
    const r = await db.query<{ n: number }>('select count(*)::int as n from public.students');
    expect(r.rows[0].n).toBeGreaterThan(90);
  });

  it.each(ALL_TABLES)('ne lit aucune ligne de %s', async (t) => {
    expect(await rows('anon', null, `select * from public.${t}`)).toEqual([]);
  });

  it('ne peut rien écrire', async () => {
    await expect(asRole(db, 'anon', null, "insert into public.families (family_name, postal_code, commune) values ('X', '71640', 'Givry')")).rejects.toThrow(/permission denied|row-level security/);
  });

  it('obtient le catalogue public, sans aucune donnée personnelle', async () => {
    const [r] = await asRole<{ c: Record<string, unknown> }>(db, 'anon', null, 'select public.public_catalog() as c');
    const json = JSON.stringify(r.c);
    expect((r.c.courses as unknown[]).length).toBeGreaterThan(5);
    expect(json).not.toMatch(/example\.com|birth_date|first_name|family_name/);
  });

  it('ne peut pas appeler directement la recherche de fratrie ni la limite d’envois', async () => {
    await expect(asRole(db, 'anon', null, "select public.sibling_lookup('Roux', '71640', 'camille.roux@example.com')")).rejects.toThrow(/permission denied/);
    await expect(asRole(db, 'authenticated', SECR, "select public.sibling_lookup('Roux', '71640', 'camille.roux@example.com')")).rejects.toThrow(/permission denied/);
    await expect(asRole(db, 'anon', null, "select public.hit_rate_limit('x', 1, 60)")).rejects.toThrow(/permission denied/);
  });
});

describe('RLS : comptes connectés', () => {
  it('un compte sans profil du bureau ne lit rien', async () => {
    for (const t of PERSONAL_TABLES) expect(await rows('authenticated', NOBODY, `select * from public.${t}`), t).toEqual([]);
  });

  it('le secrétariat lit les élèves mais pas la comptabilité ni le journal', async () => {
    expect((await rows('authenticated', SECR, 'select id from public.students')).length).toBeGreaterThan(90);
    expect(await rows('authenticated', SECR, 'select id from public.ledger_entries')).toEqual([]);
    expect(await rows('authenticated', SECR, 'select id from public.audit_log')).toEqual([]);
    await expect(asRole(db, 'authenticated', SECR, "insert into public.ledger_entries (date, kind, category_id, amount, label) values ('2026-11-09', 'depense', 'cat-dep-autres', 10, 'x')")).rejects.toThrow(/row-level security/);
  });

  it('la trésorerie ne peut pas modifier une recette automatique', async () => {
    const r = await asRole(db, 'authenticated', TRES, "update public.ledger_entries set amount = 1 where source = 'auto' returning id");
    expect(r).toEqual([]);
    await expect(asRole(db, 'authenticated', TRES, "insert into public.ledger_entries (date, kind, category_id, amount, label, source) values ('2026-11-09', 'recette', 'cat-rec-inscriptions', 10, 'x', 'auto')")).rejects.toThrow(/row-level security/);
  });

  it('seule la présidence gère les comptes du bureau', async () => {
    expect(await asRole(db, 'authenticated', TRES, `update public.staff_profiles set role = 'presidence' where id = '${TRES}' returning id`)).toEqual([]);
    expect((await asRole(db, 'authenticated', PRES, `update public.staff_profiles set active = true where id = '${SECR}' returning id`)).length).toBe(1);
  });
});

describe('déclencheur des recettes et fonctions du bureau', () => {
  const openInstallment = async () => (await db.query<{ id: string; family_id: string; amount: string }>(
    `select i.id, i.family_id, i.amount from public.installments i where not exists (select 1 from public.payments p where p.installment_id = i.id) order by i.id limit 1`)).rows[0];

  it('un virement saisi crée sa recette automatiquement, au jour de réception', async () => {
    const i = await openInstallment();
    const [p] = await asRole<{ id: string }>(db, 'authenticated', SECR, `insert into public.payments (installment_id, family_id, amount, method, reference, received_on) values ('${i.id}', '${i.family_id}', ${i.amount}, 'virement', 'EMG-SQL', '2026-11-09') returning id`);
    const e = await db.query<{ amount: string; date: string; category_id: string; source: string }>(`select amount, date::text, category_id, source from public.ledger_entries where payment_id = '${p.id}'`);
    expect(e.rows).toEqual([{ amount: i.amount, date: '2026-11-09', category_id: 'cat-rec-inscriptions', source: 'auto' }]);
  });

  it('un chèque ne crée sa recette qu’au dépôt du bordereau, et la suppression du règlement la retire', async () => {
    const i = await openInstallment();
    const [p] = await asRole<{ id: string }>(db, 'authenticated', TRES, `insert into public.payments (installment_id, family_id, amount, method, reference, bank, received_on) values ('${i.id}', '${i.family_id}', ${i.amount}, 'cheque', 'Chèque n° 1', 'CA', '2026-11-09') returning id`);
    const count = async () => (await db.query<{ n: number }>(`select count(*)::int n from public.ledger_entries where payment_id = '${p.id}'`)).rows[0].n;
    expect(await count()).toBe(0);
    await expect(asRole(db, 'authenticated', SECR, `select public.create_deposit_slip(array['${p.id}']::uuid[])`)).rejects.toThrow(/Droits insuffisants/);
    const [slip] = await asRole<{ id: string; number: number }>(db, 'authenticated', TRES, `select * from public.create_deposit_slip(array['${p.id}']::uuid[])`);
    expect(slip.number).toBe(7);
    await asRole(db, 'authenticated', TRES, `select public.mark_deposited('${slip.id}', '2026-11-10')`);
    expect(await count()).toBe(1);
    await asRole(db, 'authenticated', PRES, `update public.deposit_slips set deposited_on = null where id = '${slip.id}'`);
    await asRole(db, 'authenticated', SECR, `delete from public.payments where id = '${p.id}'`);
    expect(await count()).toBe(0);
  });

  it('le journal trace les actions du bureau avec leur auteur', async () => {
    const r = await db.query<{ actor: string; action: string }>("select actor, action from public.audit_log where entity = 'payments' order by id");
    expect(r.rows).toContainEqual({ actor: 'Nicolas Perret', action: 'Création' });
    expect(r.rows).toContainEqual({ actor: 'Claire Dumas', action: 'Modification' });
  });

  it('la recherche de fratrie (rôle service des fonctions Edge) répond seulement vrai ou faux', async () => {
    const [ok] = await asRole<{ r: boolean }>(db, 'service_role', null, "select public.sibling_lookup('ROUX', '71640', 'Camille.Roux@example.com') as r");
    const [ko] = await asRole<{ r: boolean }>(db, 'service_role', null, "select public.sibling_lookup('Roux', '71100', 'camille.roux@example.com') as r");
    expect(ok.r).toBe(true);
    expect(ko.r).toBe(false);
  });

  it('la limite d’envois bloque au-delà du maximum', async () => {
    const hits = [];
    for (let k = 0; k < 4; k++) hits.push((await asRole<{ r: boolean }>(db, 'service_role', null, "select public.hit_rate_limit('ip:test', 3, 600) as r"))[0].r);
    expect(hits).toEqual([true, true, true, false]);
  });

  it('la purge garde les écritures comptables sans donnée personnelle', async () => {
    // Saison passée ramenée à 2023-2024 : ses familles non réinscrites dépassent la durée de conservation
    await db.exec("update public.seasons set starts_on = '2023-09-01', ends_on = '2024-08-31' where label = '2025-2026'; update public.settings set retention_years = 2");
    const [prev] = await asRole<{ r: { families: number } }>(db, 'authenticated', PRES, 'select public.purge_preview() as r');
    expect(prev.r.families).toBeGreaterThan(0);
    const before = (await db.query<{ n: number }>('select count(*)::int n from public.ledger_entries')).rows[0].n;
    await expect(asRole(db, 'authenticated', SECR, 'select public.purge_old_seasons()')).rejects.toThrow(/Droits insuffisants/);
    await asRole(db, 'authenticated', PRES, 'select public.purge_old_seasons()');
    expect((await db.query<{ n: number }>('select count(*)::int n from public.ledger_entries')).rows[0].n).toBe(before);
    expect((await db.query<{ n: number }>("select count(*)::int n from public.ledger_entries where label like '%purgées%'")).rows[0].n).toBeGreaterThan(0);
  });
});
