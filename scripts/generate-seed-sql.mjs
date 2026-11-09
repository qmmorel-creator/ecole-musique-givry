// Génère supabase/seed.sql à partir du jeu d'essai fictif de la démonstration (src/data/demo/seed.ts).
// Lancer avec : node --experimental-strip-types scripts/generate-seed-sql.mjs
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { buildSeed } from '../src/data/demo/seed.ts';

const s = buildSeed();
const uuid = (id) => {
  if (id === null || id === undefined) return null;
  const h = createHash('sha1').update(`emg:${id}`).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-${((parseInt(h[16], 16) & 3) | 8).toString(16)}${h.slice(17, 20)}-${h.slice(20, 32)}`;
};
const q = (v) => {
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'number') return String(v);
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (Array.isArray(v)) return `array[${v.map(q).join(', ')}]::text[]`;
  if (typeof v === 'object') return `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb`;
  return `'${String(v).replace(/'/g, "''")}'`;
};
const j = (v) => `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb`;
const dates = (a) => `array[${a.map(q).join(', ')}]::date[]`;
const out = ['-- Jeu d’essai FICTIF de démonstration (généré par scripts/generate-seed-sql.mjs). Aucune donnée réelle.', 'begin;'];
const insert = (table, cols, rows) => {
  if (!rows.length) return;
  out.push(`insert into public.${table} (${cols.join(', ')}) values`);
  out.push(rows.map((r) => `  (${r.join(', ')})`).join(',\n') + ';');
};

out.push(`update public.settings set school_name = ${q(s.settings.schoolName)}, school_address = ${q(s.settings.schoolAddress)}, school_email = ${q(s.settings.schoolEmail)}, exercise_start_month = ${s.settings.exerciseStartMonth}, exercise_start_day = ${s.settings.exerciseStartDay}, retention_years = ${s.settings.retentionYears}, required_documents = ${q(s.settings.requiredDocuments)};`);
insert('seasons', ['id', 'label', 'starts_on', 'ends_on', 'is_current', 'registration_open', 'installment_dates'], s.seasons.map((x) => [q(uuid(x.id)), q(x.label), q(x.startsOn), q(x.endsOn), q(x.isCurrent), q(x.registrationOpen), dates(x.installmentDates)]));
insert('courses', ['id', 'season_id', 'discipline', 'kind', 'formula', 'teacher', 'slots', 'capacity', 'levels', 'requires_fm', 'abbr', 'color', 'active'], s.courses.map((c) => [q(uuid(c.id)), q(uuid(c.seasonId)), q(c.discipline), q(c.kind), q(c.formula), q(c.teacher), q(c.slots), c.capacity, q(c.levels), q(c.requiresFm), q(c.abbr), q(c.color), q(c.active)]));
insert('fee_grid', ['id', 'season_id', 'formula', 'public', 'residence', 'amount'], s.feeLines.map((l) => [q(uuid(l.id)), q(uuid(l.seasonId)), q(l.formula), q(l.public), q(l.residence), l.amount]));
insert('fee_rules', ['season_id', 'formulas', 'sibling_discount_pct', 'sibling_from_rank', 'sibling_children_only', 'adhesion_amount', 'adult_age', 'communes', 'fm_formula', 'fm_included_for_children'], s.feeRules.map((r) => [q(uuid(r.seasonId)), j(r.formulas), r.siblingDiscountPct, r.siblingFromRank, q(r.siblingChildrenOnly), r.adhesionAmount, r.adultAge, q(r.communes), q(r.fmFormula), q(r.fmIncludedForChildren)]));
insert('families', ['id', 'family_name', 'postal_code', 'commune', 'address', 'sibling_check', 'reinscription_token', 'notes', 'created_at'], s.families.map((f) => [q(uuid(f.id)), q(f.familyName), q(f.postalCode), q(f.commune), q(f.address), q(f.siblingCheck), q(uuid(f.reinscriptionToken)), q(f.notes), q(f.createdAt)]));
insert('guardians', ['id', 'family_id', 'first_name', 'last_name', 'email', 'phone', 'relation', 'is_primary'], s.guardians.map((g) => [q(uuid(g.id)), q(uuid(g.familyId)), q(g.firstName), q(g.lastName), q(g.email), q(g.phone), q(g.relation), q(g.isPrimary)]));
insert('students', ['id', 'family_id', 'first_name', 'last_name', 'birth_date'], s.students.map((x) => [q(uuid(x.id)), q(uuid(x.familyId)), q(x.firstName), q(x.lastName), q(x.birthDate)]));
insert('enrollments', ['id', 'season_id', 'student_id', 'family_id', 'course_id', 'fm_course_id', 'level', 'slot', 'status', 'public', 'residence', 'sibling_rank', 'pricing', 'total', 'plan', 'intended_method', 'source', 'sibling_check', 'image_rights', 'image_rights_at', 'rules_accepted_at', 'privacy_ack_at', 'documents_received', 'created_at', 'validated_at'],
  s.enrollments.map((e) => [q(uuid(e.id)), q(uuid(e.seasonId)), q(uuid(e.studentId)), q(uuid(e.familyId)), q(uuid(e.courseId)), q(uuid(e.fmCourseId)), q(e.level), q(e.slot), q(e.status), q(e.public), q(e.residence), e.siblingRank, q(e.pricing), e.pricing.total, e.plan, q(e.intendedMethod), q(e.source), q(e.siblingCheck), q(e.imageRights), q(e.imageRightsAt), q(e.rulesAcceptedAt), q(e.privacyAckAt), q(e.documentsReceived), q(e.createdAt), q(e.validatedAt)]));
insert('waitlist', ['id', 'season_id', 'course_id', 'student_id', 'family_id', 'level', 'slot', 'plan', 'intended_method', 'image_rights', 'consent_at', 'created_at', 'status', 'proposed_at'], s.waitlist.map((w) => [q(uuid(w.id)), q(uuid(w.seasonId)), q(uuid(w.courseId)), q(uuid(w.studentId)), q(uuid(w.familyId)), q(w.level), q(w.slot), w.plan, q(w.intendedMethod), q(w.imageRights), q(w.consentAt), q(w.createdAt), q(w.status), q(w.proposedAt)]));
insert('installments', ['id', 'enrollment_id', 'family_id', 'season_id', 'rank', 'count', 'due_on', 'amount'], s.installments.map((i) => [q(uuid(i.id)), q(uuid(i.enrollmentId)), q(uuid(i.familyId)), q(uuid(i.seasonId)), i.rank, i.count, q(i.dueOn), i.amount]));
insert('deposit_slips', ['id', 'number', 'created_at', 'deposited_on'], s.depositSlips.map((d) => [q(uuid(d.id)), d.number, q(d.createdAt), q(d.depositedOn)]));
out.push(`select setval('public.deposit_slip_number', ${Math.max(1, ...s.depositSlips.map((d) => d.number))});`);
// Les recettes automatiques sont créées par le déclencheur à l'insertion des règlements encaissés.
insert('payments', ['id', 'installment_id', 'family_id', 'amount', 'method', 'reference', 'bank', 'received_on', 'cashed_on', 'deposit_slip_id', 'created_at'], s.payments.map((p) => [q(uuid(p.id)), q(uuid(p.installmentId)), q(uuid(p.familyId)), p.amount, q(p.method), q(p.reference), q(p.bank), q(p.receivedOn), q(p.cashedOn), q(uuid(p.depositSlipId)), q(p.createdAt)]));
insert('events', ['id', 'season_id', 'name', 'date', 'kind', 'place', 'budget'], s.events.map((e) => [q(uuid(e.id)), q(uuid(e.seasonId)), q(e.name), q(e.date), q(e.kind), q(e.place), e.budget]));
insert('attachments', ['id', 'storage_path', 'filename', 'mime', 'size', 'created_at'], s.attachments.map((a) => [q(uuid(a.id)), q(`demo/${a.filename}`), q(a.filename), q(a.mime), a.size, q(a.createdAt)]));
insert('ledger_entries', ['id', 'date', 'kind', 'category_id', 'amount', 'label', 'event_id', 'method', 'attachment_id', 'source', 'created_at'], s.entries.filter((e) => e.source === 'manuel').map((e) => [q(uuid(e.id)), q(e.date), q(e.kind), q(e.categoryId), e.amount, q(e.label), q(uuid(e.eventId)), q(e.method), q(uuid(e.attachmentId)), q('manuel'), q(e.createdAt)]));
out.push('commit;', '');
writeFileSync('supabase/seed.sql', out.join('\n'));
console.log(`supabase/seed.sql : ${s.families.length} familles, ${s.enrollments.length} inscriptions, ${s.payments.length} règlements (fictifs)`);
