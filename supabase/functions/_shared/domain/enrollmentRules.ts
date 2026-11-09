// Règles d'inscription : places, liste d'attente, formation musicale, rang dans la fratrie, dossier.
import type { Course, Enrollment, FeeRules, Public, WaitlistEntry } from './types.ts';

export function enrolledCount(courseId: string, enrollments: Enrollment[]): number {
  return enrollments.filter((e) => e.status !== 'annulee' && (e.courseId === courseId || e.fmCourseId === courseId)).length;
}

export function remainingPlaces(course: Course, enrollments: Enrollment[]): number {
  return Math.max(0, course.capacity - enrolledCount(course.id, enrollments));
}

export function waitlistFor(courseId: string, waitlist: WaitlistEntry[]): WaitlistEntry[] {
  return waitlist
    .filter((w) => w.courseId === courseId && (w.status === 'en_attente' || w.status === 'proposee'))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

/** La FM s'ajoute d'office pour un enfant inscrit dans un cours qui l'exige. */
export function needsFm(course: Course, pub: Public): boolean {
  return course.requiresFm && pub === 'enfant';
}

/** Cours de FM correspondant : le premier cours de FM actif de la saison qui propose ce niveau, sinon le premier. */
export function pickFmCourse(courses: Course[], seasonId: string, level: string): Course | null {
  const fm = courses.filter((c) => c.kind === 'fm' && c.active && c.seasonId === seasonId);
  return fm.find((c) => c.levels.includes(level)) ?? fm[0] ?? null;
}

/** Rang du nouvel élève dans la fratrie de la saison (1 = premier). */
export function siblingRankFor(familyId: string | null, seasonId: string, enrollments: Enrollment[], pubs: Map<string, Public>, rules: FeeRules, newPublic: Public): number {
  if (!familyId) return 1;
  const counted = new Set(
    enrollments
      .filter((e) => e.familyId === familyId && e.seasonId === seasonId && e.status !== 'annulee')
      .filter((e) => !rules.siblingChildrenOnly || (pubs.get(e.studentId) ?? e.public) === 'enfant')
      .map((e) => e.studentId),
  );
  // Un adulte n'ouvre pas droit à la réduction si seuls les enfants comptent : son rang est sans effet.
  void newPublic;
  return counted.size + 1;
}

export function familyHasAdhesion(familyId: string | null, seasonId: string, enrollments: Enrollment[]): boolean {
  if (!familyId) return false;
  return enrollments.some((e) => e.familyId === familyId && e.seasonId === seasonId && e.status !== 'annulee' && e.pricing.adhesion > 0);
}

export interface DossierState {
  complete: boolean;
  missing: string[];
}

export function dossierState(e: Enrollment, requiredDocuments: string[]): DossierState {
  const missing: string[] = [];
  if (e.imageRights === null) missing.push('droit à l’image');
  if (!e.rulesAcceptedAt) missing.push('règlement intérieur');
  if (e.siblingCheck === 'a_verifier') missing.push('rattachement à vérifier');
  for (const d of requiredDocuments) if (!e.documentsReceived.includes(d)) missing.push(d.toLowerCase());
  return { complete: missing.length === 0, missing };
}
