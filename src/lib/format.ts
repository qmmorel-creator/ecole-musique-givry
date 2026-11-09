import { METHOD_LABELS, type Payment } from '../domain/index.ts';

/** « Chèque n° 4521 · Crédit Agricole », « Virement · EMG-26-031 », « Espèces ». */
export function paymentLabel(p: Pick<Payment, 'method' | 'reference' | 'bank'>, withBank = true): string {
  const ref = p.reference.trim();
  const main = p.method === 'cheque' ? ref || 'Chèque' : p.method === 'especes' || !ref ? METHOD_LABELS[p.method] : `${METHOD_LABELS[p.method]} · ${ref}`;
  return withBank && p.bank && p.method !== 'especes' ? `${main} · ${p.bank}` : main;
}
