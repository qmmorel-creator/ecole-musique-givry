import { describe, expect, it } from 'vitest';
import { computePrice, publicFor, residenceFor, siblingDiscountApplies, PricingError } from '../../src/domain/index.ts';
import { GRID, RULES } from './fixtures.ts';

const base = { formula: 'instrument_30', public: 'enfant' as const, residence: 'hors_commune' as const, siblingRank: 1, withFm: true, adhesionAlreadyCounted: false };

describe('calcul du tarif', () => {
  it('applique la ligne de grille, la FM incluse pour un enfant et l’adhésion familiale', () => {
    const p = computePrice(base, GRID, RULES);
    expect(p.base).toBe(345);
    expect(p.fm).toBe(0);
    expect(p.lines.find((l) => l.kind === 'fm')?.note).toBe('incluse');
    expect(p.adhesion).toBe(20);
    expect(p.total).toBe(365);
  });

  it('reproduit l’exemple de la maquette : guitare hors commune, 2e enfant, adhésion déjà réglée = 310,50 €', () => {
    const p = computePrice({ ...base, siblingRank: 2, adhesionAlreadyCounted: true }, GRID, RULES);
    expect(p.siblingDiscount).toBe(34.5);
    expect(p.total).toBe(310.5);
  });

  it('distingue commune et hors commune, sans tenir compte des accents ni des tirets', () => {
    expect(residenceFor('GIVRY', RULES)).toBe('commune');
    expect(residenceFor('Mellecey', RULES)).toBe('hors_commune');
    expect(residenceFor('Saint-Désert', { ...RULES, communes: ['saint desert'] })).toBe('commune');
    expect(computePrice({ ...base, residence: 'commune' }, GRID, RULES).base).toBe(310);
  });

  it('distingue adulte et enfant selon l’âge au début de la saison', () => {
    expect(publicFor('2008-09-01', '2026-09-01', 18)).toBe('adulte');
    expect(publicFor('2008-09-02', '2026-09-01', 18)).toBe('enfant');
  });

  it('fait payer la FM à un adulte qui la suit, selon la grille', () => {
    const p = computePrice({ ...base, public: 'adulte', residence: 'commune' }, GRID, RULES);
    expect(p.fm).toBe(140);
    expect(p.total).toBe(390 + 140 + 20);
  });

  it('suit la grille paramétrée par le bureau', () => {
    const rules = { ...RULES, adhesionAmount: 35, fmIncludedForChildren: false };
    const p = computePrice(base, GRID, rules);
    expect(p.fm).toBe(140);
    expect(p.total).toBe(345 + 140 + 35);
  });

  it('signale une ligne de grille manquante', () => {
    expect(() => computePrice({ ...base, formula: 'inconnue' }, GRID, RULES)).toThrow(PricingError);
  });
});

describe('réduction fratrie', () => {
  it('s’applique à partir du rang paramétré', () => {
    expect(siblingDiscountApplies({ public: 'enfant', siblingRank: 1 }, RULES)).toBe(false);
    expect(siblingDiscountApplies({ public: 'enfant', siblingRank: 2 }, RULES)).toBe(true);
    expect(siblingDiscountApplies({ public: 'enfant', siblingRank: 2 }, { ...RULES, siblingFromRank: 3 })).toBe(false);
    expect(siblingDiscountApplies({ public: 'enfant', siblingRank: 3 }, { ...RULES, siblingFromRank: 3 })).toBe(true);
  });
  it('ne concerne que les enfants si le bureau le décide', () => {
    expect(siblingDiscountApplies({ public: 'adulte', siblingRank: 2 }, RULES)).toBe(false);
    expect(siblingDiscountApplies({ public: 'adulte', siblingRank: 2 }, { ...RULES, siblingChildrenOnly: false })).toBe(true);
  });
  it('a un taux paramétrable, et nul la désactive', () => {
    expect(computePrice({ ...base, siblingRank: 2 }, GRID, { ...RULES, siblingDiscountPct: 15 }).siblingDiscount).toBe(51.75);
    expect(computePrice({ ...base, siblingRank: 2 }, GRID, { ...RULES, siblingDiscountPct: 0 }).siblingDiscount).toBe(0);
  });
  it('porte sur l’instrument et la FM payante, jamais sur l’adhésion', () => {
    const p = computePrice({ ...base, public: 'adulte', residence: 'commune', siblingRank: 2 }, GRID, { ...RULES, siblingChildrenOnly: false });
    expect(p.siblingDiscount).toBe(53);
    expect(p.total).toBe(390 + 140 - 53 + 20);
  });
});
