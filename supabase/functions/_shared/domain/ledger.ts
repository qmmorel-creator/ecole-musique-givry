// Recettes automatiques et bilan de l'exercice (comptabilité de trésorerie).
import type { LedgerCategory, LedgerEntry, Payment, SchoolEvent } from './types.ts';
import { inExercise, type Exercise } from './exercise.ts';
import { round2, sum } from './money.ts';

export const INSCRIPTIONS_CATEGORY_ID = 'cat-rec-inscriptions';

/**
 * Règle du déclencheur : un règlement encaissé crée une recette « Inscriptions encaissées »,
 * datée du jour d'encaissement. Un règlement non encaissé n'en crée pas.
 * La même règle est écrite en SQL (supabase/migrations, trigger payments_to_ledger).
 */
export function ledgerEntryFromPayment(payment: Payment, familyName: string, installmentLabel: string): Omit<LedgerEntry, 'id' | 'createdAt'> | null {
  if (!payment.cashedOn) return null;
  return {
    date: payment.cashedOn,
    kind: 'recette',
    categoryId: INSCRIPTIONS_CATEGORY_ID,
    amount: round2(payment.amount),
    label: `Inscription · famille ${familyName} · ${installmentLabel}`,
    eventId: null,
    paymentId: payment.id,
    method: payment.method,
    attachmentId: null,
    source: 'auto',
  };
}

/** Synchronise les recettes automatiques avec les règlements : ajoute, met à jour, retire. */
export function syncAutoEntries(
  entries: LedgerEntry[],
  payments: Payment[],
  describe: (p: Payment) => { familyName: string; installmentLabel: string },
  newId: () => string,
  now: string,
): LedgerEntry[] {
  // Les recettes automatiques détachées de leur règlement (purge RGPD) restent dans les comptes.
  const manual = entries.filter((e) => e.source !== 'auto' || !e.paymentId);
  const existing = new Map(entries.filter((e) => e.source === 'auto' && e.paymentId).map((e) => [e.paymentId as string, e]));
  const auto: LedgerEntry[] = [];
  for (const p of payments) {
    const d = describe(p);
    const draft = ledgerEntryFromPayment(p, d.familyName, d.installmentLabel);
    if (!draft) continue;
    const prev = existing.get(p.id);
    auto.push({ ...draft, id: prev?.id ?? newId(), createdAt: prev?.createdAt ?? now });
  }
  return [...manual, ...auto];
}

export interface CategoryTotal {
  categoryId: string;
  label: string;
  amount: number;
  auto: boolean;
}

export interface EventResult {
  eventId: string;
  name: string;
  date: string;
  recettes: number;
  depenses: number;
  result: number;
}

export interface Bilan {
  exercise: Exercise;
  recettes: CategoryTotal[];
  depenses: CategoryTotal[];
  totalRecettes: number;
  totalDepenses: number;
  resultat: number;
  events: EventResult[];
  entryCount: number;
  missingAttachments: number;
}

export function computeBilan(entries: LedgerEntry[], categories: LedgerCategory[], events: SchoolEvent[], exercise: Exercise): Bilan {
  const inEx = entries.filter((e) => inExercise(e.date, exercise));
  const totals = (kind: 'recette' | 'depense'): CategoryTotal[] =>
    categories
      .filter((c) => c.kind === kind)
      .map((c) => ({
        categoryId: c.id,
        label: c.label,
        auto: c.system,
        amount: sum(inEx.filter((e) => e.categoryId === c.id).map((e) => e.amount)),
      }))
      .filter((t) => t.amount !== 0 || !categories.find((c) => c.id === t.categoryId)?.archived)
      .sort((a, b) => b.amount - a.amount);
  const recettes = totals('recette');
  const depenses = totals('depense');
  const totalRecettes = sum(inEx.filter((e) => e.kind === 'recette').map((e) => e.amount));
  const totalDepenses = sum(inEx.filter((e) => e.kind === 'depense').map((e) => e.amount));
  const evs: EventResult[] = events
    .map((ev) => {
      const mine = inEx.filter((e) => e.eventId === ev.id);
      const r = sum(mine.filter((e) => e.kind === 'recette').map((e) => e.amount));
      const d = sum(mine.filter((e) => e.kind === 'depense').map((e) => e.amount));
      return { eventId: ev.id, name: ev.name, date: ev.date, recettes: r, depenses: d, result: round2(r - d) };
    })
    .filter((e) => e.recettes !== 0 || e.depenses !== 0 || inExercise(e.date, exercise))
    .sort((a, b) => a.date.localeCompare(b.date));
  return {
    exercise,
    recettes,
    depenses,
    totalRecettes,
    totalDepenses,
    resultat: round2(totalRecettes - totalDepenses),
    events: evs,
    entryCount: inEx.length,
    missingAttachments: inEx.filter((e) => e.kind === 'depense' && !e.attachmentId).length,
  };
}
