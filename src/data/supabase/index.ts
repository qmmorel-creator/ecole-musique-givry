// Implémentation « supabase » de la couche de données. Écrite et typée, activée par VITE_DATA_SOURCE=supabase (phase 2).
// La clé anon/publishable seule est utilisée côté navigateur ; la clé service_role reste dans les fonctions Edge.
import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  DataSource, LedgerEntryInput, PaymentInput, PublicApi, PublicCatalog, PurgePreview, ReinscriptionData, ReinscriptionInput, Session, Snapshot, StaffApi, SubmitResult,
} from '../api.ts';
import { ApiError } from '../api.ts';
import type { Course, Enrollment, Role } from '../../domain/types.ts';
import { installmentState, planInstallments, planSubmission, placeOfferMail, reinscriptionMail, reminderMail, remainingPlaces, todayIso, type InscriptionInput, type SiblingQuery } from '../../domain/index.ts';
import {
  fromCourse, fromEnrollment, fromFeeRules, fromSeason, fromSettings, toAttachment, toAudit, toCategory, toCourse, toEnrollment, toEntry, toEvent, toFamily, toFeeLine, toFeeRules,
  toGuardian, toInstallment, toMail, toPayment, toSeason, toSettings, toSlip, toStaff, toStudent, toWaitlist, type Database, type PaymentRow,
} from './mapping.ts';

type Client = SupabaseClient<Database>;
let clientPromise: Promise<Client> | null = null;

function client(): Promise<Client> {
  if (!clientPromise) {
    const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
    const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
    if (!url || !key) throw new ApiError('Configuration Supabase manquante (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY).');
    clientPromise = import('@supabase/supabase-js').then(({ createClient }) => createClient<Database>(url, key, { auth: { persistSession: true, detectSessionInUrl: true, flowType: 'pkce' } }));
  }
  return clientPromise;
}

const siteUrl = () => (import.meta.env.VITE_SITE_URL as string | undefined) ?? location.origin;

/** Lève l'erreur éventuelle ; les appels qui lisent le résultat font un select, donc data est renseigné. */
function check<T>(res: { data: T; error: { message: string } | null }): NonNullable<T> {
  if (res.error) throw new ApiError(res.error.message);
  return res.data as NonNullable<T>;
}

/** Appel d'une fonction Edge ; les erreurs de validation reviennent avec le détail par champ. */
async function edge<T>(name: string, body?: unknown, method: 'POST' | 'GET' = 'POST', query = ''): Promise<T> {
  const sb = await client();
  const { data, error } = await sb.functions.invoke(`${name}${query}`, { body: body as Record<string, unknown> | undefined, method });
  if (error) {
    let payload: { message?: string; fieldErrors?: Record<string, string> } = {};
    try { payload = await (error as { context?: Response }).context?.json(); } catch { /* corps non JSON */ }
    throw new ApiError(payload.message ?? error.message, payload.fieldErrors);
  }
  return data as T;
}

export function createSupabaseSource(): DataSource {
  let snapshot: Snapshot | null = null;

  const publicApi: PublicApi = {
    async getCatalog(): Promise<PublicCatalog> {
      const sb = await client();
      const raw = check(await sb.rpc('public_catalog')) as {
        season: Parameters<typeof toSeason>[0]; courses: (Omit<Parameters<typeof toCourse>[0], 'season_id' | 'capacity' | 'active'> & { remaining: number })[];
        grid: Parameters<typeof toFeeLine>[0][]; rules: Parameters<typeof toFeeRules>[0]; settings: { school_name: string; school_email: string; retention_years: number };
      };
      if (!raw?.season) throw new ApiError('Aucune saison ouverte.');
      const courses = raw.courses.map((c) => ({ id: c.id, discipline: c.discipline, kind: c.kind, formula: c.formula, teacher: c.teacher, slots: c.slots, levels: c.levels, requiresFm: c.requires_fm, abbr: c.abbr, color: c.color, remaining: c.remaining }));
      return {
        season: toSeason(raw.season), courses: courses.filter((c) => c.kind !== 'fm'), fmCourses: courses.filter((c) => c.kind === 'fm'),
        grid: raw.grid.map(toFeeLine), rules: toFeeRules(raw.rules),
        settings: { schoolName: raw.settings.school_name, schoolEmail: raw.settings.school_email, retentionYears: raw.settings.retention_years },
      };
    },
    lookupSibling: (q: SiblingQuery) => edge<{ found: boolean }>('recherche-fratrie', q),
    submitInscription: (input: InscriptionInput) => edge<SubmitResult>('inscription', input),
    async getReinscription(token: string): Promise<ReinscriptionData | null> {
      try { return await edge<ReinscriptionData>('reinscription', undefined, 'GET', `?token=${encodeURIComponent(token)}`); } catch { return null; }
    },
    submitReinscription: (token: string, input: ReinscriptionInput) => edge<SubmitResult[]>('reinscription', { token, ...input }),
  };

  async function session(): Promise<Session | null> {
    const sb = await client();
    const { data } = await sb.auth.getSession();
    const uid = data.session?.user.id;
    if (!uid) return null;
    const { data: row } = await sb.from('staff_profiles').select('*').eq('id', uid).eq('active', true).maybeSingle();
    return row ? { staff: toStaff(row) } : null;
  }
  async function me() {
    const s = await session();
    if (!s) throw new ApiError('Connexion requise.');
    return s.staff;
  }
  const snap = () => { if (!snapshot) throw new ApiError('Données non chargées.'); return snapshot; };

  /** Envoie des mails déjà validés par une personne du bureau (fonction Edge, via Resend). */
  async function queueAndSend(rows: { to_email: string; subject: string; body: string; kind: Database['public']['Tables']['mail_outbox']['Row']['kind'] }[]) {
    if (!rows.length) return;
    const sb = await client();
    const ids = check(await sb.from('mail_outbox').insert(rows.map((r) => ({ ...r, status: 'brouillon' as const }))).select('id')).map((r) => r.id);
    await edge('envoyer-mails', { ids });
  }

  async function insertEnrollmentWithInstallments(e: Omit<Enrollment, 'id'>, dates: string[]) {
    const sb = await client();
    const row = check(await sb.from('enrollments').insert(fromEnrollment(e)).select('id').single());
    const plan = planInstallments(e.pricing.total, e.plan, dates, e.createdAt.slice(0, 10));
    check(await sb.from('installments').insert(plan.map((i) => ({ enrollment_id: row.id, family_id: e.familyId, season_id: e.seasonId, rank: i.rank, count: i.count, due_on: i.dueOn, amount: i.amount }))));
  }

  /** Recalcule tarifs et échéances non réglés d'une famille après rattachement (mêmes règles que la démonstration). */
  async function repriceFamily(familyId: string) {
    const sb = await client();
    const s = await staffApi.load();
    for (const season of s.seasons) {
      const list = s.enrollments.filter((e) => e.familyId === familyId && e.seasonId === season.id && e.status !== 'annulee').sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      const done: Enrollment[] = [];
      for (const e of list) {
        const paid = s.payments.some((p) => s.installments.find((i) => i.id === p.installmentId)?.enrollmentId === e.id);
        const course = s.courses.find((c) => c.id === e.courseId)!;
        const student = s.students.find((x) => x.id === e.studentId)!;
        const fam = s.families.find((f) => f.id === familyId)!;
        const others = [...done, ...s.enrollments.filter((x) => x.seasonId === season.id && x.familyId !== familyId)];
        const plan = planSubmission({ season, course, courses: s.courses, grid: s.feeLines.filter((l) => l.seasonId === season.id), rules: s.feeRules.find((r) => r.seasonId === season.id)!, seasonEnrollments: others, familyId, siblingCheck: e.siblingCheck, birthDate: student.birthDate, commune: fam.commune, level: e.level, plan: e.plan, today: e.createdAt.slice(0, 10) });
        if (!paid) {
          check(await sb.from('enrollments').update({ pricing: plan.pricing, total: plan.pricing.total, sibling_rank: plan.siblingRank, residence: plan.residence }).eq('id', e.id));
          check(await sb.from('installments').delete().eq('enrollment_id', e.id));
          const inst = planInstallments(plan.pricing.total, e.plan, season.installmentDates, e.createdAt.slice(0, 10));
          check(await sb.from('installments').insert(inst.map((i) => ({ enrollment_id: e.id, family_id: familyId, season_id: season.id, rank: i.rank, count: i.count, due_on: i.dueOn, amount: i.amount }))));
          e.pricing = plan.pricing;
        }
        done.push(e);
      }
    }
  }

  const staffApi: StaffApi = {
    loginMode: 'magic_link',
    getSession: session,
    async signInWithRole() { throw new ApiError('Connexion par lien magique uniquement.'); },
    async sendMagicLink(email: string) {
      const sb = await client();
      const { error } = await sb.auth.signInWithOtp({ email: email.trim(), options: { shouldCreateUser: false, emailRedirectTo: `${siteUrl()}/bureau` } });
      // Réponse identique que le compte existe ou non, pour ne rien révéler.
      if (error && !/not allowed|signups/i.test(error.message)) throw new ApiError('Envoi impossible pour le moment. Réessayez plus tard.');
    },
    async signOut() { const sb = await client(); await sb.auth.signOut(); snapshot = null; },

    async load(): Promise<Snapshot> {
      await me();
      const sb = await client();
      const all = async <K extends keyof Database['public']['Tables']>(t: K, order = 'id') => {
        const out: Database['public']['Tables'][K]['Row'][] = [];
        for (let from = 0; ; from += 1000) {
          const page = check(await sb.from(t).select('*').order(order).range(from, from + 999)) as unknown as Database['public']['Tables'][K]['Row'][];
          out.push(...page);
          if (page.length < 1000) return out;
        }
      };
      const [seasons, families, guardians, students, courses, enrollments, waitlist, grid, rules, installments, payments, slips, categories, entries, events, attachments, staff, mails, settings] = await Promise.all([
        all('seasons', 'starts_on'), all('families'), all('guardians'), all('students'), all('courses'), all('enrollments', 'created_at'), all('waitlist', 'created_at'), all('fee_grid'),
        all('fee_rules', 'season_id'), all('installments'), all('payments'), all('deposit_slips', 'number'), all('ledger_categories'), all('ledger_entries', 'date'), all('events', 'date'),
        all('attachments'), all('staff_profiles'), all('mail_outbox', 'created_at'), all('settings'),
      ]);
      const audit = check(await sb.from('audit_log').select('*').order('at', { ascending: false }).limit(2000));
      snapshot = {
        seasons: seasons.map(toSeason), families: families.map(toFamily), guardians: guardians.map(toGuardian), students: students.map(toStudent), courses: courses.map(toCourse),
        enrollments: enrollments.map(toEnrollment), waitlist: waitlist.map(toWaitlist), feeLines: grid.map(toFeeLine), feeRules: rules.map(toFeeRules), installments: installments.map(toInstallment),
        payments: payments.map(toPayment), depositSlips: slips.map((r) => toSlip(r, payments as PaymentRow[])), categories: categories.map(toCategory), entries: entries.map(toEntry),
        events: events.map(toEvent), attachments: attachments.map(toAttachment), staff: staff.map(toStaff), audit: audit.map(toAudit), mails: mails.map(toMail).reverse(), settings: toSettings(settings[0]),
      };
      return snapshot;
    },

    async validateEnrollment(id) {
      const e = snap().enrollments.find((x) => x.id === id);
      if (e?.siblingCheck === 'a_verifier') throw new ApiError('Vérifiez d’abord le rattachement de la famille.');
      const sb = await client();
      check(await sb.from('enrollments').update({ status: 'validee', validated_at: new Date().toISOString() }).eq('id', id));
    },
    async cancelEnrollment(id) {
      const sb = await client();
      check(await sb.from('enrollments').update({ status: 'annulee' }).eq('id', id));
      const paid = new Set(snap().payments.map((p) => p.installmentId));
      const unpaid = snap().installments.filter((i) => i.enrollmentId === id && !paid.has(i.id)).map((i) => i.id);
      if (unpaid.length) check(await sb.from('installments').delete().in('id', unpaid));
    },
    async updateEnrollment(id, patch) {
      const sb = await client();
      const e = snap().enrollments.find((x) => x.id === id);
      const row: Partial<Database['public']['Tables']['enrollments']['Row']> = {};
      if (patch.imageRights !== undefined && patch.imageRights !== e?.imageRights) { row.image_rights = patch.imageRights; row.image_rights_at = new Date().toISOString(); }
      if (patch.documentsReceived) row.documents_received = patch.documentsReceived;
      if (patch.level) row.level = patch.level;
      if (patch.slot) row.slot = patch.slot;
      check(await sb.from('enrollments').update(row).eq('id', id));
    },
    async resolveSibling(familyId, decision) {
      const sb = await client();
      if (decision.attachTo && decision.attachTo !== familyId) {
        check(await sb.rpc('merge_family', { p_from: familyId, p_into: decision.attachTo }));
        await repriceFamily(decision.attachTo);
      } else {
        check(await sb.from('families').update({ sibling_check: 'validee' }).eq('id', familyId));
        check(await sb.from('enrollments').update({ sibling_check: 'aucun' }).eq('family_id', familyId).eq('sibling_check', 'a_verifier'));
      }
    },
    async updateFamily(id, patch) {
      const sb = await client();
      check(await sb.from('families').update({ address: patch.address, postal_code: patch.postalCode, commune: patch.commune, notes: patch.notes }).eq('id', id));
    },
    async updateGuardian(id, patch) {
      const sb = await client();
      check(await sb.from('guardians').update({ email: patch.email, phone: patch.phone, first_name: patch.firstName, last_name: patch.lastName, relation: patch.relation }).eq('id', id));
    },

    async proposePlace(waitlistId) {
      const s = snap();
      const w = s.waitlist.find((x) => x.id === waitlistId);
      if (!w) throw new ApiError('Demande introuvable.');
      const course = s.courses.find((c) => c.id === w.courseId)!;
      const st = s.students.find((x) => x.id === w.studentId)!;
      const g = s.guardians.find((x) => x.familyId === w.familyId && x.isPrimary) ?? s.guardians.find((x) => x.familyId === w.familyId);
      const sb = await client();
      check(await sb.from('waitlist').update({ status: 'proposee', proposed_at: new Date().toISOString() }).eq('id', waitlistId));
      if (g) await queueAndSend([{ to_email: g.email, kind: 'proposition_place', ...placeOfferMail({ guardianFirstName: g.firstName, studentFirstName: st.firstName, discipline: course.discipline, teacher: course.teacher }) }]);
    },
    async acceptWaitlist(waitlistId) {
      const s = snap();
      const w = s.waitlist.find((x) => x.id === waitlistId);
      if (!w) throw new ApiError('Demande introuvable.');
      const course = s.courses.find((c) => c.id === w.courseId)!;
      const season = s.seasons.find((x) => x.id === w.seasonId)!;
      const seasonEnr = s.enrollments.filter((e) => e.seasonId === season.id);
      if (remainingPlaces(course, seasonEnr) <= 0) throw new ApiError('Le cours est complet : augmentez la capacité ou attendez un désistement.');
      const fam = s.families.find((f) => f.id === w.familyId)!;
      const student = s.students.find((x) => x.id === w.studentId)!;
      const plan = planSubmission({ season, course, courses: s.courses, grid: s.feeLines.filter((l) => l.seasonId === season.id), rules: s.feeRules.find((r) => r.seasonId === season.id)!, seasonEnrollments: seasonEnr, familyId: fam.id, siblingCheck: 'aucun', birthDate: student.birthDate, commune: fam.commune, level: w.level, plan: w.plan, today: todayIso() });
      const now = new Date().toISOString();
      await insertEnrollmentWithInstallments({
        seasonId: season.id, studentId: student.id, familyId: fam.id, courseId: course.id, fmCourseId: plan.fmCourseId, level: w.level, slot: w.slot, status: 'validee', public: plan.public, residence: plan.residence,
        siblingRank: plan.siblingRank, pricing: plan.pricing, plan: w.plan, intendedMethod: w.intendedMethod, source: 'liste_attente', siblingCheck: fam.siblingCheck === 'a_verifier' ? 'a_verifier' : 'aucun',
        imageRights: w.imageRights, imageRightsAt: w.imageRights === null ? null : w.consentAt, rulesAcceptedAt: w.consentAt, privacyAckAt: w.consentAt, documentsReceived: [], createdAt: now, validatedAt: now,
      }, season.installmentDates);
      const sb = await client();
      check(await sb.from('waitlist').update({ status: 'acceptee' }).eq('id', waitlistId));
    },
    async refuseWaitlist(waitlistId) {
      const sb = await client();
      check(await sb.from('waitlist').update({ status: 'refusee' }).eq('id', waitlistId));
    },

    async recordPayment(input: PaymentInput) {
      const it = snap().installments.find((i) => i.id === input.installmentId);
      if (!it) throw new ApiError('Échéance introuvable.');
      if (!(input.amount > 0)) throw new ApiError('Montant invalide.', { amount: 'Indiquez un montant positif.' });
      if (input.method === 'cheque' && !input.reference.trim()) throw new ApiError('Référence manquante.', { reference: 'Indiquez le numéro du chèque.' });
      const sb = await client();
      // Le virement est encaissé à réception par un déclencheur, qui crée aussi la recette.
      check(await sb.from('payments').insert({ installment_id: it.id, family_id: it.familyId, amount: input.amount, method: input.method, reference: input.reference.trim(), bank: input.bank.trim(), received_on: input.receivedOn }));
    },
    async deletePayment(id) {
      const sb = await client();
      const res = check(await sb.from('payments').delete().eq('id', id).select('id'));
      if (!res.length) throw new ApiError('Ce règlement figure sur un bordereau déjà déposé.');
    },
    async createDepositSlip(paymentIds) {
      const sb = await client();
      const slip = check(await sb.rpc('create_deposit_slip', { p_payment_ids: paymentIds }));
      return { id: slip.id, number: slip.number, createdAt: slip.created_at, depositedOn: null, paymentIds };
    },
    async markDeposited(slipId, depositedOn) {
      const sb = await client();
      check(await sb.rpc('mark_deposited', { p_slip: slipId, p_date: depositedOn }));
    },
    async prepareReminders(installmentIds) {
      const s = snap();
      const today = todayIso();
      const byFamily = new Map<string, typeof s.installments>();
      for (const id of installmentIds) {
        const it = s.installments.find((i) => i.id === id);
        if (it && installmentState(it, s.payments, today).status === 'en_retard') byFamily.set(it.familyId, [...(byFamily.get(it.familyId) ?? []), it]);
      }
      const rows = [];
      for (const [familyId, list] of byFamily) {
        const g = s.guardians.find((x) => x.familyId === familyId && x.isPrimary) ?? s.guardians.find((x) => x.familyId === familyId);
        if (!g || s.mails.some((m) => m.kind === 'relance' && m.status === 'brouillon' && m.to === g.email)) continue;
        const lines = list.map((i) => ({ studentFirstName: s.students.find((x) => x.id === s.enrollments.find((e) => e.id === i.enrollmentId)?.studentId)?.firstName ?? '', rank: i.rank, count: i.count, dueOn: i.dueOn, amount: i.amount }));
        rows.push({ to_email: g.email, kind: 'relance' as const, status: 'brouillon' as const, ...reminderMail({ guardianFirstName: g.firstName, lines }) });
      }
      if (rows.length) { const sb = await client(); check(await sb.from('mail_outbox').insert(rows)); }
    },
    async sendMails(mailIds) { await edge('envoyer-mails', { ids: mailIds }); },
    async discardMails(mailIds) {
      const sb = await client();
      check(await sb.from('mail_outbox').delete().in('id', mailIds).eq('status', 'brouillon'));
    },
    async sendReinscriptionLinks(familyIds) {
      const s = snap();
      const season = s.seasons.find((x) => x.isCurrent)!;
      const rows = familyIds.flatMap((id) => {
        const f = s.families.find((x) => x.id === id);
        const g = f && (s.guardians.find((x) => x.familyId === f.id && x.isPrimary) ?? s.guardians.find((x) => x.familyId === f.id));
        return f && g ? [{ to_email: g.email, kind: 'reinscription' as const, ...reinscriptionMail({ guardianFirstName: g.firstName, season: season.label, link: `${siteUrl()}/reinscription/${f.reinscriptionToken}` }) }] : [];
      });
      await queueAndSend(rows);
    },

    async saveLedgerEntry(input: LedgerEntryInput) {
      const sb = await client();
      const cat = snap().categories.find((c) => c.id === input.categoryId);
      if (!cat || cat.kind !== input.kind || cat.system) throw new ApiError('Catégorie invalide.', { categoryId: 'Choisissez une catégorie.' });
      if (!(input.amount > 0)) throw new ApiError('Montant invalide.', { amount: 'Indiquez un montant positif.' });
      if (!input.label.trim()) throw new ApiError('Libellé manquant.', { label: 'Indiquez un libellé.' });
      const row = { date: input.date, kind: input.kind, category_id: input.categoryId, amount: input.amount, label: input.label.trim(), event_id: input.eventId, method: input.method, attachment_id: input.attachmentId, source: 'manuel' as const };
      if (input.id) check(await sb.from('ledger_entries').update(row).eq('id', input.id));
      else check(await sb.from('ledger_entries').insert({ ...row, created_by: (await me()).id }));
    },
    async deleteLedgerEntry(id) {
      const sb = await client();
      check(await sb.from('ledger_entries').delete().eq('id', id).eq('source', 'manuel'));
    },
    async uploadAttachment(file: File) {
      if (!['application/pdf', 'image/jpeg', 'image/png'].includes(file.type)) throw new ApiError('Formats acceptés : PDF, JPEG ou PNG.');
      if (file.size > 10 * 1024 * 1024) throw new ApiError('Fichier trop lourd (10 Mo au plus).');
      const sb = await client();
      const path = `${todayIso().slice(0, 4)}/${crypto.randomUUID()}-${file.name.replace(/[^\w.-]+/g, '_')}`;
      const up = await sb.storage.from('justificatifs').upload(path, file, { contentType: file.type, upsert: false });
      if (up.error) throw new ApiError(up.error.message);
      const row = check(await sb.from('attachments').insert({ storage_path: path, filename: file.name, mime: file.type, size: file.size, uploaded_by: (await me()).id }).select('*').single());
      return toAttachment(row);
    },
    async attachmentUrl(id) {
      const sb = await client();
      const row = check(await sb.from('attachments').select('storage_path').eq('id', id).single());
      // Lien signé à durée courte : 60 secondes.
      const { data, error } = await sb.storage.from('justificatifs').createSignedUrl(row.storage_path, 60);
      if (error || !data) throw new ApiError(error?.message ?? 'Lien indisponible.');
      return data.signedUrl;
    },
    async saveCategory(c) {
      const sb = await client();
      if (c.id) check(await sb.from('ledger_categories').update({ label: c.label.trim(), archived: c.archived }).eq('id', c.id));
      else check(await sb.from('ledger_categories').insert({ kind: c.kind, label: c.label.trim() }));
    },
    async saveEvent(e) {
      const sb = await client();
      const row = { season_id: e.seasonId || null, name: e.name, date: e.date, kind: e.kind, place: e.place, budget: e.budget };
      if (e.id) check(await sb.from('events').update(row).eq('id', e.id));
      else check(await sb.from('events').insert(row));
    },
    async saveCourse(c: Omit<Course, 'id'> & { id?: string }) {
      const sb = await client();
      check(await sb.from('courses').upsert(fromCourse(c)));
    },
    async saveFeeLines(lines) {
      const sb = await client();
      check(await sb.from('fee_grid').upsert(lines.map((l) => ({ season_id: l.seasonId, formula: l.formula, public: l.public, residence: l.residence, amount: l.amount })), { onConflict: 'season_id,formula,public,residence' }));
    },
    async saveFeeRules(rules) {
      const sb = await client();
      check(await sb.from('fee_rules').upsert(fromFeeRules(rules)));
    },
    async saveSeason(season) {
      const sb = await client();
      if (season.isCurrent) check(await sb.from('seasons').update({ is_current: false }).neq('id', season.id));
      check(await sb.from('seasons').upsert(fromSeason(season)));
    },
    async saveSettings(settings) {
      const sb = await client();
      check(await sb.from('settings').update(fromSettings(settings)).eq('id', 1));
    },
    async saveStaff(p) {
      const sb = await client();
      if (p.id) check(await sb.from('staff_profiles').update({ full_name: p.fullName, email: p.email, role: p.role as Role, active: p.active }).eq('id', p.id));
      else await edge('inviter-membre', { fullName: p.fullName, email: p.email, role: p.role });
    },
    async purgePreview(): Promise<PurgePreview> {
      const sb = await client();
      return check(await sb.rpc('purge_preview'));
    },
    async purge(): Promise<PurgePreview> {
      const sb = await client();
      return check(await sb.rpc('purge_old_seasons'));
    },
  };

  return { kind: 'supabase', publicApi, staffApi };
}
