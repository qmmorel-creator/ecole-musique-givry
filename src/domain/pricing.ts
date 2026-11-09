// Calcul du tarif selon la grille paramétrable du bureau.
import type { FeeLine, FeeRules, PriceBreakdown, PriceLine, Public, Residence } from './types.ts';
import { ageAt } from './dates.ts';
import { round2 } from './money.ts';

export interface PricingInput {
  formula: string;
  public: Public;
  residence: Residence;
  /** Rang de l'élève dans la fratrie inscrite sur la saison (1 = premier). */
  siblingRank: number;
  /** La formation musicale est ajoutée d'office. */
  withFm: boolean;
  /** L'adhésion familiale est déjà due par une autre inscription de la famille sur la saison. */
  adhesionAlreadyCounted: boolean;
}

export class PricingError extends Error {}

export function publicFor(birthDate: string, seasonStart: string, adultAge: number): Public {
  return ageAt(birthDate, seasonStart) >= adultAge ? 'adulte' : 'enfant';
}

const norm = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[-'’]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

export function residenceFor(commune: string, rules: FeeRules): Residence {
  const c = norm(commune);
  return rules.communes.some((x) => norm(x) === c) ? 'commune' : 'hors_commune';
}

export function findFee(grid: FeeLine[], formula: string, pub: Public, residence: Residence): number {
  const line = grid.find((l) => l.formula === formula && l.public === pub && l.residence === residence);
  if (!line) throw new PricingError(`Aucune ligne de grille pour ${formula} / ${pub} / ${residence}`);
  return line.amount;
}

export function formulaLabel(rules: FeeRules, code: string): string {
  return rules.formulas.find((f) => f.code === code)?.label ?? code;
}

/** Applique-t-on la réduction fratrie à cet élève ? */
export function siblingDiscountApplies(input: Pick<PricingInput, 'public' | 'siblingRank'>, rules: FeeRules): boolean {
  if (rules.siblingDiscountPct <= 0) return false;
  if (rules.siblingChildrenOnly && input.public !== 'enfant') return false;
  return input.siblingRank >= rules.siblingFromRank;
}

export function computePrice(input: PricingInput, grid: FeeLine[], rules: FeeRules): PriceBreakdown {
  const lines: PriceLine[] = [];
  const base = findFee(grid, input.formula, input.public, input.residence);
  lines.push({ label: formulaLabel(rules, input.formula), amount: base, kind: 'base' });

  let fm = 0;
  if (input.withFm) {
    const included = rules.fmIncludedForChildren && input.public === 'enfant';
    fm = included ? 0 : findFee(grid, rules.fmFormula, input.public, input.residence);
    lines.push({ label: 'Formation musicale', amount: fm, kind: 'fm', note: included ? 'incluse' : undefined });
  }

  let siblingDiscount = 0;
  if (siblingDiscountApplies(input, rules)) {
    siblingDiscount = round2(((base + fm) * rules.siblingDiscountPct) / 100);
    lines.push({
      label: `Réduction fratrie (−${rules.siblingDiscountPct} %)`,
      amount: -siblingDiscount,
      kind: 'reduction',
    });
  }

  const adhesion = input.adhesionAlreadyCounted ? 0 : rules.adhesionAmount;
  lines.push({
    label: 'Adhésion familiale',
    amount: adhesion,
    kind: 'adhesion',
    note: input.adhesionAlreadyCounted ? 'déjà comptée pour la famille' : undefined,
  });

  const total = round2(base + fm - siblingDiscount + adhesion);
  return { lines, base, fm, siblingDiscount, adhesion, total };
}
