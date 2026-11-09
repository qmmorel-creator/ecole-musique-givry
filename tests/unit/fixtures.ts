import type { FeeLine, FeeRules } from '../../src/domain/index.ts';

export const RULES: FeeRules = {
  seasonId: 's', formulas: [{ code: 'instrument_30', label: 'Cours individuel 30 min' }, { code: 'fm_seule', label: 'Formation musicale seule' }],
  siblingDiscountPct: 10, siblingFromRank: 2, siblingChildrenOnly: true, adhesionAmount: 20, adultAge: 18, communes: ['Givry'],
  fmFormula: 'fm_seule', fmIncludedForChildren: true,
};

const line = (formula: string, pub: 'enfant' | 'adulte', residence: 'commune' | 'hors_commune', amount: number): FeeLine => ({ id: `${formula}-${pub}-${residence}`, seasonId: 's', formula, public: pub, residence, amount });

export const GRID: FeeLine[] = [
  line('instrument_30', 'enfant', 'commune', 310), line('instrument_30', 'enfant', 'hors_commune', 345),
  line('instrument_30', 'adulte', 'commune', 390), line('instrument_30', 'adulte', 'hors_commune', 430),
  line('fm_seule', 'enfant', 'commune', 120), line('fm_seule', 'enfant', 'hors_commune', 140),
  line('fm_seule', 'adulte', 'commune', 140), line('fm_seule', 'adulte', 'hors_commune', 160),
];
