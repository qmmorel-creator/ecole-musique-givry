// Envoi du formulaire public : champ piège, limite par adresse IP, validation et tarif côté serveur.
import { cors, fail, ipKey, json, todayParis } from '../_shared/http.ts';
import { allow, audit, serviceClient } from '../_shared/db.ts';
import { sendMail } from '../_shared/mail.ts';
import { enrollOrWait, loadSeasonContext } from '../_shared/enroll.ts';
import { confirmationMail, isBot, normalizeEmail, normalizeName, validateInscription, type InscriptionInput, type SiblingCheck } from '../_shared/domain/index.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return fail('Méthode non autorisée', 405);
  const db = serviceClient();
  if (!(await allow(db, await ipKey(req, 'inscription'), 8, 600))) return fail('Trop d’envois depuis cette connexion. Réessayez dans quelques minutes.', 429);
  const input = await req.json().catch(() => null) as InscriptionInput | null;
  if (!input) return fail('Requête invalide');
  if (isBot(input)) return json({ outcome: 'inscription', reference: 'EMG-0000', pricing: { lines: [], base: 0, fm: 0, siblingDiscount: 0, adhesion: 0, total: 0 }, installments: [], siblingCheck: 'aucun', continuationToken: '' });
  const today = todayParis();
  const errors = validateInscription(input, today);
  if (Object.keys(errors).length) return fail('Certaines informations sont à corriger.', 400, errors);

  const ctx = await loadSeasonContext(db);
  if (!ctx || !ctx.season.registrationOpen) return fail('Les inscriptions ne sont pas ouvertes.');
  const course = ctx.courses.find((c) => c.id === input.courseId && c.active && c.kind !== 'fm');
  if (!course) return fail('Ce cours n’est pas proposé.', 400, { courseId: 'Choisissez un cours de la liste.' });
  if (!course.levels.includes(input.level)) return fail('Niveau inconnu.', 400, { level: 'Choisissez un niveau de la liste.' });
  if (!course.slots.includes(input.slot)) return fail('Créneau inconnu.', 400, { slot: 'Choisissez un créneau de la liste.' });

  const g = input.guardian;
  let familyId: string | null = null;
  let commune = g.commune.trim();
  let siblingCheck: SiblingCheck = 'aucun';
  if (input.continuationToken) {
    const { data } = await db.from('families').select('id, commune, sibling_check').eq('continuation_token', input.continuationToken).gt('continuation_expires', new Date().toISOString()).maybeSingle();
    if (data) { familyId = data.id; commune = data.commune; siblingCheck = data.sibling_check === 'a_verifier' ? 'a_verifier' : 'trouvee'; }
  }
  if (!familyId && input.sibling.declared) {
    const { data: found } = await db.rpc('sibling_lookup', { p_family_name: input.sibling.familyName, p_postal_code: input.sibling.postalCode, p_email: input.sibling.email });
    if (found === true) {
      const { data: fams } = await db.from('families').select('id, family_name, commune').eq('postal_code', input.sibling.postalCode.trim());
      const candidates = (fams ?? []).filter((f: { family_name: string }) => normalizeName(f.family_name) === normalizeName(input.sibling.familyName));
      const { data: gs } = await db.from('guardians').select('family_id, email').in('family_id', candidates.map((f: { id: string }) => f.id));
      const hit = candidates.find((f: { id: string }) => (gs ?? []).some((x: { family_id: string; email: string }) => x.family_id === f.id && normalizeEmail(x.email) === normalizeEmail(input.sibling.email))) as { id: string; commune: string } | undefined;
      const match = hit ? { family_id: hit.id, families: { commune: hit.commune } } : undefined;
      if (match) { familyId = match.family_id; commune = match.families.commune; siblingCheck = 'trouvee'; }
    }
    if (!familyId) siblingCheck = 'a_verifier';
  } else if (!familyId) {
    const { data: dup } = await db.rpc('sibling_lookup', { p_family_name: g.lastName, p_postal_code: g.postalCode, p_email: g.email });
    if (dup === true) siblingCheck = 'a_verifier'; // famille déjà connue mais non déclarée : le bureau vérifiera
  }
  if (!familyId) {
    const { data, error } = await db.from('families').insert({ family_name: (input.sibling.declared ? input.sibling.familyName : g.lastName).trim(), postal_code: g.postalCode.trim(), commune, address: g.address.trim(), sibling_check: siblingCheck === 'a_verifier' ? 'a_verifier' : 'aucun' }).select('id').single();
    if (error) return fail('Enregistrement impossible', 500);
    familyId = data.id;
  }
  const { data: guardians } = await db.from('guardians').select('email').eq('family_id', familyId);
  if (!(guardians ?? []).some((x: { email: string }) => normalizeEmail(x.email) === normalizeEmail(g.email))) {
    await db.from('guardians').insert({ family_id: familyId, first_name: g.firstName.trim(), last_name: g.lastName.trim(), email: g.email.trim(), phone: g.phone.trim(), relation: g.relation.trim(), is_primary: !(guardians ?? []).length });
  }
  const { data: students } = await db.from('students').select('id, first_name, birth_date').eq('family_id', familyId);
  let studentId = (students ?? []).find((x: { first_name: string; birth_date: string }) => normalizeName(x.first_name) === normalizeName(input.student.firstName) && x.birth_date === input.student.birthDate)?.id as string | undefined;
  if (!studentId) {
    const { data, error } = await db.from('students').insert({ family_id: familyId, first_name: input.student.firstName.trim(), last_name: input.student.lastName.trim(), birth_date: input.student.birthDate }).select('id').single();
    if (error) return fail('Enregistrement impossible', 500);
    studentId = data.id;
  } else if (ctx.enrollments.some((e) => e.studentId === studentId && e.courseId === course.id && e.status !== 'annulee')) {
    return fail('Cet élève est déjà inscrit à ce cours pour la saison.');
  }

  const res = await enrollOrWait(db, ctx, { courseId: course.id, familyId: familyId!, commune, studentId: studentId!, birthDate: input.student.birthDate, level: input.level, slot: input.slot, plan: input.plan, method: input.intendedMethod, imageRights: input.imageRights, siblingCheck, source: 'en_ligne', today });
  const continuationToken = crypto.randomUUID();
  await db.from('families').update({ continuation_token: continuationToken, continuation_expires: new Date(Date.now() + 2 * 3600_000).toISOString() }).eq('id', familyId);

  const m = confirmationMail({ guardianFirstName: g.firstName.trim(), studentFirstName: input.student.firstName.trim(), discipline: course.discipline, season: ctx.season.label, reference: res.reference, outcome: res.outcome, pricing: res.pricing, installments: res.installments, siblingCheck });
  let sent = true;
  try { await sendMail(g.email.trim(), m.subject, m.body); } catch (e) { sent = false; console.error(e); }
  await db.from('mail_outbox').insert({ to_email: g.email.trim(), subject: m.subject, body: m.body, kind: 'confirmation', status: sent ? 'envoye' : 'brouillon', sent_at: sent ? new Date().toISOString() : null });
  await audit(db, 'Formulaire en ligne', res.outcome === 'liste_attente' ? 'Demande de liste d’attente' : 'Inscription reçue', 'enrollments', `${input.student.firstName} ${input.student.lastName} · ${course.discipline}${siblingCheck === 'a_verifier' ? ' · rattachement à vérifier' : ''}`);
  return json({ outcome: res.outcome, reference: res.reference, pricing: res.pricing, installments: res.installments, siblingCheck, continuationToken });
});
