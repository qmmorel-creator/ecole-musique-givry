// Types des tables Supabase (écrits à la main d'après supabase/migrations) et conversions vers le domaine.
// Ce fichier est aussi copié dans supabase/functions/_shared par `npm run sync:shared`.
import type {
  Attachment, AuditEntry, Course, DepositSlip, Enrollment, Family, FeeLine, FeeRules, Guardian, Installment, LedgerCategory, LedgerEntry,
  MailMessage, Payment, PriceBreakdown, SchoolEvent, Season, Settings, StaffProfile, Student, WaitlistEntry,
} from './domain/types.ts';

export type SeasonRow = { id: string; label: string; starts_on: string; ends_on: string; is_current: boolean; registration_open: boolean; installment_dates: string[] }
export type FamilyRow = { id: string; family_name: string; postal_code: string; commune: string; address: string; sibling_check: Family['siblingCheck']; reinscription_token: string; continuation_token: string | null; continuation_expires: string | null; notes: string; created_at: string }
export type GuardianRow = { id: string; family_id: string; first_name: string; last_name: string; email: string; phone: string; relation: string; is_primary: boolean }
export type StudentRow = { id: string; family_id: string; first_name: string; last_name: string; birth_date: string }
export type CourseRow = { id: string; season_id: string; discipline: string; kind: Course['kind']; formula: string; teacher: string; slots: string[]; capacity: number; levels: string[]; requires_fm: boolean; abbr: string; color: string; active: boolean }
export type FeeGridRow = { id: string; season_id: string; formula: string; public: FeeLine['public']; residence: FeeLine['residence']; amount: number | string }
export type FeeRulesRow = { season_id: string; formulas: FeeRules['formulas']; sibling_discount_pct: number | string; sibling_from_rank: number; sibling_children_only: boolean; adhesion_amount: number | string; adult_age: number; communes: string[]; fm_formula: string; fm_included_for_children: boolean }
export type EnrollmentRow = {
  id: string; season_id: string; student_id: string; family_id: string; course_id: string; fm_course_id: string | null; level: string; slot: string; status: Enrollment['status'];
  public: Enrollment['public']; residence: Enrollment['residence']; sibling_rank: number; pricing: PriceBreakdown; total: number | string; plan: 1 | 3; intended_method: Enrollment['intendedMethod'];
  source: Enrollment['source']; sibling_check: Enrollment['siblingCheck']; image_rights: boolean | null; image_rights_at: string | null; rules_accepted_at: string | null; privacy_ack_at: string | null;
  documents_received: string[]; created_at: string; validated_at: string | null;
}
export type WaitlistRow = { id: string; season_id: string; course_id: string; student_id: string; family_id: string; level: string; slot: string; plan: 1 | 3; intended_method: WaitlistEntry['intendedMethod']; image_rights: boolean | null; consent_at: string; created_at: string; status: WaitlistEntry['status']; proposed_at: string | null }
export type InstallmentRow = { id: string; enrollment_id: string; family_id: string; season_id: string; rank: number; count: number; due_on: string; amount: number | string }
export type PaymentRow = { id: string; installment_id: string; family_id: string; amount: number | string; method: Payment['method']; reference: string; bank: string; received_on: string; cashed_on: string | null; deposit_slip_id: string | null; created_at: string }
export type DepositSlipRow = { id: string; number: number; created_at: string; deposited_on: string | null }
export type CategoryRow = { id: string; kind: LedgerCategory['kind']; label: string; system: boolean; archived: boolean }
export type EventRow = { id: string; season_id: string | null; name: string; date: string; kind: SchoolEvent['kind']; place: string; budget: number | string }
export type AttachmentRow = { id: string; storage_path: string; filename: string; mime: string; size: number; uploaded_by: string | null; created_at: string }
export type EntryRow = { id: string; date: string; kind: LedgerEntry['kind']; category_id: string; amount: number | string; label: string; event_id: string | null; payment_id: string | null; method: LedgerEntry['method']; attachment_id: string | null; source: LedgerEntry['source']; created_by: string | null; created_at: string }
export type StaffRow = { id: string; full_name: string; email: string; role: StaffProfile['role']; active: boolean }
export type AuditRow = { id: number; at: string; actor_id: string | null; actor: string; action: string; entity: string; entity_id: string | null; details: string }
export type MailRow = { id: string; to_email: string; subject: string; body: string; kind: MailMessage['kind']; status: MailMessage['status']; created_at: string; sent_at: string | null; validated_by: string | null }
export type SettingsRow = { id: number; school_name: string; school_address: string; school_email: string; exercise_start_month: number; exercise_start_day: number; retention_years: number; required_documents: string[] }

type T<Row> = { Row: Row; Insert: Partial<Row>; Update: Partial<Row>; Relationships: [] };
export type Database = {
  public: {
    Tables: {
      settings: T<SettingsRow>; seasons: T<SeasonRow>; families: T<FamilyRow>; guardians: T<GuardianRow>; students: T<StudentRow>; courses: T<CourseRow>;
      fee_grid: T<FeeGridRow>; fee_rules: T<FeeRulesRow>; enrollments: T<EnrollmentRow>; waitlist: T<WaitlistRow>; installments: T<InstallmentRow>;
      payments: T<PaymentRow>; deposit_slips: T<DepositSlipRow>; ledger_categories: T<CategoryRow>; events: T<EventRow>; attachments: T<AttachmentRow>;
      ledger_entries: T<EntryRow>; staff_profiles: T<StaffRow>; audit_log: T<AuditRow>; mail_outbox: T<MailRow>;
    };
    Views: Record<never, never>;
    Functions: {
      public_catalog: { Args: Record<string, never>; Returns: unknown };
      create_deposit_slip: { Args: { p_payment_ids: string[] }; Returns: DepositSlipRow };
      mark_deposited: { Args: { p_slip: string; p_date: string }; Returns: null };
      merge_family: { Args: { p_from: string; p_into: string }; Returns: null };
      purge_preview: { Args: Record<string, never>; Returns: { families: number; students: number; enrollments: number; before: string } };
      purge_old_seasons: { Args: Record<string, never>; Returns: { families: number; students: number; enrollments: number; before: string } };
      sibling_lookup: { Args: { p_family_name: string; p_postal_code: string; p_email: string }; Returns: boolean };
      hit_rate_limit: { Args: { p_key: string; p_max: number; p_window_seconds: number }; Returns: boolean };
    };
    Enums: Record<never, never>;
    CompositeTypes: Record<never, never>;
  };
}

const n = (v: number | string): number => (typeof v === 'number' ? v : Number(v));
const d = (v: string | null): string | null => (v ? v.slice(0, 10) : null);
const ts = (v: string | null): string | null => (v ? v.slice(0, 19) : null);

export const toSeason = (r: SeasonRow): Season => ({ id: r.id, label: r.label, startsOn: r.starts_on, endsOn: r.ends_on, isCurrent: r.is_current, registrationOpen: r.registration_open, installmentDates: r.installment_dates });
export const fromSeason = (s: Season): SeasonRow => ({ id: s.id, label: s.label, starts_on: s.startsOn, ends_on: s.endsOn, is_current: s.isCurrent, registration_open: s.registrationOpen, installment_dates: s.installmentDates });
export const toFamily = (r: FamilyRow): Family => ({ id: r.id, familyName: r.family_name, postalCode: r.postal_code, commune: r.commune, address: r.address, siblingCheck: r.sibling_check, reinscriptionToken: r.reinscription_token, createdAt: ts(r.created_at)!, notes: r.notes });
export const toGuardian = (r: GuardianRow): Guardian => ({ id: r.id, familyId: r.family_id, firstName: r.first_name, lastName: r.last_name, email: r.email, phone: r.phone, relation: r.relation, isPrimary: r.is_primary });
export const toStudent = (r: StudentRow): Student => ({ id: r.id, familyId: r.family_id, firstName: r.first_name, lastName: r.last_name, birthDate: r.birth_date });
export const toCourse = (r: CourseRow): Course => ({ id: r.id, seasonId: r.season_id, discipline: r.discipline, kind: r.kind, formula: r.formula, teacher: r.teacher, slots: r.slots, capacity: r.capacity, levels: r.levels, requiresFm: r.requires_fm, abbr: r.abbr, color: r.color, active: r.active });
export const fromCourse = (c: Omit<Course, 'id'> & { id?: string }): Partial<CourseRow> => ({ ...(c.id ? { id: c.id } : {}), season_id: c.seasonId, discipline: c.discipline, kind: c.kind, formula: c.formula, teacher: c.teacher, slots: c.slots, capacity: c.capacity, levels: c.levels, requires_fm: c.requiresFm, abbr: c.abbr, color: c.color, active: c.active });
export const toFeeLine = (r: FeeGridRow): FeeLine => ({ id: r.id, seasonId: r.season_id, formula: r.formula, public: r.public, residence: r.residence, amount: n(r.amount) });
export const toFeeRules = (r: FeeRulesRow): FeeRules => ({ seasonId: r.season_id, formulas: r.formulas, siblingDiscountPct: n(r.sibling_discount_pct), siblingFromRank: r.sibling_from_rank, siblingChildrenOnly: r.sibling_children_only, adhesionAmount: n(r.adhesion_amount), adultAge: r.adult_age, communes: r.communes, fmFormula: r.fm_formula, fmIncludedForChildren: r.fm_included_for_children });
export const fromFeeRules = (f: FeeRules): FeeRulesRow => ({ season_id: f.seasonId, formulas: f.formulas, sibling_discount_pct: f.siblingDiscountPct, sibling_from_rank: f.siblingFromRank, sibling_children_only: f.siblingChildrenOnly, adhesion_amount: f.adhesionAmount, adult_age: f.adultAge, communes: f.communes, fm_formula: f.fmFormula, fm_included_for_children: f.fmIncludedForChildren });
export const toEnrollment = (r: EnrollmentRow): Enrollment => ({
  id: r.id, seasonId: r.season_id, studentId: r.student_id, familyId: r.family_id, courseId: r.course_id, fmCourseId: r.fm_course_id, level: r.level, slot: r.slot, status: r.status,
  public: r.public, residence: r.residence, siblingRank: r.sibling_rank, pricing: r.pricing, plan: r.plan, intendedMethod: r.intended_method, source: r.source, siblingCheck: r.sibling_check,
  imageRights: r.image_rights, imageRightsAt: ts(r.image_rights_at), rulesAcceptedAt: ts(r.rules_accepted_at), privacyAckAt: ts(r.privacy_ack_at), documentsReceived: r.documents_received,
  createdAt: ts(r.created_at)!, validatedAt: ts(r.validated_at),
});
export const fromEnrollment = (e: Omit<Enrollment, 'id'> & { id?: string }): Partial<EnrollmentRow> => ({
  ...(e.id ? { id: e.id } : {}), season_id: e.seasonId, student_id: e.studentId, family_id: e.familyId, course_id: e.courseId, fm_course_id: e.fmCourseId, level: e.level, slot: e.slot, status: e.status,
  public: e.public, residence: e.residence, sibling_rank: e.siblingRank, pricing: e.pricing, total: e.pricing.total, plan: e.plan, intended_method: e.intendedMethod, source: e.source,
  sibling_check: e.siblingCheck, image_rights: e.imageRights, image_rights_at: e.imageRightsAt, rules_accepted_at: e.rulesAcceptedAt, privacy_ack_at: e.privacyAckAt, documents_received: e.documentsReceived,
  validated_at: e.validatedAt,
});
export const toWaitlist = (r: WaitlistRow): WaitlistEntry => ({ id: r.id, seasonId: r.season_id, courseId: r.course_id, studentId: r.student_id, familyId: r.family_id, level: r.level, slot: r.slot, plan: r.plan, intendedMethod: r.intended_method, imageRights: r.image_rights, consentAt: ts(r.consent_at)!, createdAt: ts(r.created_at)!, status: r.status, proposedAt: ts(r.proposed_at) });
export const toInstallment = (r: InstallmentRow): Installment => ({ id: r.id, enrollmentId: r.enrollment_id, familyId: r.family_id, seasonId: r.season_id, rank: r.rank, count: r.count, dueOn: r.due_on, amount: n(r.amount) });
export const toPayment = (r: PaymentRow): Payment => ({ id: r.id, installmentId: r.installment_id, familyId: r.family_id, amount: n(r.amount), method: r.method, reference: r.reference, bank: r.bank, receivedOn: r.received_on, cashedOn: d(r.cashed_on), depositSlipId: r.deposit_slip_id, createdAt: ts(r.created_at)! });
export const toSlip = (r: DepositSlipRow, payments: PaymentRow[]): DepositSlip => ({ id: r.id, number: r.number, createdAt: ts(r.created_at)!, depositedOn: d(r.deposited_on), paymentIds: payments.filter((p) => p.deposit_slip_id === r.id).map((p) => p.id) });
export const toCategory = (r: CategoryRow): LedgerCategory => ({ id: r.id, kind: r.kind, label: r.label, system: r.system, archived: r.archived });
export const toEvent = (r: EventRow): SchoolEvent => ({ id: r.id, seasonId: r.season_id ?? '', name: r.name, date: r.date, kind: r.kind, place: r.place, budget: n(r.budget) });
export const toAttachment = (r: AttachmentRow): Attachment => ({ id: r.id, filename: r.filename, mime: r.mime, size: r.size, createdAt: ts(r.created_at)! });
export const toEntry = (r: EntryRow): LedgerEntry => ({ id: r.id, date: r.date, kind: r.kind, categoryId: r.category_id, amount: n(r.amount), label: r.label, eventId: r.event_id, paymentId: r.payment_id, method: r.method, attachmentId: r.attachment_id, source: r.source, createdAt: ts(r.created_at)! });
export const toStaff = (r: StaffRow): StaffProfile => ({ id: r.id, fullName: r.full_name, email: r.email, role: r.role, active: r.active });
export const toAudit = (r: AuditRow): AuditEntry => ({ id: String(r.id), at: ts(r.at)!, actor: r.actor, action: r.action, entity: r.entity, entityId: r.entity_id, details: r.details });
export const toMail = (r: MailRow): MailMessage => ({ id: r.id, to: r.to_email, subject: r.subject, body: r.body, kind: r.kind, status: r.status, createdAt: ts(r.created_at)!, sentAt: ts(r.sent_at), validatedBy: r.validated_by });
export const toSettings = (r: SettingsRow): Settings => ({ schoolName: r.school_name, schoolAddress: r.school_address, schoolEmail: r.school_email, exerciseStartMonth: r.exercise_start_month, exerciseStartDay: r.exercise_start_day, retentionYears: r.retention_years, requiredDocuments: r.required_documents });
export const fromSettings = (s: Settings): Partial<SettingsRow> => ({ id: 1, school_name: s.schoolName, school_address: s.schoolAddress, school_email: s.schoolEmail, exercise_start_month: s.exerciseStartMonth, exercise_start_day: s.exerciseStartDay, retention_years: s.retentionYears, required_documents: s.requiredDocuments });
