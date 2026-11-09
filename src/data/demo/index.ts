// Implémentation « demo » : données fictives dans le navigateur (localStorage).
// Elle simule le serveur : validation, recherche de fratrie, tarif, déclencheur des recettes, journal.
import type {
  DataSource, LedgerEntryInput, PaymentInput, PublicApi, PublicCatalog, PublicCourse, PurgePreview, ReinscriptionData,
  ReinscriptionInput, Session, Snapshot, StaffApi, SubmitResult,
} from '../api.ts';
import { ApiError } from '../api.ts';
import type { Attachment, Course, Enrollment, Family, MailMessage, Role, Season, Student, WaitlistEntry } from '../../domain/types.ts';
import {
  addDays, can, cashedOnReception, formatDateFr, formatEuros, installmentState, isBot, normalizeEmail, normalizeName,
  planInstallments, planSubmission, remainingPlaces, round2, siblingMatches, syncAutoEntries, todayIso, validateCourse,
  validateInscription, type Capability, type InscriptionInput, type SiblingQuery,
} from '../../domain/index.ts';
import { buildSeed } from './seed.ts';

const KEY = 'emg-demo-v1';
const SESSION_KEY = 'emg-demo-session';
const ATT_PREFIX = 'emg-demo-att-';
const RATE_KEY = 'emg-demo-rate';
const MAX_ATTACHMENT = 700 * 1024;

interface Continuation { familyId: string; expires: number }
interface DemoState extends Snapshot { continuations: Record<string, Continuation> }

const uid = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36));
const nowIso = () => new Date().toISOString().slice(0, 19);
const delay = (ms = 120) => new Promise((r) => setTimeout(r, ms));
const clone = <T,>(v: T): T => (typeof structuredClone === 'function' ? structuredClone(v) : JSON.parse(JSON.stringify(v)));

function safeGet(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}
function safeSet(key: string, value: string): boolean {
  try { localStorage.setItem(key, value); return true; } catch { return false; }
}
function safeRemove(key: string) {
  try { localStorage.removeItem(key); } catch { /* stockage indisponible */ }
}

export function createDemoSource(): DataSource {
  let state: DemoState | null = null;

  const load = (): DemoState => {
    if (state) return state;
    const raw = safeGet(KEY);
    if (raw) {
      try { state = JSON.parse(raw) as DemoState; return state; } catch { /* données corrompues : on repart du jeu d'essai */ }
    }
    state = { ...buildSeed(), continuations: {} };
    safeSet(KEY, JSON.stringify(state));
    return state;
  };
  const save = () => { if (state && !safeSet(KEY, JSON.stringify(state))) throw new ApiError('Le stockage du navigateur est plein : réinitialisez la démonstration.'); };

  const currentSeason = (s: DemoState): Season => s.seasons.find((x) => x.isCurrent) ?? s.seasons[s.seasons.length - 1];
  const rulesFor = (s: DemoState, seasonId: string) => {
    const r = s.feeRules.find((x) => x.seasonId === seasonId);
    if (!r) throw new ApiError('Grille tarifaire absente pour cette saison.');
    return r;
  };
  const gridFor = (s: DemoState, seasonId: string) => s.feeLines.filter((l) => l.seasonId === seasonId);

  const session = (): Session | null => {
    const raw = safeGet(SESSION_KEY);
    if (!raw) return null;
    const s = load();
    const staff = s.staff.find((x) => x.role === (raw as Role) && x.active);
    return staff ? { staff } : null;
  };
  const requireCap = (cap: Capability) => {
    const se = session();
    if (!se) throw new ApiError('Connexion requise.');
    if (!can(se.staff.role, cap)) throw new ApiError('Votre rôle ne permet pas cette action.');
    return se.staff;
  };
  const audit = (s: DemoState, actor: string, action: string, entity: string, entityId: string | null, details: string) => {
    s.audit.unshift({ id: uid(), at: nowIso(), actor, action, entity, entityId, details });
    if (s.audit.length > 2000) s.audit.length = 2000;
  };
  const mail = (s: DemoState, m: Omit<MailMessage, 'id' | 'createdAt'>) => {
    const msg: MailMessage = { ...m, id: uid(), createdAt: nowIso() };
    s.mails.unshift(msg);
    return msg;
  };
  const primaryGuardian = (s: DemoState, familyId: string) => s.guardians.find((g) => g.familyId === familyId && g.isPrimary) ?? s.guardians.find((g) => g.familyId === familyId);

  const syncLedger = (s: DemoState) => {
    const inst = new Map(s.installments.map((i) => [i.id, i]));
    const enr = new Map(s.enrollments.map((e) => [e.id, e]));
    const stu = new Map(s.students.map((x) => [x.id, x]));
    const fam = new Map(s.families.map((f) => [f.id, f]));
    s.entries = syncAutoEntries(s.entries, s.payments, (p) => {
      const it = inst.get(p.installmentId);
      const st = it ? stu.get(enr.get(it.enrollmentId)?.studentId ?? '') : undefined;
      return { familyName: fam.get(p.familyId)?.familyName ?? '—', installmentLabel: it ? `${st?.firstName ?? 'élève'} · échéance ${it.rank}/${it.count}` : 'règlement' };
    }, uid, nowIso());
  };

  /** Limite d'envois, à l'image de la limite par adresse IP de la fonction Edge. */
  const rateLimit = (bucket: string, max: number, windowMs: number) => {
    let data: Record<string, number[]> = {};
    try { data = JSON.parse(safeGet(RATE_KEY) ?? '{}'); } catch { data = {}; }
    const now = Date.now();
    const hits = (data[bucket] ?? []).filter((t) => now - t < windowMs);
    if (hits.length >= max) throw new ApiError('Trop de tentatives depuis cet appareil. Réessayez dans quelques minutes.');
    hits.push(now);
    data[bucket] = hits;
    safeSet(RATE_KEY, JSON.stringify(data));
  };

  const toPublicCourse = (c: Course, s: DemoState): PublicCourse => ({
    id: c.id, discipline: c.discipline, kind: c.kind, formula: c.formula, teacher: c.teacher, slots: c.slots, levels: c.levels,
    requiresFm: c.requiresFm, abbr: c.abbr, color: c.color, remaining: remainingPlaces(c, s.enrollments.filter((e) => e.seasonId === c.seasonId)),
  });

  const siteUrl = () => (typeof location !== 'undefined' ? location.origin : 'https://ecole-musique-givry.netlify.app');

  const confirmationMail = (s: DemoState, to: string, guardianFirst: string, student: Student, course: Course, res: SubmitResult, season: Season) => {
    const lines = res.pricing.lines.map((l) => `  · ${l.label} : ${l.note ?? formatEuros(l.amount, true)}`).join('\n');
    const ech = res.installments.map((i) => `  · ${i.rank}/${i.count} : ${formatEuros(i.amount, true)} au ${formatDateFr(i.dueOn)}`).join('\n');
    const body = res.outcome === 'liste_attente'
      ? `Bonjour ${guardianFirst},\n\nLe cours de ${course.discipline} est complet pour la saison ${season.label}. ${student.firstName} est inscrit(e) sur la liste d'attente (référence ${res.reference}). Nous vous écrirons dès qu'une place se libère, dans l'ordre d'arrivée des demandes.\n\nLe bureau de l'École de Musique de Givry`
      : `Bonjour ${guardianFirst},\n\nNous avons bien reçu l'inscription de ${student.firstName} en ${course.discipline} pour la saison ${season.label} (référence ${res.reference}).\n\nTarif selon la grille de l'école :\n${lines}\n  Total : ${formatEuros(res.pricing.total, true)}\n\nÉchéances :\n${ech}\n${res.siblingCheck === 'a_verifier' ? "\nLe rattachement à votre famille sera vérifié par le bureau ; la réduction fratrie éventuelle sera appliquée à ce moment-là.\n" : ''}\nLe dossier sera validé par le bureau. Vous pouvez répondre à ce message pour toute question.\n\nLe bureau de l'École de Musique de Givry`;
    mail(s, { to, subject: res.outcome === 'liste_attente' ? 'Liste d’attente · École de Musique de Givry' : 'Inscription reçue · École de Musique de Givry', body, kind: 'confirmation', status: 'envoye', sentAt: nowIso(), validatedBy: null });
  };

  /** Crée l'inscription ou la demande de liste d'attente à partir de la décision du domaine. */
  const createFromPlan = (
    s: DemoState, args: { season: Season; course: Course; family: Family; student: Student; level: string; slot: string; plan: 1 | 3; method: Enrollment['intendedMethod']; imageRights: boolean | null; siblingCheck: Enrollment['siblingCheck']; source: Enrollment['source']; status: Enrollment['status']; forceEnroll?: boolean },
  ): SubmitResult => {
    const { season, course, family, student } = args;
    const today = todayIso();
    const seasonEnrollments = s.enrollments.filter((e) => e.seasonId === season.id);
    const plan = planSubmission({
      season, course, courses: s.courses, grid: gridFor(s, season.id), rules: rulesFor(s, season.id), seasonEnrollments,
      familyId: family.id, siblingCheck: args.siblingCheck, birthDate: student.birthDate, commune: family.commune, level: args.level, plan: args.plan, today,
    });
    const now = nowIso();
    const reference = `EMG-${season.label.slice(2, 4)}-${String(s.enrollments.length + s.waitlist.length + 1).padStart(4, '0')}`;
    if (plan.outcome === 'liste_attente' && !args.forceEnroll) {
      const w: WaitlistEntry = { id: uid(), seasonId: season.id, courseId: course.id, studentId: student.id, familyId: family.id, level: args.level, slot: args.slot, plan: args.plan, intendedMethod: args.method, imageRights: args.imageRights, consentAt: now, createdAt: now, status: 'en_attente', proposedAt: null };
      s.waitlist.push(w);
      return { outcome: 'liste_attente', reference, pricing: plan.pricing, installments: [], siblingCheck: args.siblingCheck, continuationToken: '' };
    }
    const e: Enrollment = {
      id: uid(), seasonId: season.id, studentId: student.id, familyId: family.id, courseId: course.id, fmCourseId: plan.fmCourseId, level: args.level, slot: args.slot,
      status: args.status, public: plan.public, residence: plan.residence, siblingRank: plan.siblingRank, pricing: plan.pricing, plan: args.plan, intendedMethod: args.method,
      source: args.source, siblingCheck: args.siblingCheck, imageRights: args.imageRights, imageRightsAt: args.imageRights === null ? null : now, rulesAcceptedAt: now, privacyAckAt: now,
      documentsReceived: [], createdAt: now, validatedAt: args.status === 'validee' ? now : null,
    };
    s.enrollments.push(e);
    const installments = planInstallments(plan.pricing.total, args.plan, season.installmentDates, today);
    for (const it of installments) s.installments.push({ id: uid(), enrollmentId: e.id, familyId: family.id, seasonId: season.id, ...it });
    return { outcome: 'inscription', reference, pricing: plan.pricing, installments, siblingCheck: args.siblingCheck, continuationToken: '' };
  };

  /** Recalcule tarifs et échéances d'une famille sur une saison (après rattachement), sans toucher aux inscriptions déjà réglées. */
  const repriceFamily = (s: DemoState, familyId: string, seasonId: string) => {
    const season = s.seasons.find((x) => x.id === seasonId)!;
    const rules = rulesFor(s, seasonId);
    const grid = gridFor(s, seasonId);
    const fam = s.families.find((f) => f.id === familyId)!;
    const list = s.enrollments.filter((e) => e.familyId === familyId && e.seasonId === seasonId && e.status !== 'annulee').sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const done: Enrollment[] = [];
    for (const e of list) {
      const paid = s.payments.some((p) => s.installments.find((i) => i.id === p.installmentId)?.enrollmentId === e.id);
      const course = s.courses.find((c) => c.id === e.courseId)!;
      const student = s.students.find((x) => x.id === e.studentId)!;
      const others = [...done, ...s.enrollments.filter((x) => x.seasonId === seasonId && x.familyId !== familyId)];
      const plan = planSubmission({ season, course, courses: s.courses, grid, rules, seasonEnrollments: others, familyId, siblingCheck: e.siblingCheck, birthDate: student.birthDate, commune: fam.commune, level: e.level, plan: e.plan, today: e.createdAt.slice(0, 10) });
      if (!paid) {
        e.pricing = plan.pricing;
        e.siblingRank = plan.siblingRank;
        e.residence = plan.residence;
        s.installments = s.installments.filter((i) => i.enrollmentId !== e.id);
        for (const it of planInstallments(plan.pricing.total, e.plan, season.installmentDates, e.createdAt.slice(0, 10))) s.installments.push({ id: uid(), enrollmentId: e.id, familyId, seasonId, ...it });
      }
      done.push(e);
    }
  };

  const findOrCreateStudent = (s: DemoState, family: Family, input: InscriptionInput['student']): Student => {
    const existing = s.students.find((x) => x.familyId === family.id && normalizeName(x.firstName) === normalizeName(input.firstName) && x.birthDate === input.birthDate);
    if (existing) return existing;
    const st: Student = { id: uid(), familyId: family.id, firstName: input.firstName.trim(), lastName: input.lastName.trim(), birthDate: input.birthDate };
    s.students.push(st);
    return st;
  };

  const publicApi: PublicApi = {
    async getCatalog(): Promise<PublicCatalog> {
      await delay(60);
      const s = load();
      const season = currentSeason(s);
      const courses = s.courses.filter((c) => c.seasonId === season.id && c.active);
      return {
        season: clone(season),
        courses: courses.filter((c) => c.kind !== 'fm').map((c) => toPublicCourse(c, s)),
        fmCourses: courses.filter((c) => c.kind === 'fm').map((c) => toPublicCourse(c, s)),
        grid: clone(gridFor(s, season.id)),
        rules: clone(rulesFor(s, season.id)),
        settings: { schoolName: s.settings.schoolName, schoolEmail: s.settings.schoolEmail, retentionYears: s.settings.retentionYears },
      };
    },

    async lookupSibling(q: SiblingQuery) {
      await delay(350);
      rateLimit('fratrie', 12, 10 * 60_000);
      const s = load();
      const found = s.families.some((f) => siblingMatches(q, { familyName: f.familyName, postalCode: f.postalCode, guardianEmails: s.guardians.filter((g) => g.familyId === f.id).map((g) => g.email) }));
      return { found };
    },

    async submitInscription(input: InscriptionInput): Promise<SubmitResult> {
      await delay(400);
      rateLimit('inscription', 8, 10 * 60_000);
      const today = todayIso();
      if (isBot(input)) {
        // Champ piège rempli : on répond comme si tout allait bien, sans rien enregistrer.
        return { outcome: 'inscription', reference: 'EMG-0000', pricing: { lines: [], base: 0, fm: 0, siblingDiscount: 0, adhesion: 0, total: 0 }, installments: [], siblingCheck: 'aucun', continuationToken: '' };
      }
      const errors = validateInscription(input, today);
      if (Object.keys(errors).length) throw new ApiError('Certaines informations sont à corriger.', errors);
      const s = load();
      const season = currentSeason(s);
      if (!season.registrationOpen) throw new ApiError('Les inscriptions ne sont pas ouvertes.');
      const course = s.courses.find((c) => c.id === input.courseId && c.seasonId === season.id && c.active && c.kind !== 'fm');
      if (!course) throw new ApiError('Ce cours n’est pas proposé.', { courseId: 'Choisissez un cours de la liste.' });
      if (!course.levels.includes(input.level)) throw new ApiError('Niveau inconnu.', { level: 'Choisissez un niveau de la liste.' });
      if (!course.slots.includes(input.slot)) throw new ApiError('Créneau inconnu.', { slot: 'Choisissez un créneau de la liste.' });

      const g = input.guardian;
      const famOf = (f: Family) => ({ familyName: f.familyName, postalCode: f.postalCode, guardianEmails: s.guardians.filter((x) => x.familyId === f.id).map((x) => x.email) });
      let family: Family | undefined;
      let siblingCheck: Enrollment['siblingCheck'] = 'aucun';
      const cont = input.continuationToken ? s.continuations[input.continuationToken] : undefined;
      if (cont && cont.expires > Date.now()) {
        family = s.families.find((f) => f.id === cont.familyId);
        siblingCheck = family?.siblingCheck === 'a_verifier' ? 'a_verifier' : 'trouvee';
      } else if (input.sibling.declared) {
        family = s.families.find((f) => siblingMatches(input.sibling, famOf(f)));
        siblingCheck = family ? 'trouvee' : 'a_verifier';
      } else if (s.families.some((f) => siblingMatches({ familyName: g.lastName, postalCode: g.postalCode, email: g.email }, famOf(f)))) {
        // Famille déjà connue mais non déclarée : le bureau vérifiera, rien n'est révélé.
        siblingCheck = 'a_verifier';
      }
      if (!family) {
        family = { id: uid(), familyName: (input.sibling.declared ? input.sibling.familyName : g.lastName).trim(), postalCode: g.postalCode.trim(), commune: g.commune.trim(), address: g.address.trim(), siblingCheck: siblingCheck === 'a_verifier' ? 'a_verifier' : 'aucun', reinscriptionToken: uid(), createdAt: nowIso(), notes: '' };
        s.families.push(family);
      }
      if (!s.guardians.some((x) => x.familyId === family!.id && normalizeEmail(x.email) === normalizeEmail(g.email))) {
        const hasPrimary = s.guardians.some((x) => x.familyId === family!.id);
        s.guardians.push({ id: uid(), familyId: family.id, firstName: g.firstName.trim(), lastName: g.lastName.trim(), email: g.email.trim(), phone: g.phone.trim(), relation: g.relation.trim(), isPrimary: !hasPrimary });
      }
      const student = findOrCreateStudent(s, family, input.student);
      if (s.enrollments.some((e) => e.studentId === student.id && e.seasonId === season.id && e.courseId === course.id && e.status !== 'annulee')) {
        throw new ApiError('Cet élève est déjà inscrit à ce cours pour la saison.');
      }
      const res = createFromPlan(s, { season, course, family, student, level: input.level, slot: input.slot, plan: input.plan, method: input.intendedMethod, imageRights: input.imageRights, siblingCheck, source: 'en_ligne', status: 'a_valider' });
      const token = uid();
      s.continuations[token] = { familyId: family.id, expires: Date.now() + 2 * 3600_000 };
      res.continuationToken = token;
      confirmationMail(s, g.email.trim(), g.firstName.trim(), student, course, res, season);
      audit(s, 'Formulaire en ligne', res.outcome === 'liste_attente' ? 'Demande de liste d’attente' : 'Inscription reçue', 'enrollments', null, `${student.firstName} ${student.lastName} · ${course.discipline}${siblingCheck === 'a_verifier' ? ' · rattachement à vérifier' : ''}`);
      save();
      return res;
    },

    async getReinscription(token: string): Promise<ReinscriptionData | null> {
      await delay(150);
      const s = load();
      const family = s.families.find((f) => f.reinscriptionToken === token);
      if (!family) return null;
      const season = currentSeason(s);
      const g = primaryGuardian(s, family.id);
      const prevSeasons = s.seasons.filter((x) => x.startsOn < season.startsOn).sort((a, b) => b.startsOn.localeCompare(a.startsOn));
      const students = s.students.filter((x) => x.familyId === family.id).flatMap((st) => {
        if (s.enrollments.some((e) => e.studentId === st.id && e.seasonId === season.id && e.status !== 'annulee')) return [];
        for (const ps of prevSeasons) {
          const e = s.enrollments.find((x) => x.studentId === st.id && x.seasonId === ps.id && x.status !== 'annulee');
          if (e) {
            const pc = s.courses.find((c) => c.id === e.courseId)!;
            const same = s.courses.find((c) => c.seasonId === season.id && c.discipline === pc.discipline && c.active);
            return [{ studentId: st.id, firstName: st.firstName, previousDiscipline: pc.discipline, previousLevel: e.level, previousCourseId: same?.id ?? null }];
          }
        }
        return [];
      });
      return { familyName: family.familyName, guardianFirstName: g?.firstName ?? '', guardianEmail: g?.email ?? '', commune: family.commune, season: clone(season), students };
    },

    async submitReinscription(token: string, input: ReinscriptionInput): Promise<SubmitResult[]> {
      await delay(400);
      rateLimit('inscription', 8, 10 * 60_000);
      const s = load();
      const family = s.families.find((f) => f.reinscriptionToken === token);
      if (!family) throw new ApiError('Lien de réinscription invalide ou expiré.');
      const season = currentSeason(s);
      if (!season.registrationOpen) throw new ApiError('Les inscriptions ne sont pas ouvertes.');
      if (!input.choices.length) throw new ApiError('Choisissez au moins un élève à réinscrire.');
      for (const ch of input.choices) {
        const errs = validateCourse({ ...ch, plan: input.plan, intendedMethod: input.intendedMethod, rulesAccepted: input.rulesAccepted, privacyAck: input.privacyAck, imageRights: input.imageRights });
        if (Object.keys(errs).length) throw new ApiError('Certaines informations sont à corriger.', errs);
      }
      const results: SubmitResult[] = [];
      const g = primaryGuardian(s, family.id);
      for (const ch of input.choices) {
        const student = s.students.find((x) => x.id === ch.studentId && x.familyId === family.id);
        const course = s.courses.find((c) => c.id === ch.courseId && c.seasonId === season.id && c.active && c.kind !== 'fm');
        if (!student || !course) throw new ApiError('Élève ou cours inconnu.');
        const res = createFromPlan(s, { season, course, family, student, level: ch.level, slot: ch.slot, plan: input.plan, method: input.intendedMethod, imageRights: input.imageRights, siblingCheck: family.siblingCheck === 'a_verifier' ? 'a_verifier' : (s.enrollments.some((e) => e.familyId === family.id && e.seasonId === season.id) ? 'validee' : 'aucun'), source: 'reinscription', status: 'a_valider' });
        results.push(res);
        if (g) confirmationMail(s, g.email, g.firstName, student, course, res, season);
        audit(s, 'Réinscription en ligne', 'Réinscription reçue', 'enrollments', null, `${student.firstName} ${student.lastName} · ${course.discipline}`);
      }
      save();
      return results;
    },
  };

  const staffApi: StaffApi = {
    loginMode: 'role',
    async getSession() { return session(); },
    async signInWithRole(role: Role) {
      safeSet(SESSION_KEY, role);
      const se = session();
      if (!se) throw new ApiError('Rôle inconnu.');
      const s = load();
      audit(s, se.staff.fullName, 'Connexion', 'staff_profiles', se.staff.id, `Connexion de démonstration (${role})`);
      save();
      return se;
    },
    async sendMagicLink() { throw new ApiError('En démonstration, la connexion se fait par le choix du rôle.'); },
    async signOut() { safeRemove(SESSION_KEY); },

    async load() {
      await delay(40);
      if (!session()) throw new ApiError('Connexion requise.');
      const { continuations: _c, ...snap } = load();
      return clone(snap);
    },

    async validateEnrollment(id) {
      const actor = requireCap('eleves');
      const s = load();
      const e = s.enrollments.find((x) => x.id === id);
      if (!e) throw new ApiError('Inscription introuvable.');
      if (e.siblingCheck === 'a_verifier') throw new ApiError('Vérifiez d’abord le rattachement de la famille.');
      e.status = 'validee';
      e.validatedAt = nowIso();
      audit(s, actor.fullName, 'Inscription validée', 'enrollments', id, '');
      save();
    },
    async cancelEnrollment(id) {
      const actor = requireCap('eleves');
      const s = load();
      const e = s.enrollments.find((x) => x.id === id);
      if (!e) throw new ApiError('Inscription introuvable.');
      e.status = 'annulee';
      const paidInst = new Set(s.payments.map((p) => p.installmentId));
      s.installments = s.installments.filter((i) => i.enrollmentId !== id || paidInst.has(i.id));
      audit(s, actor.fullName, 'Inscription annulée', 'enrollments', id, '');
      save();
    },
    async updateEnrollment(id, patch) {
      const actor = requireCap('eleves');
      const s = load();
      const e = s.enrollments.find((x) => x.id === id);
      if (!e) throw new ApiError('Inscription introuvable.');
      if (patch.imageRights !== undefined && patch.imageRights !== e.imageRights) { e.imageRights = patch.imageRights; e.imageRightsAt = nowIso(); }
      if (patch.documentsReceived) e.documentsReceived = [...patch.documentsReceived];
      if (patch.level) e.level = patch.level;
      if (patch.slot) e.slot = patch.slot;
      audit(s, actor.fullName, 'Dossier modifié', 'enrollments', id, Object.keys(patch).join(', '));
      save();
    },
    async resolveSibling(familyId, decision) {
      const actor = requireCap('eleves');
      const s = load();
      const fam = s.families.find((f) => f.id === familyId);
      if (!fam) throw new ApiError('Famille introuvable.');
      if (decision.attachTo && decision.attachTo !== familyId) {
        const target = s.families.find((f) => f.id === decision.attachTo);
        if (!target) throw new ApiError('Famille cible introuvable.');
        for (const coll of [s.students, s.enrollments, s.installments, s.payments, s.waitlist] as { familyId: string }[][]) for (const x of coll) if (x.familyId === familyId) x.familyId = target.id;
        for (const gu of s.guardians) if (gu.familyId === familyId) { gu.familyId = target.id; gu.isPrimary = false; }
        s.families = s.families.filter((f) => f.id !== familyId);
        target.siblingCheck = 'validee';
        for (const e of s.enrollments) if (e.familyId === target.id && e.siblingCheck === 'a_verifier') e.siblingCheck = 'validee';
        for (const se of s.seasons) repriceFamily(s, target.id, se.id);
        audit(s, actor.fullName, 'Rattachement validé', 'families', target.id, `Famille ${fam.familyName} rattachée à la famille ${target.familyName}`);
      } else {
        fam.siblingCheck = 'validee';
        for (const e of s.enrollments) if (e.familyId === familyId && e.siblingCheck === 'a_verifier') e.siblingCheck = 'aucun';
        audit(s, actor.fullName, 'Rattachement vérifié', 'families', familyId, 'Pas de fratrie connue');
      }
      syncLedger(s);
      save();
    },
    async updateFamily(id, patch) {
      const actor = requireCap('eleves');
      const s = load();
      const f = s.families.find((x) => x.id === id);
      if (!f) throw new ApiError('Famille introuvable.');
      Object.assign(f, patch);
      audit(s, actor.fullName, 'Famille modifiée', 'families', id, Object.keys(patch).join(', '));
      save();
    },
    async updateGuardian(id, patch) {
      const actor = requireCap('eleves');
      const s = load();
      const g = s.guardians.find((x) => x.id === id);
      if (!g) throw new ApiError('Responsable introuvable.');
      Object.assign(g, patch);
      audit(s, actor.fullName, 'Responsable modifié', 'guardians', id, Object.keys(patch).join(', '));
      save();
    },

    async proposePlace(waitlistId) {
      const actor = requireCap('places');
      const s = load();
      const w = s.waitlist.find((x) => x.id === waitlistId);
      if (!w) throw new ApiError('Demande introuvable.');
      const course = s.courses.find((c) => c.id === w.courseId)!;
      const st = s.students.find((x) => x.id === w.studentId)!;
      const g = primaryGuardian(s, w.familyId);
      w.status = 'proposee';
      w.proposedAt = nowIso();
      if (g) mail(s, { to: g.email, subject: `Une place se libère en ${course.discipline}`, body: `Bonjour ${g.firstName},\n\nUne place s'est libérée en ${course.discipline} (${course.teacher}). Elle est proposée à ${st.firstName}, premier ou première de la liste d'attente.\n\nMerci de nous confirmer votre réponse sous 7 jours en répondant à ce message.\n\nLe bureau de l'École de Musique de Givry`, kind: 'proposition_place', status: 'envoye', sentAt: nowIso(), validatedBy: actor.fullName });
      audit(s, actor.fullName, 'Place proposée', 'waitlist', waitlistId, `${st.firstName} ${st.lastName} · ${course.discipline}`);
      save();
    },
    async acceptWaitlist(waitlistId) {
      const actor = requireCap('places');
      const s = load();
      const w = s.waitlist.find((x) => x.id === waitlistId);
      if (!w) throw new ApiError('Demande introuvable.');
      const course = s.courses.find((c) => c.id === w.courseId)!;
      const season = s.seasons.find((x) => x.id === w.seasonId)!;
      if (remainingPlaces(course, s.enrollments.filter((e) => e.seasonId === season.id)) <= 0) throw new ApiError('Le cours est complet : augmentez la capacité ou attendez un désistement.');
      const family = s.families.find((f) => f.id === w.familyId)!;
      const student = s.students.find((x) => x.id === w.studentId)!;
      createFromPlan(s, { season, course, family, student, level: w.level, slot: w.slot, plan: w.plan, method: w.intendedMethod, imageRights: w.imageRights, siblingCheck: family.siblingCheck === 'a_verifier' ? 'a_verifier' : 'aucun', source: 'liste_attente', status: 'validee', forceEnroll: true });
      w.status = 'acceptee';
      audit(s, actor.fullName, 'Place acceptée', 'waitlist', waitlistId, `${student.firstName} ${student.lastName} · ${course.discipline}`);
      save();
    },
    async refuseWaitlist(waitlistId) {
      const actor = requireCap('places');
      const s = load();
      const w = s.waitlist.find((x) => x.id === waitlistId);
      if (!w) throw new ApiError('Demande introuvable.');
      w.status = 'refusee';
      audit(s, actor.fullName, 'Demande retirée de la liste d’attente', 'waitlist', waitlistId, '');
      save();
    },

    async recordPayment(input: PaymentInput) {
      const actor = requireCap('encaissements');
      const s = load();
      const it = s.installments.find((i) => i.id === input.installmentId);
      if (!it) throw new ApiError('Échéance introuvable.');
      const amount = round2(Number(input.amount));
      if (!(amount > 0)) throw new ApiError('Montant invalide.', { amount: 'Indiquez un montant positif.' });
      if (!/^\d{4}-\d{2}-\d{2}$/.test(input.receivedOn)) throw new ApiError('Date invalide.', { receivedOn: 'Indiquez la date de réception.' });
      if (input.method === 'cheque' && !input.reference.trim()) throw new ApiError('Référence manquante.', { reference: 'Indiquez le numéro du chèque.' });
      const id = uid();
      s.payments.push({ id, installmentId: it.id, familyId: it.familyId, amount, method: input.method, reference: input.reference.trim(), bank: input.bank.trim(), receivedOn: input.receivedOn, cashedOn: cashedOnReception(input.method) ? input.receivedOn : null, depositSlipId: null, createdAt: nowIso() });
      syncLedger(s);
      const fam = s.families.find((f) => f.id === it.familyId);
      audit(s, actor.fullName, 'Règlement enregistré', 'payments', id, `${fam?.familyName ?? ''} · ${formatEuros(amount, true)} · ${input.method}`);
      save();
    },
    async deletePayment(id) {
      const actor = requireCap('encaissements');
      const s = load();
      const p = s.payments.find((x) => x.id === id);
      if (!p) throw new ApiError('Règlement introuvable.');
      if (p.depositSlipId && s.depositSlips.find((d) => d.id === p.depositSlipId)?.depositedOn) throw new ApiError('Ce règlement figure sur un bordereau déjà déposé.');
      if (p.depositSlipId) { const d = s.depositSlips.find((x) => x.id === p.depositSlipId); if (d) d.paymentIds = d.paymentIds.filter((x) => x !== id); }
      s.payments = s.payments.filter((x) => x.id !== id);
      syncLedger(s);
      audit(s, actor.fullName, 'Règlement supprimé', 'payments', id, formatEuros(p.amount, true));
      save();
    },
    async createDepositSlip(paymentIds) {
      const actor = requireCap('bordereaux');
      const s = load();
      const list = paymentIds.map((id) => s.payments.find((p) => p.id === id));
      if (!list.length || list.some((p) => !p || p.method === 'virement' || p.cashedOn || p.depositSlipId)) throw new ApiError('Sélection invalide : seuls les chèques, chèques vacances et espèces non remis peuvent figurer sur un bordereau.');
      const number = Math.max(0, ...s.depositSlips.map((d) => d.number)) + 1;
      const slip = { id: uid(), number, createdAt: nowIso(), depositedOn: null, paymentIds: [...paymentIds] };
      s.depositSlips.push(slip);
      for (const p of list) p!.depositSlipId = slip.id;
      audit(s, actor.fullName, 'Bordereau préparé', 'deposit_slips', slip.id, `Bordereau n° ${number} · ${list.length} pièces`);
      save();
      return clone(slip);
    },
    async markDeposited(slipId, depositedOn) {
      const actor = requireCap('bordereaux');
      const s = load();
      const slip = s.depositSlips.find((d) => d.id === slipId);
      if (!slip) throw new ApiError('Bordereau introuvable.');
      if (slip.depositedOn) throw new ApiError('Bordereau déjà déposé.');
      slip.depositedOn = depositedOn;
      for (const p of s.payments) if (slip.paymentIds.includes(p.id)) p.cashedOn = depositedOn;
      syncLedger(s);
      audit(s, actor.fullName, 'Bordereau déposé', 'deposit_slips', slipId, `Bordereau n° ${slip.number} · recettes créées automatiquement`);
      save();
    },
    async prepareReminders(installmentIds) {
      const actor = requireCap('encaissements');
      const s = load();
      const today = todayIso();
      const byFamily = new Map<string, typeof s.installments>();
      for (const id of installmentIds) {
        const it = s.installments.find((i) => i.id === id);
        if (!it || installmentState(it, s.payments, today).status !== 'en_retard') continue;
        byFamily.set(it.familyId, [...(byFamily.get(it.familyId) ?? []), it]);
      }
      let n = 0;
      for (const [familyId, list] of byFamily) {
        const g = primaryGuardian(s, familyId);
        if (!g) continue;
        if (s.mails.some((m) => m.kind === 'relance' && m.status === 'brouillon' && m.to === g.email)) continue;
        const total = round2(list.reduce((a, i) => a + i.amount, 0));
        const detail = list.map((i) => {
          const st = s.students.find((x) => x.id === s.enrollments.find((e) => e.id === i.enrollmentId)?.studentId);
          return `  · ${st?.firstName ?? ''}, échéance ${i.rank}/${i.count} du ${formatDateFr(i.dueOn)} : ${formatEuros(i.amount, true)}`;
        }).join('\n');
        mail(s, { to: g.email, subject: 'Rappel de règlement · École de Musique de Givry', body: `Bonjour ${g.firstName},\n\nSauf erreur de notre part, le règlement suivant n'a pas encore été reçu :\n${detail}\n  Total : ${formatEuros(total, true)}\n\nVous pouvez le déposer lors d'un cours ou faire un virement. Si vous l'avez déjà fait, merci de ne pas tenir compte de ce message.\n\nLe bureau de l'École de Musique de Givry`, kind: 'relance', status: 'brouillon', sentAt: null, validatedBy: null });
        n++;
      }
      audit(s, actor.fullName, 'Relances préparées', 'mail_outbox', null, `${n} mail(s) à valider`);
      save();
    },
    async sendMails(mailIds) {
      const actor = requireCap('encaissements');
      const s = load();
      let n = 0;
      for (const m of s.mails) if (mailIds.includes(m.id) && m.status === 'brouillon') { m.status = 'envoye'; m.sentAt = nowIso(); m.validatedBy = actor.fullName; n++; }
      audit(s, actor.fullName, 'Mails validés et envoyés', 'mail_outbox', null, `${n} mail(s) · envoi simulé en démonstration`);
      save();
    },
    async discardMails(mailIds) {
      const actor = requireCap('encaissements');
      const s = load();
      s.mails = s.mails.filter((m) => !(mailIds.includes(m.id) && m.status === 'brouillon'));
      audit(s, actor.fullName, 'Brouillons supprimés', 'mail_outbox', null, `${mailIds.length} brouillon(s)`);
      save();
    },
    async sendReinscriptionLinks(familyIds) {
      const actor = requireCap('places');
      const s = load();
      const season = currentSeason(s);
      let n = 0;
      for (const id of familyIds) {
        const f = s.families.find((x) => x.id === id);
        const g = f && primaryGuardian(s, f.id);
        if (!f || !g) continue;
        mail(s, { to: g.email, subject: `Réinscription ${season.label} · École de Musique de Givry`, body: `Bonjour ${g.firstName},\n\nLes réinscriptions pour la saison ${season.label} sont ouvertes. Ce lien personnel vous permet de réinscrire vos enfants en quelques clics, sans tout ressaisir :\n${siteUrl()}/reinscription/${f.reinscriptionToken}\n\nCe lien est personnel : merci de ne pas le transférer.\n\nLe bureau de l'École de Musique de Givry`, kind: 'reinscription', status: 'envoye', sentAt: nowIso(), validatedBy: actor.fullName });
        n++;
      }
      audit(s, actor.fullName, 'Liens de réinscription envoyés', 'families', null, `${n} famille(s)`);
      save();
    },

    async saveLedgerEntry(input: LedgerEntryInput) {
      const actor = requireCap('comptabilite');
      const s = load();
      const amount = round2(Number(input.amount));
      const errs: Record<string, string> = {};
      if (!(amount > 0)) errs.amount = 'Indiquez un montant positif.';
      if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) errs.date = 'Indiquez la date.';
      if (!input.label.trim()) errs.label = 'Indiquez un libellé.';
      const cat = s.categories.find((c) => c.id === input.categoryId);
      if (!cat || cat.kind !== input.kind) errs.categoryId = 'Choisissez une catégorie.';
      else if (cat.system) errs.categoryId = 'Cette catégorie est alimentée automatiquement par les encaissements.';
      if (Object.keys(errs).length) throw new ApiError('Certaines informations sont à corriger.', errs);
      if (input.id) {
        const e = s.entries.find((x) => x.id === input.id);
        if (!e) throw new ApiError('Opération introuvable.');
        if (e.source === 'auto') throw new ApiError('Une recette automatique se corrige depuis l’encaissement.');
        Object.assign(e, { date: input.date, kind: input.kind, categoryId: input.categoryId, amount, label: input.label.trim(), eventId: input.eventId, method: input.method, attachmentId: input.attachmentId });
        audit(s, actor.fullName, 'Opération modifiée', 'ledger_entries', e.id, `${input.label} · ${formatEuros(amount, true)}`);
      } else {
        const id = uid();
        s.entries.push({ id, date: input.date, kind: input.kind, categoryId: input.categoryId, amount, label: input.label.trim(), eventId: input.eventId, paymentId: null, method: input.method, attachmentId: input.attachmentId, source: 'manuel', createdAt: nowIso() });
        audit(s, actor.fullName, input.kind === 'depense' ? 'Dépense saisie' : 'Recette saisie', 'ledger_entries', id, `${input.label} · ${formatEuros(amount, true)}`);
      }
      save();
    },
    async deleteLedgerEntry(id) {
      const actor = requireCap('comptabilite');
      const s = load();
      const e = s.entries.find((x) => x.id === id);
      if (!e) throw new ApiError('Opération introuvable.');
      if (e.source === 'auto') throw new ApiError('Une recette automatique se retire en supprimant le règlement.');
      s.entries = s.entries.filter((x) => x.id !== id);
      audit(s, actor.fullName, 'Opération supprimée', 'ledger_entries', id, `${e.label} · ${formatEuros(e.amount, true)}`);
      save();
    },
    async uploadAttachment(file: File): Promise<Attachment> {
      requireCap('comptabilite');
      if (!['application/pdf', 'image/jpeg', 'image/png'].includes(file.type)) throw new ApiError('Formats acceptés : PDF, JPEG ou PNG.');
      if (file.size > MAX_ATTACHMENT) throw new ApiError('En démonstration, un justificatif est limité à 700 Ko.');
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const fr = new FileReader();
        fr.onload = () => resolve(String(fr.result));
        fr.onerror = () => reject(new ApiError('Lecture du fichier impossible.'));
        fr.readAsDataURL(file);
      });
      const s = load();
      const att: Attachment = { id: uid(), filename: file.name, mime: file.type, size: file.size, createdAt: nowIso() };
      if (!safeSet(ATT_PREFIX + att.id, dataUrl)) throw new ApiError('Le stockage du navigateur est plein : réinitialisez la démonstration.');
      s.attachments.push(att);
      save();
      return att;
    },
    async attachmentUrl(id) {
      requireCap('comptabilite');
      const stored = safeGet(ATT_PREFIX + id);
      if (stored) return stored;
      const { placeholderPdf } = await import('../../lib/pdf.ts');
      const s = load();
      return placeholderPdf(s.attachments.find((a) => a.id === id)?.filename ?? 'justificatif.pdf');
    },
    async saveCategory(c) {
      const actor = requireCap('parametres');
      const s = load();
      if (!c.label.trim()) throw new ApiError('Indiquez un libellé.', { label: 'Indiquez un libellé.' });
      if (c.id) {
        const x = s.categories.find((k) => k.id === c.id);
        if (!x) throw new ApiError('Catégorie introuvable.');
        if (x.system && c.kind !== x.kind) throw new ApiError('Catégorie système.');
        Object.assign(x, { label: c.label.trim(), archived: x.system ? false : c.archived, kind: x.kind });
      } else s.categories.push({ id: uid(), kind: c.kind, label: c.label.trim(), system: false, archived: false });
      audit(s, actor.fullName, 'Catégorie enregistrée', 'ledger_categories', c.id ?? null, c.label);
      save();
    },
    async saveEvent(ev) {
      const actor = requireCap('comptabilite');
      const s = load();
      if (!ev.name.trim()) throw new ApiError('Indiquez le nom.', { name: 'Indiquez le nom de l’événement.' });
      if (ev.id) { const x = s.events.find((k) => k.id === ev.id); if (!x) throw new ApiError('Événement introuvable.'); Object.assign(x, ev); }
      else s.events.push({ ...ev, id: uid() });
      audit(s, actor.fullName, 'Événement enregistré', 'events', ev.id ?? null, ev.name);
      save();
    },
    async saveCourse(c) {
      const actor = requireCap('parametres');
      const s = load();
      if (!c.discipline.trim()) throw new ApiError('Indiquez la discipline.', { discipline: 'Indiquez la discipline.' });
      if (!(c.capacity >= 0)) throw new ApiError('Capacité invalide.', { capacity: 'Capacité invalide.' });
      if (c.id) { const x = s.courses.find((k) => k.id === c.id); if (!x) throw new ApiError('Cours introuvable.'); Object.assign(x, c); }
      else s.courses.push({ ...c, id: uid() });
      audit(s, actor.fullName, 'Cours enregistré', 'courses', c.id ?? null, `${c.discipline} · capacité ${c.capacity}`);
      save();
    },
    async saveFeeLines(lines) {
      const actor = requireCap('parametres');
      const s = load();
      if (lines.some((l) => !(l.amount >= 0))) throw new ApiError('Montant invalide dans la grille.');
      const seasons = new Set(lines.map((l) => l.seasonId));
      s.feeLines = [...s.feeLines.filter((l) => !seasons.has(l.seasonId)), ...lines.map((l) => ({ ...l, amount: round2(l.amount) }))];
      audit(s, actor.fullName, 'Grille tarifaire enregistrée', 'fee_grid', null, `${lines.length} lignes`);
      save();
    },
    async saveFeeRules(rules) {
      const actor = requireCap('parametres');
      const s = load();
      if (rules.siblingDiscountPct < 0 || rules.siblingDiscountPct > 100) throw new ApiError('Réduction fratrie entre 0 et 100 %.');
      s.feeRules = [...s.feeRules.filter((r) => r.seasonId !== rules.seasonId), clone(rules)];
      audit(s, actor.fullName, 'Règles tarifaires enregistrées', 'fee_grid', null, `fratrie −${rules.siblingDiscountPct} % dès le rang ${rules.siblingFromRank} · adhésion ${formatEuros(rules.adhesionAmount)}`);
      save();
    },
    async saveSeason(season) {
      const actor = requireCap('parametres');
      const s = load();
      if (season.endsOn <= season.startsOn) throw new ApiError('La fin de saison doit suivre son début.');
      const i = s.seasons.findIndex((x) => x.id === season.id);
      if (i >= 0) s.seasons[i] = clone(season); else s.seasons.push(clone(season));
      if (season.isCurrent) for (const x of s.seasons) if (x.id !== season.id) x.isCurrent = false;
      audit(s, actor.fullName, 'Saison enregistrée', 'seasons', season.id, season.label);
      save();
    },
    async saveSettings(settings) {
      const actor = requireCap('parametres');
      const s = load();
      if (settings.retentionYears < 1 || settings.retentionYears > 10) throw new ApiError('Durée de conservation entre 1 et 10 ans.');
      s.settings = clone(settings);
      audit(s, actor.fullName, 'Paramètres enregistrés', 'settings', null, '');
      save();
    },

    async saveStaff(p) {
      const actor = requireCap('comptes');
      const s = load();
      if (!p.fullName.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.email)) throw new ApiError('Nom et adresse mail valides requis.');
      if (p.id) {
        const x = s.staff.find((k) => k.id === p.id);
        if (!x) throw new ApiError('Compte introuvable.');
        if (x.id === session()?.staff.id && (!p.active || p.role !== 'presidence')) throw new ApiError('Vous ne pouvez pas retirer vos propres droits de présidence.');
        Object.assign(x, { fullName: p.fullName.trim(), email: p.email.trim(), role: p.role, active: p.active });
      } else {
        s.staff.push({ id: uid(), fullName: p.fullName.trim(), email: p.email.trim(), role: p.role, active: true });
        mail(s, { to: p.email.trim(), subject: 'Accès à l’espace du bureau · École de Musique de Givry', body: `Bonjour ${p.fullName.trim()},\n\nUn accès à l’espace du bureau vous a été ouvert (rôle : ${p.role}). Connectez-vous avec votre adresse mail : un lien de connexion vous sera envoyé, sans mot de passe.\n\n${siteUrl()}/bureau`, kind: 'connexion', status: 'envoye', sentAt: nowIso(), validatedBy: actor.fullName });
      }
      audit(s, actor.fullName, p.id ? 'Compte modifié' : 'Compte invité', 'staff_profiles', p.id ?? null, `${p.fullName} · ${p.role}${p.active ? '' : ' · désactivé'}`);
      save();
    },

    async purgePreview(): Promise<PurgePreview> {
      requireCap('rgpd');
      return computePurge(load(), false);
    },
    async purge(): Promise<PurgePreview> {
      const actor = requireCap('rgpd');
      const s = load();
      const res = computePurge(s, true);
      audit(s, actor.fullName, 'Purge des anciennes saisons', 'families', null, `${res.families} famille(s), ${res.students} élève(s), ${res.enrollments} inscription(s) supprimés · données antérieures au ${formatDateFr(res.before)}`);
      save();
      return res;
    },
  };

  /** Familles dont la dernière saison est terminée depuis plus que la durée de conservation. */
  function computePurge(s: DemoState, apply: boolean): PurgePreview {
    const today = todayIso();
    const before = addDays(`${Number(today.slice(0, 4)) - s.settings.retentionYears}${today.slice(4)}`, 0);
    const lastEnd = new Map<string, string>();
    for (const e of s.enrollments) {
      const se = s.seasons.find((x) => x.id === e.seasonId);
      if (se && (lastEnd.get(e.familyId) ?? '') < se.endsOn) lastEnd.set(e.familyId, se.endsOn);
    }
    for (const w of s.waitlist) {
      const se = s.seasons.find((x) => x.id === w.seasonId);
      if (se && (lastEnd.get(w.familyId) ?? '') < se.endsOn) lastEnd.set(w.familyId, se.endsOn);
    }
    const fams = s.families.filter((f) => (lastEnd.get(f.id) ?? f.createdAt.slice(0, 10)) < before).map((f) => f.id);
    const set = new Set(fams);
    const res: PurgePreview = { families: fams.length, students: s.students.filter((x) => set.has(x.familyId)).length, enrollments: s.enrollments.filter((x) => set.has(x.familyId)).length, before };
    if (apply && fams.length) {
      const payIds = new Set(s.payments.filter((p) => set.has(p.familyId)).map((p) => p.id));
      for (const e of s.entries) if (e.paymentId && payIds.has(e.paymentId)) { e.paymentId = null; e.label = 'Inscription (données personnelles purgées)'; }
      s.payments = s.payments.filter((p) => !set.has(p.familyId));
      for (const d of s.depositSlips) d.paymentIds = d.paymentIds.filter((id) => !payIds.has(id));
      s.installments = s.installments.filter((x) => !set.has(x.familyId));
      s.enrollments = s.enrollments.filter((x) => !set.has(x.familyId));
      s.waitlist = s.waitlist.filter((x) => !set.has(x.familyId));
      s.students = s.students.filter((x) => !set.has(x.familyId));
      s.guardians = s.guardians.filter((x) => !set.has(x.familyId));
      s.families = s.families.filter((x) => !set.has(x.id));
    }
    return res;
  }

  return {
    kind: 'demo',
    publicApi,
    staffApi,
    demoMailsTo: (email: string) => clone(load().mails.filter((m) => normalizeEmail(m.to) === normalizeEmail(email))),
    resetDemo: () => {
      try {
        const keys: string[] = [];
        for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.startsWith('emg-demo') && k !== SESSION_KEY) keys.push(k); }
        keys.forEach((k) => localStorage.removeItem(k));
      } catch { /* stockage indisponible */ }
      state = null;
    },
  };
}
