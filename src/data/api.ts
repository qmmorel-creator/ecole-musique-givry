// Contrat de la couche d'accès aux données. Deux implémentations : demo (active) et supabase.
import type {
  Attachment, AuditEntry, Course, DepositSlip, Enrollment, Family, FeeLine, FeeRules, Guardian, Installment,
  LedgerCategory, LedgerEntry, MailMessage, Payment, PaymentMethod, Plan, PriceBreakdown, Role, SchoolEvent, Season,
  Settings, StaffProfile, Student, WaitlistEntry,
} from '../domain/types.ts';
import type { InscriptionInput, SiblingLookupResult, SiblingQuery } from '../domain/index.ts';

/** Ce que le public peut voir : aucune donnée personnelle. */
export interface PublicCourse {
  id: string;
  discipline: string;
  kind: Course['kind'];
  formula: string;
  teacher: string;
  slots: string[];
  levels: string[];
  requiresFm: boolean;
  abbr: string;
  color: string;
  remaining: number;
}

export interface PublicCatalog {
  season: Season;
  courses: PublicCourse[];
  /** Cours de formation musicale, pour l'affichage du cours ajouté d'office. */
  fmCourses: PublicCourse[];
  grid: FeeLine[];
  rules: FeeRules;
  settings: Pick<Settings, 'schoolName' | 'schoolEmail' | 'retentionYears'>;
}

export interface SubmitResult {
  outcome: 'inscription' | 'liste_attente';
  reference: string;
  pricing: PriceBreakdown;
  installments: { rank: number; count: number; dueOn: string; amount: number }[];
  siblingCheck: Enrollment['siblingCheck'];
  /** Permet d'inscrire un autre enfant de la même famille juste après, sans rien révéler d'autre. */
  continuationToken: string;
}

export interface ReinscriptionStudent {
  studentId: string;
  firstName: string;
  previousDiscipline: string;
  previousLevel: string;
  previousCourseId: string | null;
}

export interface ReinscriptionData {
  familyName: string;
  guardianFirstName: string;
  guardianEmail: string;
  commune: string;
  season: Season;
  students: ReinscriptionStudent[];
}

export interface ReinscriptionChoice {
  studentId: string;
  courseId: string;
  level: string;
  slot: string;
}

export interface ReinscriptionInput {
  choices: ReinscriptionChoice[];
  plan: Plan;
  intendedMethod: PaymentMethod;
  imageRights: boolean;
  rulesAccepted: boolean;
  privacyAck: boolean;
}

export interface Snapshot {
  seasons: Season[];
  families: Family[];
  guardians: Guardian[];
  students: Student[];
  courses: Course[];
  enrollments: Enrollment[];
  waitlist: WaitlistEntry[];
  feeLines: FeeLine[];
  feeRules: FeeRules[];
  installments: Installment[];
  payments: Payment[];
  depositSlips: DepositSlip[];
  categories: LedgerCategory[];
  entries: LedgerEntry[];
  events: SchoolEvent[];
  attachments: Attachment[];
  staff: StaffProfile[];
  audit: AuditEntry[];
  mails: MailMessage[];
  settings: Settings;
}

export interface Session {
  staff: StaffProfile;
}

export interface PaymentInput {
  installmentId: string;
  amount: number;
  method: PaymentMethod;
  reference: string;
  bank: string;
  receivedOn: string;
}

export interface LedgerEntryInput {
  id?: string;
  date: string;
  kind: LedgerEntry['kind'];
  categoryId: string;
  amount: number;
  label: string;
  eventId: string | null;
  method: PaymentMethod | null;
  attachmentId: string | null;
}

export interface PurgePreview {
  families: number;
  students: number;
  enrollments: number;
  before: string;
}

export interface PublicApi {
  getCatalog(): Promise<PublicCatalog>;
  lookupSibling(q: SiblingQuery): Promise<SiblingLookupResult>;
  submitInscription(input: InscriptionInput): Promise<SubmitResult>;
  getReinscription(token: string): Promise<ReinscriptionData | null>;
  submitReinscription(token: string, input: ReinscriptionInput): Promise<SubmitResult[]>;
}

export interface StaffApi {
  /** Mode demo : sélecteur de rôle. Mode supabase : lien magique. */
  readonly loginMode: 'role' | 'magic_link';
  getSession(): Promise<Session | null>;
  signInWithRole(role: Role): Promise<Session>;
  sendMagicLink(email: string): Promise<void>;
  signOut(): Promise<void>;

  load(): Promise<Snapshot>;

  // Élèves et dossiers
  validateEnrollment(id: string): Promise<void>;
  cancelEnrollment(id: string): Promise<void>;
  updateEnrollment(id: string, patch: Partial<Pick<Enrollment, 'imageRights' | 'documentsReceived' | 'level' | 'slot'>>): Promise<void>;
  resolveSibling(familyId: string, decision: { attachTo: string | null }): Promise<void>;
  updateFamily(id: string, patch: Partial<Pick<Family, 'address' | 'postalCode' | 'commune' | 'notes'>>): Promise<void>;
  updateGuardian(id: string, patch: Partial<Pick<Guardian, 'email' | 'phone' | 'firstName' | 'lastName' | 'relation'>>): Promise<void>;

  // Places et liste d'attente
  proposePlace(waitlistId: string): Promise<void>;
  acceptWaitlist(waitlistId: string): Promise<void>;
  refuseWaitlist(waitlistId: string): Promise<void>;

  // Encaissements
  recordPayment(input: PaymentInput): Promise<void>;
  deletePayment(id: string): Promise<void>;
  createDepositSlip(paymentIds: string[]): Promise<DepositSlip>;
  markDeposited(slipId: string, depositedOn: string): Promise<void>;
  prepareReminders(installmentIds: string[]): Promise<void>;
  sendMails(mailIds: string[]): Promise<void>;
  discardMails(mailIds: string[]): Promise<void>;
  sendReinscriptionLinks(familyIds: string[]): Promise<void>;

  // Comptabilité
  saveLedgerEntry(input: LedgerEntryInput): Promise<void>;
  deleteLedgerEntry(id: string): Promise<void>;
  uploadAttachment(file: File): Promise<Attachment>;
  attachmentUrl(id: string): Promise<string>;
  saveCategory(c: Omit<LedgerCategory, 'id' | 'system'> & { id?: string }): Promise<void>;
  saveEvent(e: Omit<SchoolEvent, 'id'> & { id?: string }): Promise<void>;

  // Paramètres
  saveCourse(c: Omit<Course, 'id'> & { id?: string }): Promise<void>;
  saveFeeLines(lines: FeeLine[]): Promise<void>;
  saveFeeRules(rules: FeeRules): Promise<void>;
  saveSeason(s: Season): Promise<void>;
  saveSettings(s: Settings): Promise<void>;

  // RGPD
  purgePreview(): Promise<PurgePreview>;
  purge(): Promise<PurgePreview>;
}

export interface DataSource {
  readonly kind: 'demo' | 'supabase';
  readonly publicApi: PublicApi;
  readonly staffApi: StaffApi;
  /** Mode demo uniquement. */
  resetDemo?: () => void;
  /** Mode demo uniquement : mails simulés adressés à une adresse (journal à l'écran). */
  demoMailsTo?: (email: string) => MailMessage[];
}

export class ApiError extends Error {
  constructor(message: string, public readonly fieldErrors?: Record<string, string>) {
    super(message);
  }
}
