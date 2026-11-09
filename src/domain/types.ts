// Types du domaine, communs au navigateur et aux fonctions Edge (aucune dépendance).

export type Role = 'presidence' | 'tresorerie' | 'secretariat';
export type Public = 'enfant' | 'adulte';
export type Residence = 'commune' | 'hors_commune';
export type PaymentMethod = 'cheque' | 'virement' | 'ancv' | 'especes';
export type InstallmentStatus = 'prevu' | 'a_remettre' | 'encaisse' | 'en_retard';
export type SiblingCheck = 'aucun' | 'trouvee' | 'a_verifier' | 'validee';
export type EnrollmentStatus = 'a_valider' | 'validee' | 'annulee';
export type EnrollmentSource = 'en_ligne' | 'guichet' | 'reinscription' | 'liste_attente';
export type CourseKind = 'instrument' | 'collectif' | 'fm';
export type EventKind = 'audition' | 'concert' | 'stage' | 'autre';
export type LedgerKind = 'recette' | 'depense';
export type WaitlistStatus = 'en_attente' | 'proposee' | 'acceptee' | 'refusee';
export type Plan = 1 | 3;

export interface Season {
  id: string;
  label: string; // « 2026-2027 »
  startsOn: string; // ISO yyyy-mm-dd
  endsOn: string;
  isCurrent: boolean;
  registrationOpen: boolean;
  /** Dates d'échéance pour un règlement en 3 fois (la 1re sert aussi au règlement en 1 fois). */
  installmentDates: string[];
}

export interface Family {
  id: string;
  familyName: string;
  postalCode: string;
  commune: string;
  address: string;
  siblingCheck: SiblingCheck;
  reinscriptionToken: string;
  createdAt: string;
  notes: string;
}

export interface Guardian {
  id: string;
  familyId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  relation: string;
  isPrimary: boolean;
}

export interface Student {
  id: string;
  familyId: string;
  firstName: string;
  lastName: string;
  birthDate: string;
}

export interface Course {
  id: string;
  seasonId: string;
  discipline: string;
  kind: CourseKind;
  formula: string; // code de formule de la grille tarifaire
  teacher: string;
  slots: string[]; // créneaux proposés
  capacity: number;
  levels: string[];
  requiresFm: boolean; // la formation musicale s'ajoute d'office (enfants)
  abbr: string;
  color: string;
  active: boolean;
}

export interface PriceLine {
  label: string;
  amount: number;
  kind: 'base' | 'fm' | 'reduction' | 'adhesion';
  note?: string;
}

export interface PriceBreakdown {
  lines: PriceLine[];
  base: number;
  fm: number;
  siblingDiscount: number;
  adhesion: number;
  total: number;
}

export interface Enrollment {
  id: string;
  seasonId: string;
  studentId: string;
  familyId: string;
  courseId: string;
  fmCourseId: string | null;
  level: string;
  slot: string;
  status: EnrollmentStatus;
  public: Public;
  residence: Residence;
  siblingRank: number;
  pricing: PriceBreakdown;
  plan: Plan;
  intendedMethod: PaymentMethod;
  source: EnrollmentSource;
  siblingCheck: SiblingCheck;
  imageRights: boolean | null;
  imageRightsAt: string | null;
  rulesAcceptedAt: string | null;
  privacyAckAt: string | null;
  documentsReceived: string[];
  createdAt: string;
  validatedAt: string | null;
}

export interface WaitlistEntry {
  id: string;
  seasonId: string;
  courseId: string;
  studentId: string;
  familyId: string;
  level: string;
  slot: string;
  plan: Plan;
  intendedMethod: PaymentMethod;
  imageRights: boolean | null;
  consentAt: string;
  createdAt: string;
  status: WaitlistStatus;
  proposedAt: string | null;
}

export interface Formula {
  code: string;
  label: string;
}

export interface FeeLine {
  id: string;
  seasonId: string;
  formula: string;
  public: Public;
  residence: Residence;
  amount: number;
}

export interface FeeRules {
  seasonId: string;
  formulas: Formula[];
  siblingDiscountPct: number; // ex. 10 pour −10 %
  siblingFromRank: number; // la réduction s'applique à partir de ce rang (2 = 2e enfant)
  siblingChildrenOnly: boolean; // seuls les enfants comptent dans la fratrie
  adhesionAmount: number; // adhésion familiale, une fois par famille et par saison
  adultAge: number; // âge au 1er jour de la saison à partir duquel on est adulte
  communes: string[]; // communes au tarif « commune »
  fmFormula: string; // formule appliquée à la formation musicale ajoutée d'office
  fmIncludedForChildren: boolean; // la FM est comprise dans le tarif instrument des enfants
}

export interface Installment {
  id: string;
  enrollmentId: string;
  familyId: string;
  seasonId: string;
  rank: number;
  count: number;
  dueOn: string;
  amount: number;
}

export interface Payment {
  id: string;
  installmentId: string;
  familyId: string;
  amount: number;
  method: PaymentMethod;
  reference: string;
  bank: string;
  receivedOn: string;
  cashedOn: string | null;
  depositSlipId: string | null;
  createdAt: string;
}

export interface DepositSlip {
  id: string;
  number: number;
  createdAt: string;
  depositedOn: string | null;
  paymentIds: string[];
}

export interface LedgerCategory {
  id: string;
  kind: LedgerKind;
  label: string;
  system: boolean; // catégorie alimentée automatiquement (inscriptions)
  archived: boolean;
}

export interface LedgerEntry {
  id: string;
  date: string;
  kind: LedgerKind;
  categoryId: string;
  amount: number;
  label: string;
  eventId: string | null;
  paymentId: string | null; // renseigné pour les recettes automatiques
  method: PaymentMethod | null;
  attachmentId: string | null;
  source: 'auto' | 'manuel';
  createdAt: string;
}

export interface SchoolEvent {
  id: string;
  seasonId: string;
  name: string;
  date: string;
  kind: EventKind;
  place: string;
  budget: number;
}

export interface Attachment {
  id: string;
  filename: string;
  mime: string;
  size: number;
  createdAt: string;
}

export interface StaffProfile {
  id: string;
  fullName: string;
  email: string;
  role: Role;
  active: boolean;
}

export interface AuditEntry {
  id: string;
  at: string;
  actor: string;
  action: string;
  entity: string;
  entityId: string | null;
  details: string;
}

export interface MailMessage {
  id: string;
  to: string;
  subject: string;
  body: string;
  kind: 'confirmation' | 'relance' | 'proposition_place' | 'reinscription' | 'connexion';
  status: 'brouillon' | 'envoye';
  createdAt: string;
  sentAt: string | null;
  validatedBy: string | null;
}

export interface Settings {
  schoolName: string;
  schoolAddress: string;
  schoolEmail: string;
  exerciseStartMonth: number; // 9 = septembre
  exerciseStartDay: number;
  retentionYears: number; // conservation après la dernière saison
  requiredDocuments: string[];
}
