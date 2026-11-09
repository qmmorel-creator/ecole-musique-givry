// Création d'une inscription ou d'une demande de liste d'attente, avec les règles du domaine.
import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2';
import { planSubmission, type Enrollment, type Plan, type PaymentMethod } from './domain/index.ts';
import { toCourse, toEnrollment, toFeeLine, toFeeRules, toSeason, type CourseRow, type EnrollmentRow, type FeeGridRow, type FeeRulesRow, type SeasonRow } from './mapping.ts';

export async function loadSeasonContext(db: SupabaseClient) {
  const { data: s } = await db.from('seasons').select('*').eq('is_current', true).maybeSingle();
  if (!s) return null;
  const season = toSeason(s as SeasonRow);
  const [courses, grid, rules, enrollments] = await Promise.all([
    db.from('courses').select('*').eq('season_id', season.id),
    db.from('fee_grid').select('*').eq('season_id', season.id),
    db.from('fee_rules').select('*').eq('season_id', season.id).single(),
    db.from('enrollments').select('*').eq('season_id', season.id),
  ]);
  return {
    season,
    courses: (courses.data as CourseRow[]).map(toCourse),
    grid: (grid.data as FeeGridRow[]).map(toFeeLine),
    rules: toFeeRules(rules.data as FeeRulesRow),
    enrollments: (enrollments.data as EnrollmentRow[]).map(toEnrollment),
  };
}

export type SeasonContext = NonNullable<Awaited<ReturnType<typeof loadSeasonContext>>>;

export async function enrollOrWait(db: SupabaseClient, ctx: SeasonContext, a: {
  courseId: string; familyId: string; commune: string; studentId: string; birthDate: string; level: string; slot: string; plan: Plan; method: PaymentMethod;
  imageRights: boolean | null; siblingCheck: Enrollment['siblingCheck']; source: Enrollment['source']; today: string;
}) {
  const course = ctx.courses.find((c) => c.id === a.courseId)!;
  const plan = planSubmission({
    season: ctx.season, course, courses: ctx.courses, grid: ctx.grid, rules: ctx.rules, seasonEnrollments: ctx.enrollments, familyId: a.familyId, siblingCheck: a.siblingCheck,
    birthDate: a.birthDate, commune: a.commune, level: a.level, plan: a.plan, today: a.today,
  });
  const now = new Date().toISOString();
  const { count } = await db.from('enrollments').select('id', { count: 'exact', head: true }).eq('season_id', ctx.season.id);
  const reference = `EMG-${ctx.season.label.slice(2, 4)}-${String((count ?? 0) + 1).padStart(4, '0')}`;
  if (plan.outcome === 'liste_attente') {
    const { error } = await db.from('waitlist').insert({ season_id: ctx.season.id, course_id: course.id, student_id: a.studentId, family_id: a.familyId, level: a.level, slot: a.slot, plan: a.plan, intended_method: a.method, image_rights: a.imageRights, consent_at: now });
    if (error) throw error;
    return { outcome: 'liste_attente' as const, reference, pricing: plan.pricing, installments: [], siblingCheck: a.siblingCheck, course };
  }
  const { data: e, error } = await db.from('enrollments').insert({
    season_id: ctx.season.id, student_id: a.studentId, family_id: a.familyId, course_id: course.id, fm_course_id: plan.fmCourseId, level: a.level, slot: a.slot, status: 'a_valider',
    public: plan.public, residence: plan.residence, sibling_rank: plan.siblingRank, pricing: plan.pricing, total: plan.pricing.total, plan: a.plan, intended_method: a.method, source: a.source,
    sibling_check: a.siblingCheck, image_rights: a.imageRights, image_rights_at: a.imageRights === null ? null : now, rules_accepted_at: now, privacy_ack_at: now,
  }).select('*').single();
  if (error) throw error;
  ctx.enrollments.push(toEnrollment(e as EnrollmentRow));
  const { error: ie } = await db.from('installments').insert(plan.installments.map((i) => ({ enrollment_id: (e as EnrollmentRow).id, family_id: a.familyId, season_id: ctx.season.id, rank: i.rank, count: i.count, due_on: i.dueOn, amount: i.amount })));
  if (ie) throw ie;
  return { outcome: 'inscription' as const, reference, pricing: plan.pricing, installments: plan.installments, siblingCheck: a.siblingCheck, course };
}
