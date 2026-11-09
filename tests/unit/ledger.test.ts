import { describe, expect, it } from 'vitest';
import { computeBilan, exerciseFor, inExercise, INSCRIPTIONS_CATEGORY_ID, ledgerEntryFromPayment, syncAutoEntries, type LedgerCategory, type LedgerEntry, type Payment, type SchoolEvent } from '../../src/domain/index.ts';

const pay = (p: Partial<Payment>): Payment => ({ id: 'p1', installmentId: 'i1', familyId: 'f1', amount: 103.5, method: 'cheque', reference: 'Chèque n° 4521', bank: 'Crédit Agricole', receivedOn: '2026-11-06', cashedOn: null, depositSlipId: null, createdAt: '', ...p });
const describeP = () => ({ familyName: 'Roux', installmentLabel: 'Tom · échéance 1/3' });
let n = 0;
const newId = () => `auto-${++n}`;

describe('déclencheur des recettes d’inscription', () => {
  it('ne crée pas de recette tant que le règlement n’est pas encaissé', () => {
    expect(ledgerEntryFromPayment(pay({}), 'Roux', 'x')).toBeNull();
  });
  it('crée une recette « Inscriptions encaissées » datée de l’encaissement', () => {
    const e = ledgerEntryFromPayment(pay({ cashedOn: '2026-11-10' }), 'Roux', 'Tom · échéance 1/3');
    expect(e).toMatchObject({ date: '2026-11-10', kind: 'recette', categoryId: INSCRIPTIONS_CATEGORY_ID, amount: 103.5, paymentId: 'p1', source: 'auto' });
  });
  it('synchronise sans doublon et retire la recette si le règlement disparaît', () => {
    const manual: LedgerEntry = { id: 'm1', date: '2026-10-01', kind: 'depense', categoryId: 'c', amount: 10, label: 'x', eventId: null, paymentId: null, method: null, attachmentId: null, source: 'manuel', createdAt: '' };
    const p = pay({ cashedOn: '2026-11-10' });
    const once = syncAutoEntries([manual], [p], describeP, newId, 'now');
    const twice = syncAutoEntries(once, [p], describeP, newId, 'now');
    expect(twice.filter((e) => e.source === 'auto')).toHaveLength(1);
    expect(twice.find((e) => e.source === 'auto')?.id).toBe(once.find((e) => e.source === 'auto')?.id);
    const after = syncAutoEntries(twice, [], describeP, newId, 'now');
    expect(after).toEqual([manual]);
  });
  it('conserve une recette détachée de son règlement (purge RGPD)', () => {
    const detached: LedgerEntry = { id: 'd', date: '2023-10-01', kind: 'recette', categoryId: INSCRIPTIONS_CATEGORY_ID, amount: 50, label: 'Inscription (données personnelles purgées)', eventId: null, paymentId: null, method: 'cheque', attachmentId: null, source: 'auto', createdAt: '' };
    expect(syncAutoEntries([detached], [], describeP, newId, 'now')).toEqual([detached]);
  });
});

describe('exercice', () => {
  it('va par défaut du 1er septembre au 31 août', () => {
    expect(exerciseFor('2026-11-09')).toEqual({ start: '2026-09-01', end: '2027-08-31', label: '2026-2027' });
    expect(exerciseFor('2026-08-31')).toEqual({ start: '2025-09-01', end: '2026-08-31', label: '2025-2026' });
  });
  it('est paramétrable (année civile)', () => {
    expect(exerciseFor('2026-11-09', 1, 1)).toEqual({ start: '2026-01-01', end: '2026-12-31', label: '2026' });
    expect(inExercise('2026-12-31', exerciseFor('2026-01-01', 1, 1))).toBe(true);
  });
});

describe('bilan de l’exercice', () => {
  const cats: LedgerCategory[] = [
    { id: INSCRIPTIONS_CATEGORY_ID, kind: 'recette', label: 'Inscriptions encaissées', system: true, archived: false },
    { id: 'sub', kind: 'recette', label: 'Subventions', system: false, archived: false },
    { id: 'salle', kind: 'depense', label: 'Événements', system: false, archived: false },
    { id: 'old', kind: 'depense', label: 'Ancienne catégorie', system: false, archived: true },
  ];
  const ev: SchoolEvent[] = [{ id: 'noel', seasonId: 's', name: 'Audition de Noël', date: '2026-12-13', kind: 'audition', place: '', budget: 380 }];
  const e = (id: string, date: string, kind: 'recette' | 'depense', categoryId: string, amount: number, eventId: string | null = null, attachmentId: string | null = 'a'): LedgerEntry => ({ id, date, kind, categoryId, amount, label: id, eventId, paymentId: null, method: null, attachmentId, source: 'manuel', createdAt: '' });
  const entries = [
    e('r1', '2026-10-01', 'recette', INSCRIPTIONS_CATEGORY_ID, 1000), e('r2', '2026-10-08', 'recette', 'sub', 3000), e('r3', '2026-12-13', 'recette', 'sub', 340, 'noel'),
    e('d1', '2026-11-05', 'depense', 'salle', 120, 'noel'), e('d2', '2026-11-06', 'depense', 'salle', 260.4, 'noel', null),
    e('hors', '2026-08-31', 'recette', 'sub', 9999),
  ];
  const b = computeBilan(entries, cats, ev, exerciseFor('2026-11-09'));
  it('totalise par catégorie, sur l’exercice seulement', () => {
    expect(b.totalRecettes).toBe(4340);
    expect(b.totalDepenses).toBe(380.4);
    expect(b.resultat).toBe(3959.6);
    expect(b.recettes.find((r) => r.categoryId === 'sub')?.amount).toBe(3340);
    expect(b.recettes.find((r) => r.categoryId === INSCRIPTIONS_CATEGORY_ID)?.auto).toBe(true);
  });
  it('masque les catégories archivées vides', () => {
    expect(b.depenses.some((d) => d.categoryId === 'old')).toBe(false);
  });
  it('calcule le résultat par événement et compte les justificatifs manquants', () => {
    expect(b.events).toEqual([{ eventId: 'noel', name: 'Audition de Noël', date: '2026-12-13', recettes: 340, depenses: 380.4, result: -40.4 }]);
    expect(b.missingAttachments).toBe(1);
    expect(b.entryCount).toBe(5);
  });
});
