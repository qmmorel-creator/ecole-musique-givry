import { describe, expect, it } from 'vitest';
import { installmentState, planInstallments, type Payment } from '../../src/domain/index.ts';

const DATES = ['2026-10-15', '2027-01-15', '2027-04-15'];

describe('échéances', () => {
  it('découpe en 3 fois et reporte les centimes sur la 1re échéance', () => {
    const p = planInstallments(100, 3, DATES, '2026-06-20');
    expect(p.map((x) => x.amount)).toEqual([33.34, 33.33, 33.33]);
    expect(p.reduce((a, x) => a + x.amount, 0)).toBeCloseTo(100, 10);
    expect(p.map((x) => x.dueOn)).toEqual(DATES);
  });
  it('donne 103,50 € par échéance pour 310,50 € en 3 fois (maquette)', () => {
    expect(planInstallments(310.5, 3, DATES, '2026-06-20').map((x) => x.amount)).toEqual([103.5, 103.5, 103.5]);
  });
  it('règle en 1 fois à la première date', () => {
    expect(planInstallments(365, 1, DATES, '2026-06-20')).toEqual([{ rank: 1, count: 1, dueOn: '2026-10-15', amount: 365 }]);
  });
  it('ramène à la date d’inscription une échéance déjà passée', () => {
    expect(planInstallments(300, 3, DATES, '2026-11-06').map((x) => x.dueOn)).toEqual(['2026-11-06', '2027-01-15', '2027-04-15']);
  });
  it('refuse un autre nombre de fois', () => {
    expect(() => planInstallments(300, 2 as 1, DATES, '2026-06-01')).toThrow();
  });
});

describe('statut d’une échéance', () => {
  const inst = { id: 'i1', amount: 103.5, dueOn: '2026-10-15' };
  const pay = (p: Partial<Payment>): Payment => ({ id: 'p', installmentId: 'i1', familyId: 'f', amount: 103.5, method: 'cheque', reference: 'Chèque n° 1', bank: 'CA', receivedOn: '2026-10-01', cashedOn: null, depositSlipId: null, createdAt: '', ...p });
  it('prévu avant l’échéance, en retard après', () => {
    expect(installmentState(inst, [], '2026-10-14').status).toBe('prevu');
    expect(installmentState(inst, [], '2026-10-16').status).toBe('en_retard');
  });
  it('à remettre quand le chèque est reçu mais pas déposé', () => {
    expect(installmentState(inst, [pay({})], '2026-11-09').status).toBe('a_remettre');
  });
  it('reste prévu quand un chèque est remis d’avance pour une échéance future', () => {
    expect(installmentState({ ...inst, dueOn: '2027-01-15' }, [pay({})], '2026-11-09').status).toBe('prevu');
  });
  it('encaissé quand le montant est encaissé, y compris en plusieurs règlements', () => {
    expect(installmentState(inst, [pay({ cashedOn: '2026-10-20' })], '2026-11-09').status).toBe('encaisse');
    const parts = [pay({ id: 'a', amount: 50, method: 'ancv', cashedOn: '2026-10-20' }), pay({ id: 'b', amount: 53.5, method: 'especes', cashedOn: '2026-10-20' })];
    expect(installmentState(inst, parts, '2026-11-09')).toEqual({ status: 'encaisse', received: 103.5, cashed: 103.5 });
  });
  it('en retard si le règlement reçu est partiel', () => {
    expect(installmentState(inst, [pay({ amount: 50 })], '2026-11-09').status).toBe('en_retard');
  });
});
