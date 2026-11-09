// Validation des envois du formulaire public, appliquée côté navigateur et côté serveur.
import type { PaymentMethod, Plan } from './types.ts';
import { ageAt } from './dates.ts';

export interface GuardianInput {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  relation: string;
  address: string;
  postalCode: string;
  commune: string;
}

export interface StudentInput {
  firstName: string;
  lastName: string;
  birthDate: string;
}

export interface InscriptionInput {
  guardian: GuardianInput;
  sibling: { declared: boolean; familyName: string; postalCode: string; email: string };
  student: StudentInput;
  courseId: string;
  level: string;
  slot: string;
  plan: Plan;
  intendedMethod: PaymentMethod;
  imageRights: boolean | null;
  rulesAccepted: boolean;
  privacyAck: boolean;
  /** Champ piège : doit rester vide. */
  website: string;
  /** Inscription d'un autre enfant juste après la première, depuis la page de confirmation. */
  continuationToken?: string;
}

export type Errors = Record<string, string>;

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export const PHONE_RE = /^(?:\+33\s?|0)[1-9](?:[\s.-]?\d{2}){4}$/;
export const POSTAL_RE = /^\d{5}$/;

const req = (v: string | undefined, max = 120) => !!v && v.trim().length > 0 && v.trim().length <= max;

export function validateGuardian(g: GuardianInput): Errors {
  const e: Errors = {};
  if (!req(g.firstName, 60)) e['guardian.firstName'] = 'Indiquez le prénom.';
  if (!req(g.lastName, 60)) e['guardian.lastName'] = 'Indiquez le nom.';
  if (!EMAIL_RE.test(g.email.trim())) e['guardian.email'] = 'Adresse mail invalide.';
  if (!PHONE_RE.test(g.phone.trim())) e['guardian.phone'] = 'Numéro de téléphone invalide (ex. 06 12 34 56 78).';
  if (!req(g.relation, 40)) e['guardian.relation'] = 'Indiquez votre lien avec l’élève.';
  if (!req(g.address, 160)) e['guardian.address'] = 'Indiquez l’adresse.';
  if (!POSTAL_RE.test(g.postalCode.trim())) e['guardian.postalCode'] = 'Code postal à 5 chiffres.';
  if (!req(g.commune, 80)) e['guardian.commune'] = 'Indiquez la commune.';
  return e;
}

export function validateStudent(s: StudentInput, today: string): Errors {
  const e: Errors = {};
  if (!req(s.firstName, 60)) e['student.firstName'] = 'Indiquez le prénom de l’élève.';
  if (!req(s.lastName, 60)) e['student.lastName'] = 'Indiquez le nom de l’élève.';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s.birthDate)) e['student.birthDate'] = 'Indiquez la date de naissance.';
  else {
    const age = ageAt(s.birthDate, today);
    if (age < 3 || age > 100) e['student.birthDate'] = 'Date de naissance improbable.';
  }
  return e;
}

export function validateSibling(s: InscriptionInput['sibling']): Errors {
  const e: Errors = {};
  if (!s.declared) return e;
  if (!req(s.familyName, 60)) e['sibling.familyName'] = 'Indiquez le nom de famille.';
  if (!POSTAL_RE.test(s.postalCode.trim())) e['sibling.postalCode'] = 'Code postal à 5 chiffres.';
  if (!EMAIL_RE.test(s.email.trim())) e['sibling.email'] = 'Adresse mail invalide.';
  return e;
}

export function validateCourse(i: Pick<InscriptionInput, 'courseId' | 'level' | 'slot' | 'plan' | 'intendedMethod' | 'rulesAccepted' | 'privacyAck' | 'imageRights'>): Errors {
  const e: Errors = {};
  if (!i.courseId) e.courseId = 'Choisissez un instrument ou une discipline.';
  if (!i.level) e.level = 'Choisissez le niveau.';
  if (!i.slot) e.slot = 'Choisissez le créneau.';
  if (i.plan !== 1 && i.plan !== 3) e.plan = 'Choisissez le règlement en 1 ou 3 fois.';
  if (!['cheque', 'virement', 'ancv', 'especes'].includes(i.intendedMethod)) e.intendedMethod = 'Choisissez le mode de règlement.';
  if (i.imageRights === null) e.imageRights = 'Répondez à la question sur le droit à l’image.';
  if (!i.rulesAccepted) e.rulesAccepted = 'L’acceptation du règlement intérieur est obligatoire.';
  if (!i.privacyAck) e.privacyAck = 'Merci de confirmer avoir lu les informations sur vos données.';
  return e;
}

export function validateInscription(i: InscriptionInput, today: string): Errors {
  return {
    ...validateGuardian(i.guardian),
    ...validateSibling(i.sibling),
    ...validateStudent(i.student, today),
    ...validateCourse(i),
  };
}

/** Le robot a rempli le champ piège. */
export const isBot = (i: Pick<InscriptionInput, 'website'>): boolean => (i.website ?? '').trim() !== '';
