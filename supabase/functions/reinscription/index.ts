// Réinscription par lien personnel : GET ?token= lit les élèves de la famille, POST réinscrit.
import { cors, fail, ipKey, json, todayParis } from '../_shared/http.ts';
import { allow, audit, serviceClient } from '../_shared/db.ts';
import { sendMail } from '../_shared/mail.ts';
import { enrollOrWait, loadSeasonContext } from '../_shared/enroll.ts';
import { confirmationMail, validateCourse, type PaymentMethod, type Plan } from '../_shared/domain/index.ts';

const UUID = /^[0-9a-f-]{36}$/i;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const db = serviceClient();
  if (!(await allow(db, await ipKey(req, 'reinscription'), 30, 600))) return fail('Trop de tentatives. Réessayez plus tard.', 429);
  const url = new URL(req.url);
  const body = req.method === 'POST' ? await req.json().catch(() => null) as { token: string; choices: { studentId: string; courseId: string; level: string; slot: string }[]; plan: Plan; intendedMethod: PaymentMethod; imageRights: boolean; rulesAccepted: boolean; privacyAck: boolean } | null : null;
  const token = req.method === 'GET' ? url.searchParams.get('token') ?? '' : body?.token ?? '';
  if (!UUID.test(token)) return fail('Lien invalide', 404);
  const { data: family } = await db.from('families').select('*').eq('reinscription_token', token).maybeSingle();
  if (!family) return fail('Lien invalide ou expiré', 404);
  const ctx = await loadSeasonContext(db);
  if (!ctx) return fail('Aucune saison ouverte');
  const { data: guardian } = await db.from('guardians').select('*').eq('family_id', family.id).order('is_primary', { ascending: false }).limit(1).maybeSingle();
  const { data: students } = await db.from('students').select('*').eq('family_id', family.id);

  if (req.method === 'GET') {
    const { data: pastRows } = await db.from('enrollments').select('student_id, level, course_id, created_at').eq('family_id', family.id).neq('status', 'annulee').order('created_at', { ascending: false });
    const { data: pastCourses } = await db.from('courses').select('id, discipline, season_id').in('id', (pastRows ?? []).map((p: { course_id: string }) => p.course_id));
    const past = (pastRows ?? []).map((p: { student_id: string; level: string; course_id: string }) => ({ ...p, courses: (pastCourses ?? []).find((c: { id: string }) => c.id === p.course_id) as { discipline: string; season_id: string } }));
    const out = [];
    for (const s of students ?? []) {
      if (ctx.enrollments.some((e) => e.studentId === s.id && e.status !== 'annulee')) continue;
      const last = past.find((p) => p.student_id === s.id && p.courses && p.courses.season_id !== ctx.season.id);
      if (!last) continue;
      const same = ctx.courses.find((c) => c.discipline === last.courses.discipline && c.active);
      out.push({ studentId: s.id, firstName: s.first_name, previousDiscipline: last.courses.discipline, previousLevel: last.level, previousCourseId: same?.id ?? null });
    }
    return json({ familyName: family.family_name, guardianFirstName: guardian?.first_name ?? '', guardianEmail: guardian?.email ?? '', commune: family.commune, season: ctx.season, students: out });
  }

  if (req.method !== 'POST' || !body) return fail('Requête invalide');
  if (!ctx.season.registrationOpen) return fail('Les inscriptions ne sont pas ouvertes.');
  if (!Array.isArray(body.choices) || !body.choices.length) return fail('Choisissez au moins un élève à réinscrire.');
  const today = todayParis();
  const results = [];
  for (const ch of body.choices) {
    const errs = validateCourse({ ...ch, plan: body.plan, intendedMethod: body.intendedMethod, rulesAccepted: body.rulesAccepted, privacyAck: body.privacyAck, imageRights: body.imageRights });
    if (Object.keys(errs).length) return fail('Certaines informations sont à corriger.', 400, errs);
    const st = (students ?? []).find((s: { id: string }) => s.id === ch.studentId);
    const course = ctx.courses.find((c) => c.id === ch.courseId && c.active && c.kind !== 'fm');
    if (!st || !course || !course.levels.includes(ch.level) || !course.slots.includes(ch.slot)) return fail('Élève ou cours inconnu.');
    const siblingCheck = family.sibling_check === 'a_verifier' ? 'a_verifier' : ctx.enrollments.some((e) => e.familyId === family.id) ? 'validee' : 'aucun';
    const r = await enrollOrWait(db, ctx, { courseId: course.id, familyId: family.id, commune: family.commune, studentId: st.id, birthDate: st.birth_date, level: ch.level, slot: ch.slot, plan: body.plan, method: body.intendedMethod, imageRights: body.imageRights, siblingCheck, source: 'reinscription', today });
    results.push({ outcome: r.outcome, reference: r.reference, pricing: r.pricing, installments: r.installments, siblingCheck, continuationToken: '' });
    if (guardian) {
      const m = confirmationMail({ guardianFirstName: guardian.first_name, studentFirstName: st.first_name, discipline: course.discipline, season: ctx.season.label, reference: r.reference, outcome: r.outcome, pricing: r.pricing, installments: r.installments, siblingCheck });
      let sent = true;
      try { await sendMail(guardian.email, m.subject, m.body); } catch (e) { sent = false; console.error(e); }
      await db.from('mail_outbox').insert({ to_email: guardian.email, subject: m.subject, body: m.body, kind: 'confirmation', status: sent ? 'envoye' : 'brouillon', sent_at: sent ? new Date().toISOString() : null });
    }
    await audit(db, 'Réinscription en ligne', 'Réinscription reçue', 'enrollments', `${st.first_name} ${st.last_name} · ${course.discipline}`);
  }
  return json(results);
});
