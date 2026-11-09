// Décision côté serveur pour un envoi du formulaire : appliquée par la démonstration et par la fonction Edge.
import type { Course, Enrollment, FeeLine, FeeRules, Plan, PriceBreakdown, Public, Residence, Season, SiblingCheck } from './types.ts';
import { computePrice, publicFor, residenceFor } from './pricing.ts';
import { planInstallments, type PlannedInstallment } from './installments.ts';
import { familyHasAdhesion, needsFm, pickFmCourse, remainingPlaces, siblingRankFor } from './enrollmentRules.ts';

export interface SubmissionContext {
  season: Season;
  course: Course;
  courses: Course[];
  grid: FeeLine[];
  rules: FeeRules;
  /** Inscriptions de la saison (pour les places restantes). */
  seasonEnrollments: Enrollment[];
  /** Famille à laquelle l'élève est rattaché, si elle est connue (fratrie trouvée ou suite d'un envoi). */
  familyId: string | null;
  siblingCheck: SiblingCheck;
  birthDate: string;
  commune: string;
  level: string;
  plan: Plan;
  today: string;
}

export interface SubmissionPlan {
  outcome: 'inscription' | 'liste_attente';
  public: Public;
  residence: Residence;
  siblingRank: number;
  fmCourseId: string | null;
  pricing: PriceBreakdown;
  installments: PlannedInstallment[];
}

export function planSubmission(ctx: SubmissionContext): SubmissionPlan {
  const pub = publicFor(ctx.birthDate, ctx.season.startsOn, ctx.rules.adultAge);
  const residence = residenceFor(ctx.commune, ctx.rules);
  const pubs = new Map<string, Public>();
  const rank = siblingRankFor(ctx.familyId, ctx.season.id, ctx.seasonEnrollments, pubs, ctx.rules, pub);
  const fmCourse = needsFm(ctx.course, pub) ? pickFmCourse(ctx.courses, ctx.season.id, ctx.level) : null;
  const pricing = computePrice(
    {
      formula: ctx.course.formula,
      public: pub,
      residence,
      siblingRank: rank,
      withFm: fmCourse !== null,
      adhesionAlreadyCounted: familyHasAdhesion(ctx.familyId, ctx.season.id, ctx.seasonEnrollments),
    },
    ctx.grid,
    ctx.rules,
  );
  const full = remainingPlaces(ctx.course, ctx.seasonEnrollments) <= 0;
  return {
    outcome: full ? 'liste_attente' : 'inscription',
    public: pub,
    residence,
    siblingRank: rank,
    fmCourseId: fmCourse?.id ?? null,
    pricing,
    installments: full ? [] : planInstallments(pricing.total, ctx.plan, ctx.season.installmentDates, ctx.today),
  };
}
