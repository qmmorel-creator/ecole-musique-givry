// Échéancier et statut des échéances.
import type { Installment, InstallmentStatus, Payment, Plan } from './types.ts';
import { maxIso } from './dates.ts';
import { round2, sum } from './money.ts';

export interface PlannedInstallment {
  rank: number;
  count: number;
  dueOn: string;
  amount: number;
}

/**
 * Découpe un total en 1 ou 3 échéances. Le reste des centimes va sur la 1re échéance.
 * Une échéance dont la date est déjà passée à l'inscription est ramenée à la date d'inscription.
 */
export function planInstallments(total: number, plan: Plan, seasonDates: string[], registeredOn: string): PlannedInstallment[] {
  if (plan !== 1 && plan !== 3) throw new Error('Règlement en 1 ou 3 fois uniquement');
  if (seasonDates.length < plan) throw new Error('Dates d’échéance manquantes pour la saison');
  const cents = Math.round(total * 100);
  const part = Math.floor(cents / plan);
  const first = cents - part * (plan - 1);
  return Array.from({ length: plan }, (_, i) => ({
    rank: i + 1,
    count: plan,
    dueOn: maxIso(seasonDates[i], registeredOn.slice(0, 10)),
    amount: (i === 0 ? first : part) / 100,
  }));
}

export interface InstallmentState {
  status: InstallmentStatus;
  received: number;
  cashed: number;
}

export function installmentState(inst: Pick<Installment, 'id' | 'amount' | 'dueOn'>, payments: Payment[], today: string): InstallmentState {
  const mine = payments.filter((p) => p.installmentId === inst.id);
  const received = sum(mine.map((p) => p.amount));
  const cashed = sum(mine.filter((p) => p.cashedOn).map((p) => p.amount));
  const due = round2(inst.amount);
  let status: InstallmentStatus;
  if (cashed >= due) status = 'encaisse';
  // Chèque remis d'avance : il reste « prévu » jusqu'à son échéance, puis passe « à remettre ».
  else if (received >= due) status = inst.dueOn > today ? 'prevu' : 'a_remettre';
  else if (inst.dueOn < today) status = 'en_retard';
  else status = 'prevu';
  return { status, received, cashed };
}

/** Un virement est encaissé à sa réception ; chèque, ANCV et espèces passent par un bordereau de remise. */
export const cashedOnReception = (method: Payment['method']): boolean => method === 'virement';

export const STATUS_LABELS: Record<InstallmentStatus, string> = {
  prevu: 'Prévu',
  a_remettre: 'À remettre',
  encaisse: 'Encaissé',
  en_retard: 'En retard',
};

export const METHOD_LABELS: Record<Payment['method'], string> = {
  cheque: 'Chèque',
  virement: 'Virement',
  ancv: 'Chèques vacances ANCV',
  especes: 'Espèces',
};
