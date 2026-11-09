// Données dérivées pour les écrans du bureau, calculées une fois par instantané.
import { useMemo } from 'react';
import type { Snapshot } from '../data/index.ts';
import type { Course, Enrollment, Family, Guardian, Installment, InstallmentState, Payment, Season, Student } from '../domain/index.ts';
import { ageAt, dossierState, enrolledCount, installmentState, sum, waitlistFor } from '../domain/index.ts';
import { useStore } from '../store.tsx';

export interface InstallmentRow extends Installment { state: InstallmentState; family: Family; student: Student; enrollment: Enrollment; payments: Payment[] }

export interface Derived {
  season: Season;
  families: Map<string, Family>;
  students: Map<string, Student>;
  courses: Map<string, Course>;
  guardiansByFamily: Map<string, Guardian[]>;
  seasonEnrollments: Enrollment[];
  activeEnrollments: Enrollment[];
  installments: InstallmentRow[];
  instById: Map<string, InstallmentRow>;
  courseFill: { course: Course; enrolled: number; remaining: number; waiting: number }[];
  expected: number;
  cashed: number;
  toHandIn: Payment[];
  late: InstallmentRow[];
  incomplete: Enrollment[];
  toValidate: Enrollment[];
  siblingChecks: Family[];
  familyLabel: (familyId: string) => string;
  ageOf: (s: Student) => number;
}

export function derive(snap: Snapshot, today: string, seasonId?: string): Derived {
  const season = snap.seasons.find((s) => s.id === seasonId) ?? snap.seasons.find((s) => s.isCurrent) ?? snap.seasons[snap.seasons.length - 1];
  const families = new Map(snap.families.map((f) => [f.id, f]));
  const students = new Map(snap.students.map((s) => [s.id, s]));
  const courses = new Map(snap.courses.map((c) => [c.id, c]));
  const enr = new Map(snap.enrollments.map((e) => [e.id, e]));
  const guardiansByFamily = new Map<string, Guardian[]>();
  for (const g of snap.guardians) guardiansByFamily.set(g.familyId, [...(guardiansByFamily.get(g.familyId) ?? []), g]);
  const seasonEnrollments = snap.enrollments.filter((e) => e.seasonId === season.id);
  const activeEnrollments = seasonEnrollments.filter((e) => e.status !== 'annulee');
  const payBy = new Map<string, Payment[]>();
  for (const p of snap.payments) payBy.set(p.installmentId, [...(payBy.get(p.installmentId) ?? []), p]);
  const installments: InstallmentRow[] = snap.installments.filter((i) => i.seasonId === season.id).flatMap((i) => {
    const e = enr.get(i.enrollmentId);
    const f = families.get(i.familyId);
    const s = e && students.get(e.studentId);
    if (!e || !f || !s || e.status === 'annulee' && !payBy.get(i.id)) return [];
    return [{ ...i, state: installmentState(i, snap.payments, today), family: f, student: s, enrollment: e, payments: payBy.get(i.id) ?? [] }];
  }).sort((a, b) => a.dueOn.localeCompare(b.dueOn) || a.family.familyName.localeCompare(b.family.familyName));
  const instById = new Map(installments.map((i) => [i.id, i]));
  const courseFill = snap.courses.filter((c) => c.seasonId === season.id && c.active).map((course) => {
    const enrolled = enrolledCount(course.id, activeEnrollments);
    return { course, enrolled, remaining: Math.max(0, course.capacity - enrolled), waiting: waitlistFor(course.id, snap.waitlist).length };
  });
  const seasonPayIds = new Set(installments.map((i) => i.id));
  const toHandIn = snap.payments.filter((p) => seasonPayIds.has(p.installmentId) && !p.cashedOn && !p.depositSlipId && p.method !== 'virement' && (instById.get(p.installmentId)?.dueOn ?? '') <= today);
  return {
    season, families, students, courses, guardiansByFamily, seasonEnrollments, activeEnrollments, installments, instById, courseFill,
    expected: sum(installments.map((i) => i.amount)),
    cashed: sum(installments.map((i) => i.state.cashed)),
    toHandIn,
    late: installments.filter((i) => i.state.status === 'en_retard'),
    incomplete: activeEnrollments.filter((e) => !dossierState(e, snap.settings.requiredDocuments).complete),
    toValidate: activeEnrollments.filter((e) => e.status === 'a_valider'),
    siblingChecks: snap.families.filter((f) => f.siblingCheck === 'a_verifier'),
    familyLabel: (id) => `Famille ${families.get(id)?.familyName ?? '—'}`,
    ageOf: (s) => ageAt(s.birthDate, today),
  };
}

export function useDerived(seasonId?: string): Derived {
  const { snap, today } = useStore();
  return useMemo(() => derive(snap!, today, seasonId), [snap, today, seasonId]);
}
