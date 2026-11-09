// Jeu d'essai entièrement fictif et déterministe. Aucune donnée réelle.
import type { Snapshot } from '../api.ts';
import type {
  Course, Enrollment, Family, FeeLine, FeeRules, Guardian, Installment, LedgerCategory, LedgerEntry, MailMessage,
  Payment, PaymentMethod, Plan, SchoolEvent, Season, Settings, StaffProfile, Student, WaitlistEntry, DepositSlip, AuditEntry,
} from '../../domain/types.ts';
import { addDays, computePrice, familyHasAdhesion, planInstallments, publicFor, residenceFor, round2, siblingRankFor, syncAutoEntries, INSCRIPTIONS_CATEGORY_ID } from '../../domain/index.ts';

export const DEMO_TODAY = '2026-11-09';

function rng(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SURNAMES = ['Bernard', 'Garnier', 'Lefèvre', 'Faure', 'Durand', 'Simon', 'Chevalier', 'Laurent', 'Michel', 'Lambert', 'Fontaine', 'Rousseau', 'Vincent', 'Mercier', 'Blanc', 'Guérin', 'Boyer', 'Girard', 'André', 'Bonnet', 'Lemoine', 'Perrin', 'Clément', 'Gauthier', 'Robin', 'Masson', 'Henry', 'Roussel', 'Mathieu', 'Picard', 'Brun', 'Gaillard', 'Barbier', 'Arnaud', 'Gérard', 'Roche', 'Renard', 'Colin', 'Aubert', 'Vidal', 'Noël', 'Meyer', 'Caron', 'Dumont', 'Fournier', 'Leclerc', 'Dufour', 'Marchand', 'Benoît', 'Lacroix', 'Charpentier', 'Prévost', 'Joly', 'Carré', 'Collet', 'Baron', 'Huet', 'Brunet', 'Hubert', 'Royer', 'Bertin', 'Lebrun', 'Paris', 'Giraud', 'Leroy', 'Cordier', 'Besson', 'Monnier', 'Jacquet', 'Bouvier', 'Poirier', 'Tessier', 'Millet'];
const KID_F = ['Chloé', 'Inès', 'Lou', 'Emma', 'Léa', 'Jade', 'Zoé', 'Manon', 'Rose', 'Nina', 'Alice', 'Louise', 'Lina', 'Mila', 'Anna', 'Julia', 'Lola', 'Camille', 'Romane', 'Clara', 'Eva', 'Agathe', 'Margaux', 'Elsa', 'Iris', 'Capucine', 'Maëlys', 'Lucie', 'Juliette', 'Ambre'];
const KID_M = ['Tom', 'Noé', 'Hugo', 'Lucas', 'Maël', 'Arthur', 'Sacha', 'Élio', 'Léon', 'Gabriel', 'Raphaël', 'Louis', 'Jules', 'Adam', 'Paul', 'Nathan', 'Ethan', 'Théo', 'Victor', 'Martin', 'Robin', 'Malo', 'Gaspard', 'Axel', 'Timéo', 'Baptiste', 'Antoine', 'Simon', 'Valentin', 'Mathis'];
const ADULT_F = ['Martine', 'Sylvie', 'Nathalie', 'Isabelle', 'Sophie', 'Valérie', 'Céline', 'Aurélie', 'Laure', 'Catherine', 'Christine', 'Hélène', 'Anne', 'Corinne', 'Véronique', 'Élodie', 'Sandrine', 'Patricia'];
const ADULT_M = ['Paul', 'Philippe', 'Laurent', 'Éric', 'Olivier', 'Stéphane', 'Thierry', 'Pascal', 'Christophe', 'Frédéric', 'Jérôme', 'Bruno', 'Didier', 'Vincent', 'Alain', 'Gilles'];
const COMMUNES: [string, string, number][] = [
  ['Givry', '71640', 40], ['Mellecey', '71640', 9], ['Jambles', '71640', 6], ['Dracy-le-Fort', '71640', 8], ['Saint-Désert', '71390', 6],
  ['Saint-Denis-de-Vaux', '71640', 4], ['Chalon-sur-Saône', '71100', 10], ['Barizey', '71640', 3], ['Rully', '71150', 5], ['Mercurey', '71640', 5], ['Moroges', '71390', 4],
];
const STREETS = ['rue de la République', 'rue du Moulin', 'chemin des Vignes', 'rue des Écoles', 'place de la Halle', 'rue Saint-Martin', 'allée des Tilleuls', 'route de Chalon', 'rue du Lavoir', 'impasse des Roses'];

interface CourseDef {
  key: string; discipline: string; kind: Course['kind']; formula: string; teacher: string; capacity: number; enrolled: number;
  adults: number; abbr: string; color: string; slots: string[]; levels: string[]; requiresFm: boolean; minAge: number; maxAge: number;
}

const INSTRUMENT_LEVELS = ['1re année', '2e année', '3e année', '4e année', '5e année', 'Cycle 2', 'Adulte débutant', 'Adulte confirmé'];

const COURSES: CourseDef[] = [
  { key: 'piano', discipline: 'Piano', kind: 'instrument', formula: 'instrument_30', teacher: 'Sophie L.', capacity: 14, enrolled: 14, adults: 2, abbr: 'Pi', color: '#344054', slots: ['Mar. 17 h', 'Mar. 17 h 30', 'Mer. 10 h', 'Mer. 14 h'], levels: INSTRUMENT_LEVELS, requiresFm: true, minAge: 7, maxAge: 16 },
  { key: 'guitare', discipline: 'Guitare', kind: 'instrument', formula: 'instrument_30', teacher: 'Julien M.', capacity: 18, enrolled: 16, adults: 3, abbr: 'Gu', color: '#27844b', slots: ['Mar. 17 h 30', 'Mer. 14 h', 'Mer. 15 h 30', 'Sam. 10 h'], levels: INSTRUMENT_LEVELS, requiresFm: true, minAge: 7, maxAge: 17 },
  { key: 'batterie', discipline: 'Batterie', kind: 'instrument', formula: 'instrument_30', teacher: 'Thomas R.', capacity: 8, enrolled: 8, adults: 0, abbr: 'Ba', color: '#c4320a', slots: ['Ven. 17 h', 'Ven. 18 h'], levels: INSTRUMENT_LEVELS, requiresFm: true, minAge: 8, maxAge: 17 },
  { key: 'flute', discipline: 'Flûte traversière', kind: 'instrument', formula: 'instrument_30', teacher: 'Claire B.', capacity: 10, enrolled: 6, adults: 1, abbr: 'Fl', color: '#1d73c0', slots: ['Mer. 16 h', 'Mer. 17 h'], levels: INSTRUMENT_LEVELS, requiresFm: true, minAge: 7, maxAge: 16 },
  { key: 'clarinette', discipline: 'Clarinette', kind: 'instrument', formula: 'instrument_30', teacher: 'Claire B.', capacity: 8, enrolled: 5, adults: 0, abbr: 'Cl', color: '#5b4bc4', slots: ['Mer. 10 h', 'Mer. 11 h'], levels: INSTRUMENT_LEVELS, requiresFm: true, minAge: 8, maxAge: 16 },
  { key: 'saxophone', discipline: 'Saxophone', kind: 'instrument', formula: 'instrument_30', teacher: 'Marc V.', capacity: 8, enrolled: 7, adults: 1, abbr: 'Sx', color: '#0e7c70', slots: ['Lun. 18 h', 'Lun. 18 h 30'], levels: INSTRUMENT_LEVELS, requiresFm: true, minAge: 9, maxAge: 17 },
  { key: 'trompette', discipline: 'Trompette', kind: 'instrument', formula: 'instrument_30', teacher: 'Marc V.', capacity: 8, enrolled: 4, adults: 0, abbr: 'Tp', color: '#b35c00', slots: ['Lun. 17 h', 'Lun. 17 h 30'], levels: INSTRUMENT_LEVELS, requiresFm: true, minAge: 8, maxAge: 17 },
  { key: 'violon', discipline: 'Violon', kind: 'instrument', formula: 'instrument_30', teacher: 'Élise G.', capacity: 8, enrolled: 6, adults: 0, abbr: 'Vi', color: '#9a3b06', slots: ['Mer. 11 h', 'Mer. 13 h 30'], levels: INSTRUMENT_LEVELS, requiresFm: true, minAge: 6, maxAge: 15 },
  { key: 'accordeon', discipline: 'Accordéon', kind: 'instrument', formula: 'instrument_30', teacher: 'Bruno K.', capacity: 6, enrolled: 3, adults: 2, abbr: 'Ac', color: '#9e2fae', slots: ['Jeu. 18 h', 'Jeu. 18 h 30'], levels: INSTRUMENT_LEVELS, requiresFm: true, minAge: 8, maxAge: 16 },
  { key: 'eveil', discipline: 'Éveil musical', kind: 'collectif', formula: 'eveil', teacher: 'Anne P.', capacity: 12, enrolled: 11, adults: 0, abbr: 'Év', color: '#c2185b', slots: ['Sam. 10 h', 'Sam. 11 h'], levels: ['Éveil 5 ans', 'Éveil 6 ans'], requiresFm: false, minAge: 5, maxAge: 6 },
  { key: 'chorale', discipline: 'Chorale adulte', kind: 'collectif', formula: 'chorale', teacher: 'Anne P.', capacity: 25, enrolled: 14, adults: 14, abbr: 'Ch', color: '#8a5a00', slots: ['Jeu. 20 h'], levels: ['Tous niveaux'], requiresFm: false, minAge: 18, maxAge: 70 },
  { key: 'fm1', discipline: 'Formation musicale cycle 1', kind: 'fm', formula: 'fm_seule', teacher: 'Anne P.', capacity: 60, enrolled: 0, adults: 0, abbr: 'FM', color: '#475467', slots: ['Mer. 15 h'], levels: ['1re année', '2e année', '3e année', '4e année', 'Adulte débutant'], requiresFm: false, minAge: 6, maxAge: 99 },
  { key: 'fm2', discipline: 'Formation musicale cycle 2', kind: 'fm', formula: 'fm_seule', teacher: 'Claire B.', capacity: 30, enrolled: 0, adults: 0, abbr: 'FM', color: '#475467', slots: ['Mer. 17 h 30'], levels: ['5e année', 'Cycle 2', 'Adulte confirmé'], requiresFm: false, minAge: 10, maxAge: 99 },
];

export const DEFAULT_FORMULAS = [
  { code: 'instrument_30', label: 'Cours individuel 30 min' },
  { code: 'eveil', label: 'Éveil musical (collectif)' },
  { code: 'chorale', label: 'Chorale (collectif)' },
  { code: 'fm_seule', label: 'Formation musicale seule' },
];

function gridFor(seasonId: string, factor: number): FeeLine[] {
  const base: [string, number, number, number, number][] = [
    // formule, enfant commune, enfant hors commune, adulte commune, adulte hors commune
    ['instrument_30', 310, 345, 390, 430],
    ['eveil', 150, 170, 150, 170],
    ['chorale', 90, 100, 120, 140],
    ['fm_seule', 120, 140, 140, 160],
  ];
  const out: FeeLine[] = [];
  for (const [formula, ec, eh, ac, ah] of base) {
    const v = (n: number) => Math.round(n * factor);
    out.push({ id: `${seasonId}-${formula}-ec`, seasonId, formula, public: 'enfant', residence: 'commune', amount: v(ec) });
    out.push({ id: `${seasonId}-${formula}-eh`, seasonId, formula, public: 'enfant', residence: 'hors_commune', amount: v(eh) });
    out.push({ id: `${seasonId}-${formula}-ac`, seasonId, formula, public: 'adulte', residence: 'commune', amount: v(ac) });
    out.push({ id: `${seasonId}-${formula}-ah`, seasonId, formula, public: 'adulte', residence: 'hors_commune', amount: v(ah) });
  }
  return out;
}

export const defaultRules = (seasonId: string): FeeRules => ({
  seasonId,
  formulas: DEFAULT_FORMULAS,
  siblingDiscountPct: 10,
  siblingFromRank: 2,
  siblingChildrenOnly: true,
  adhesionAmount: 20,
  adultAge: 18,
  communes: ['Givry'],
  fmFormula: 'fm_seule',
  fmIncludedForChildren: true,
});

export const DEFAULT_CATEGORIES: LedgerCategory[] = [
  { id: INSCRIPTIONS_CATEGORY_ID, kind: 'recette', label: 'Inscriptions encaissées', system: true, archived: false },
  { id: 'cat-rec-sub-commune', kind: 'recette', label: 'Subvention de la commune', system: false, archived: false },
  { id: 'cat-rec-sub-dep', kind: 'recette', label: 'Subventions du département et de la région', system: false, archived: false },
  { id: 'cat-rec-dons', kind: 'recette', label: 'Dons', system: false, archived: false },
  { id: 'cat-rec-cotisations', kind: 'recette', label: 'Cotisations et adhésions hors inscription', system: false, archived: false },
  { id: 'cat-rec-concerts', kind: 'recette', label: 'Concerts, auditions et buvette', system: false, archived: false },
  { id: 'cat-rec-stages', kind: 'recette', label: 'Stages', system: false, archived: false },
  { id: 'cat-rec-autres', kind: 'recette', label: 'Autres recettes', system: false, archived: false },
  { id: 'cat-dep-prof', kind: 'depense', label: 'Rémunération des professeurs (salaires et charges versés)', system: false, archived: false },
  { id: 'cat-dep-evenements', kind: 'depense', label: 'Événements · salle, communication, réception', system: false, archived: false },
  { id: 'cat-dep-assurance', kind: 'depense', label: 'Assurance', system: false, archived: false },
  { id: 'cat-dep-instruments', kind: 'depense', label: 'Location et entretien d’instruments', system: false, archived: false },
  { id: 'cat-dep-cmf', kind: 'depense', label: 'Cotisation fédération (CMF)', system: false, archived: false },
  { id: 'cat-dep-sacem', kind: 'depense', label: 'SACEM et droits', system: false, archived: false },
  { id: 'cat-dep-partitions', kind: 'depense', label: 'Partitions et fournitures', system: false, archived: false },
  { id: 'cat-dep-fonctionnement', kind: 'depense', label: 'Frais de fonctionnement (bureau, poste, site)', system: false, archived: false },
  { id: 'cat-dep-banque', kind: 'depense', label: 'Frais bancaires', system: false, archived: false },
  { id: 'cat-dep-autres', kind: 'depense', label: 'Autres dépenses', system: false, archived: false },
];

export const DEFAULT_SETTINGS: Settings = {
  schoolName: 'École de Musique de Givry',
  schoolAddress: 'Givry (71640)',
  schoolEmail: 'contact@ecole-musique-givry.example',
  exerciseStartMonth: 9,
  exerciseStartDay: 1,
  retentionYears: 3,
  requiredDocuments: ['Attestation d’assurance responsabilité civile'],
};

export const DEMO_STAFF: StaffProfile[] = [
  { id: 'staff-presidence', fullName: 'Hélène Marchal', email: 'presidence@ecole-musique-givry.example', role: 'presidence', active: true },
  { id: 'staff-tresorerie', fullName: 'Claire Dumas', email: 'tresorerie@ecole-musique-givry.example', role: 'tresorerie', active: true },
  { id: 'staff-secretariat', fullName: 'Nicolas Perret', email: 'secretariat@ecole-musique-givry.example', role: 'secretariat', active: true },
];

/** Semaines de réception des dossiers (lundi, poids), comme la maquette. */
const WEEKS: [string, number][] = [['2026-06-15', 28], ['2026-06-22', 19], ['2026-06-29', 11], ['2026-07-06', 6], ['2026-08-24', 9], ['2026-08-31', 17], ['2026-09-07', 8], ['2026-09-14', 4]];

export function buildSeed(): Snapshot {
  const r = rng(20261109);
  const pick = <T,>(a: T[]): T => a[Math.floor(r() * a.length)];
  const int = (min: number, max: number) => min + Math.floor(r() * (max - min + 1));
  const pad = (n: number, w = 3) => String(n).padStart(w, '0');
  const usedNames = new Set<string>();

  const seasons: Season[] = [
    { id: 's2025', label: '2025-2026', startsOn: '2025-09-01', endsOn: '2026-08-31', isCurrent: false, registrationOpen: false, installmentDates: ['2025-10-15', '2026-01-15', '2026-04-15'] },
    { id: 's2026', label: '2026-2027', startsOn: '2026-09-01', endsOn: '2027-08-31', isCurrent: true, registrationOpen: true, installmentDates: ['2026-10-15', '2027-01-15', '2027-04-15'] },
  ];
  const [past, cur] = seasons;

  const courses: Course[] = [];
  for (const s of seasons) {
    for (const c of COURSES) {
      courses.push({
        id: `${s.id}-${c.key}`, seasonId: s.id, discipline: c.discipline, kind: c.kind, formula: c.formula, teacher: c.teacher,
        slots: c.slots, capacity: c.capacity, levels: c.levels, requiresFm: c.requiresFm, abbr: c.abbr, color: c.color, active: true,
      });
    }
  }
  const feeLines = [...gridFor(past.id, 0.97), ...gridFor(cur.id, 1)];
  const feeRules = [defaultRules(past.id), defaultRules(cur.id)];

  const families: Family[] = [];
  const guardians: Guardian[] = [];
  const students: Student[] = [];

  const commune = () => {
    const total = COMMUNES.reduce((a, c) => a + c[2], 0);
    let x = r() * total;
    for (const c of COMMUNES) { x -= c[2]; if (x <= 0) return c; }
    return COMMUNES[0];
  };
  const surname = () => { let s = pick(SURNAMES); let i = 0; while (usedNames.has(s) && i++ < 200) s = pick(SURNAMES); usedNames.add(s); return s; };
  const slug = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z]/g, '');
  const phone = () => `06 ${pad(int(10, 99), 2)} ${pad(int(0, 99), 2)} ${pad(int(0, 99), 2)} ${pad(int(0, 99), 2)}`;
  const birth = (age: number, seasonStart = cur.startsOn) => { const y = Number(seasonStart.slice(0, 4)) - age - 1; return `${y}-${pad(int(9, 12), 2)}-${pad(int(1, 28), 2)}`; };

  function newFamily(name: string, forced?: [string, string]): Family {
    const [c, cp] = forced ?? commune();
    const f: Family = {
      id: `fam-${pad(families.length + 1)}`, familyName: name, postalCode: cp, commune: c, address: `${int(1, 48)} ${pick(STREETS)}`,
      siblingCheck: 'aucun', reinscriptionToken: `demo-${pad(families.length + 1)}-${Math.floor(r() * 1e9).toString(36)}`, createdAt: '2024-09-01', notes: '',
    };
    families.push(f);
    return f;
  }
  function newGuardian(f: Family, first: string, relation: string) {
    guardians.push({ id: `gua-${pad(guardians.length + 1)}`, familyId: f.id, firstName: first, lastName: f.familyName, email: `${slug(first)}.${slug(f.familyName)}@example.com`, phone: phone(), relation, isPrimary: true });
  }
  function newStudent(f: Family, first: string, birthDate: string): Student {
    const s: Student = { id: `stu-${pad(students.length + 1)}`, familyId: f.id, firstName: first, lastName: f.familyName, birthDate };
    students.push(s);
    return s;
  }

  // Inscriptions de la saison en cours : une spécification par place occupée
  interface Spec { course: CourseDef; adult: boolean }
  const specs: Spec[] = [];
  for (const c of COURSES) for (let i = 0; i < c.enrolled; i++) specs.push({ course: c, adult: i < c.adults });
  // Familles nommées, reprises de la maquette (fictives)
  const named: { family: string; commune: [string, string]; guardian: string; kids: [string, number, string, string][] }[] = [
    { family: 'Roux', commune: ['Mellecey', '71640'], guardian: 'Camille', kids: [['Chloé', 12, 'flute', '3e année'], ['Tom', 8, 'guitare', '1re année']] },
    { family: 'Barret', commune: ['Jambles', '71640'], guardian: 'Julie', kids: [['Inès', 12, 'guitare', '2e année'], ['Noé', 10, 'batterie', '2e année'], ['Lou', 6, 'eveil', 'Éveil 6 ans']] },
    { family: 'Tissot', commune: ['Givry', '71640'], guardian: 'Marion', kids: [['Emma', 9, 'clarinette', '2e année'], ['Léa', 11, 'violon', '3e année']] },
  ];
  type Plan0 = { student: Student; family: Family; course: CourseDef; level: string; adult: boolean };
  const plans: Plan0[] = [];
  const take = (key: string, adult: boolean) => {
    const i = specs.findIndex((s) => s.course.key === key && s.adult === adult);
    if (i < 0) throw new Error(`Plus de place fictive pour ${key}`);
    return specs.splice(i, 1)[0];
  };
  for (const n of named) {
    usedNames.add(n.family);
    const f = newFamily(n.family, n.commune);
    newGuardian(f, n.guardian, 'Mère');
    for (const [first, age, key, level] of n.kids) {
      const sp = take(key, false);
      plans.push({ student: newStudent(f, first, birth(age)), family: f, course: sp.course, level, adult: false });
    }
  }
  // Adultes nommés
  const adultNamed: [string, string, number, string, [string, string]][] = [['Martine', 'Gonnet', 58, 'chorale', ['Dracy-le-Fort', '71640']], ['Paul', 'Sauvage', 44, 'accordeon', ['Saint-Denis-de-Vaux', '71640']]];
  for (const [first, name, age, key, cm] of adultNamed) {
    usedNames.add(name);
    const f = newFamily(name, cm);
    guardians.push({ id: `gua-${pad(guardians.length + 1)}`, familyId: f.id, firstName: first, lastName: name, email: `${slug(first)}.${slug(name)}@example.com`, phone: phone(), relation: 'Élève majeur', isPrimary: true });
    const sp = take(key, true);
    plans.push({ student: newStudent(f, first, birth(age)), family: f, course: sp.course, level: key === 'chorale' ? 'Tous niveaux' : 'Adulte confirmé', adult: true });
  }
  // Le reste : adultes seuls, puis enfants groupés en fratries
  const shuffled = specs.sort(() => r() - 0.5);
  const adults = shuffled.filter((s) => s.adult);
  const kids = shuffled.filter((s) => !s.adult);
  for (const sp of adults) {
    const female = r() < 0.6;
    const first = pick(female ? ADULT_F : ADULT_M);
    const f = newFamily(surname());
    guardians.push({ id: `gua-${pad(guardians.length + 1)}`, familyId: f.id, firstName: first, lastName: f.familyName, email: `${slug(first)}.${slug(f.familyName)}@example.com`, phone: phone(), relation: 'Élève majeur', isPrimary: true });
    const age = sp.course.key === 'chorale' ? int(32, 72) : int(25, 60);
    plans.push({ student: newStudent(f, first, birth(age)), family: f, course: sp.course, level: sp.course.key === 'chorale' ? 'Tous niveaux' : pick(['Adulte débutant', 'Adulte confirmé']), adult: true });
  }
  const groups: number[] = [];
  let left = kids.length;
  const sizes = [3, 3, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2];
  for (const s of sizes) { if (left >= s + 1) { groups.push(s); left -= s; } }
  while (left > 0) { groups.push(1); left -= 1; }
  let k = 0;
  for (const g of groups) {
    const f = newFamily(surname());
    newGuardian(f, pick([...ADULT_F, ...ADULT_M]), pick(['Mère', 'Père', 'Mère', 'Père', 'Tutrice']));
    for (let i = 0; i < g; i++) {
      const sp = kids[k++];
      const female = r() < 0.5;
      const age = int(sp.course.minAge, sp.course.maxAge);
      const level = sp.course.kind === 'collectif' ? (age <= 5 ? 'Éveil 5 ans' : 'Éveil 6 ans') : INSTRUMENT_LEVELS[Math.min(5, Math.max(0, age - 7 - int(0, 2)))];
      plans.push({ student: newStudent(f, pick(female ? KID_F : KID_M), birth(age)), family: f, course: sp.course, level, adult: false });
    }
  }

  // Dates de dépôt, réinscriptions et statuts
  const totalWeight = WEEKS.reduce((a, w) => a + w[1], 0);
  const dayFor = (i: number, n: number) => {
    let x = ((i + 0.5) / n) * totalWeight;
    for (const [w, c] of WEEKS) { if (x <= c) return addDays(w, Math.min(5, Math.floor((x / c) * 6))); x -= c; }
    return WEEKS[WEEKS.length - 1][0];
  };
  plans.sort(() => r() - 0.5);
  // Quelques dossiers récents, encore à valider, et le cas de Tom Roux
  const lateIdx = new Set<number>();
  plans.forEach((p, i) => { if (p.student.firstName === 'Tom' && p.family.familyName === 'Roux') lateIdx.add(i); });
  for (let i = 0; lateIdx.size < 4; i++) if (!plans[i].adult) lateIdx.add(i);

  const enrollments: Enrollment[] = [];
  const installments: Installment[] = [];
  const payments: Payment[] = [];
  const depositSlips: DepositSlip[] = [];
  let enrSeq = 0;
  let instSeq = 0;
  let paySeq = 0;

  function makeEnrollment(p: Plan0, season: Season, createdAt: string, opts: { source: Enrollment['source']; status: Enrollment['status']; plan: Plan; method: PaymentMethod; imageRights: boolean | null; docs: boolean; siblingCheck?: Enrollment['siblingCheck'] }) {
    const course = courses.find((c) => c.id === `${season.id}-${p.course.key}`)!;
    const rules = feeRules.find((x) => x.seasonId === season.id)!;
    const grid = feeLines.filter((l) => l.seasonId === season.id);
    const pub = publicFor(p.student.birthDate, season.startsOn, rules.adultAge);
    const seasonEnr = enrollments.filter((e) => e.seasonId === season.id);
    const rank = siblingRankFor(p.family.id, season.id, seasonEnr, new Map(), rules, pub);
    const fm = course.requiresFm && pub === 'enfant' ? courses.find((c) => c.seasonId === season.id && c.kind === 'fm' && c.levels.includes(p.level)) ?? courses.find((c) => c.seasonId === season.id && c.kind === 'fm')! : null;
    const pricing = computePrice({ formula: course.formula, public: pub, residence: residenceFor(p.family.commune, rules), siblingRank: rank, withFm: !!fm, adhesionAlreadyCounted: familyHasAdhesion(p.family.id, season.id, seasonEnr) }, grid, rules);
    const e: Enrollment = {
      id: `enr-${pad(++enrSeq)}`, seasonId: season.id, studentId: p.student.id, familyId: p.family.id, courseId: course.id, fmCourseId: fm?.id ?? null,
      level: p.level, slot: pick(course.slots), status: opts.status, public: pub, residence: residenceFor(p.family.commune, rules), siblingRank: rank, pricing,
      plan: opts.plan, intendedMethod: opts.method, source: opts.source, siblingCheck: opts.siblingCheck ?? (rank > 1 ? 'validee' : 'aucun'),
      imageRights: opts.imageRights, imageRightsAt: opts.imageRights === null ? null : `${createdAt}T19:12:00`, rulesAcceptedAt: `${createdAt}T19:12:00`, privacyAckAt: `${createdAt}T19:12:00`,
      documentsReceived: opts.docs ? [...DEFAULT_SETTINGS.requiredDocuments] : [], createdAt: `${createdAt}T19:12:00`, validatedAt: opts.status === 'validee' ? `${addDays(createdAt, 3)}T10:00:00` : null,
    };
    enrollments.push(e);
    for (const it of planInstallments(pricing.total, opts.plan, season.installmentDates, createdAt)) {
      installments.push({ id: `ins-${pad(++instSeq, 4)}`, enrollmentId: e.id, familyId: p.family.id, seasonId: season.id, ...it });
    }
    return e;
  }

  // Saison passée : environ deux tiers des élèves actuels y étaient déjà
  const returning = plans.filter((p) => p.course.key !== 'eveil' && r() < 0.72);
  returning.forEach((p, i) => {
    const prevLevel = p.level === '1re année' ? '1re année' : INSTRUMENT_LEVELS[Math.max(0, INSTRUMENT_LEVELS.indexOf(p.level) - 1)] ?? p.level;
    const prev = { ...p, level: p.course.kind === 'collectif' ? p.level : prevLevel };
    makeEnrollment(prev, past, addDays('2025-06-16', Math.floor((i / returning.length) * 80)), { source: 'en_ligne', status: 'validee', plan: r() < 0.6 ? 3 : 1, method: r() < 0.7 ? 'cheque' : 'virement', imageRights: r() < 0.9, docs: true });
  });
  // Famille inscrite l'an dernier, pas encore réinscrite : sert à la démonstration du lien de réinscription
  {
    usedNames.add('Lemaire');
    const f = newFamily('Lemaire', ['Givry', '71640']);
    f.reinscriptionToken = 'demo-reinscription';
    newGuardian(f, 'Sandrine', 'Mère');
    const alice = newStudent(f, 'Alice', birth(10));
    const gab = newStudent(f, 'Gabriel', birth(8));
    const gu = COURSES.find((c) => c.key === 'guitare')!;
    const vi = COURSES.find((c) => c.key === 'violon')!;
    makeEnrollment({ student: alice, family: f, course: gu, level: '2e année', adult: false }, past, '2025-06-20', { source: 'en_ligne', status: 'validee', plan: 3, method: 'cheque', imageRights: true, docs: true });
    makeEnrollment({ student: gab, family: f, course: vi, level: '1re année', adult: false }, past, '2025-06-20', { source: 'en_ligne', status: 'validee', plan: 3, method: 'cheque', imageRights: true, docs: true });
  }
  const returningIds = new Set(returning.map((p) => p.student.id));
  // Tom Roux est un nouvel élève (fratrie de Chloé)
  plans.forEach((p, i) => {
    const late = lateIdx.has(i);
    const created = late ? addDays('2026-10-19', [0, 6, 13, 17][[...lateIdx].indexOf(i)] ?? 2) : dayFor(i, plans.length);
    const methodRoll = r();
    const method: PaymentMethod = methodRoll < 0.6 ? 'cheque' : methodRoll < 0.88 ? 'virement' : methodRoll < 0.95 ? 'ancv' : 'especes';
    makeEnrollment(p, cur, created, {
      source: returningIds.has(p.student.id) ? 'reinscription' : r() < 0.85 ? 'en_ligne' : 'guichet',
      status: late ? 'a_valider' : 'validee',
      plan: p.course.key === 'chorale' ? 1 : r() < 0.62 ? 3 : 1,
      method,
      imageRights: i % 41 === 7 || i % 41 === 19 ? null : r() < 0.88,
      docs: !(i % 37 === 11 || i % 37 === 23),
    });
  });
  // Saison passée : tout est encaissé
  const pastSlipDates = ['2025-10-20', '2026-01-19', '2026-04-20'];
  for (const it of installments.filter((x) => x.seasonId === past.id)) {
    const e = enrollments.find((x) => x.id === it.enrollmentId)!;
    const cheque = e.intendedMethod === 'cheque';
    const cashedOn = cheque ? pastSlipDates[it.rank - 1] ?? it.dueOn : addDays(it.dueOn, int(-5, 3));
    payments.push({ id: `pay-${pad(++paySeq, 4)}`, installmentId: it.id, familyId: it.familyId, amount: it.amount, method: e.intendedMethod, reference: cheque ? `Chèque n° ${int(1000, 9999)}` : `EMG-25-${pad(paySeq)}`, bank: pick(['Crédit Agricole', 'La Banque Postale', 'Société Générale', 'Caisse d’Épargne', 'CIC', 'Banque Populaire']), receivedOn: addDays(cashedOn, -3), cashedOn, depositSlipId: null, createdAt: cashedOn });
  }
  // Saison en cours : 1re échéance réglée pour la plupart, trois familles en retard, cinq pièces à remettre
  const lateFamilies = new Set<string>();
  lateFamilies.add(families.find((f) => f.familyName === 'Barret')!.id);
  for (const f of families) { if (lateFamilies.size >= 3) break; if (!['Roux', 'Barret', 'Tissot'].includes(f.familyName) && enrollments.some((e) => e.familyId === f.id && e.seasonId === cur.id && e.status === 'validee' && e.plan === 3)) lateFamilies.add(f.id); }
  const slipDates = ['2026-09-21', '2026-09-28', '2026-10-05', '2026-10-12', '2026-10-19', '2026-10-26'];
  const toHandIn: Payment[] = [];
  const curInst = installments.filter((x) => x.seasonId === cur.id).sort((a, b) => a.familyId.localeCompare(b.familyId));
  for (const it of curInst) {
    const e = enrollments.find((x) => x.id === it.enrollmentId)!;
    if (lateFamilies.has(it.familyId)) continue;
    const method = e.intendedMethod;
    const bank = pick(['Crédit Agricole', 'La Banque Postale', 'Société Générale', 'Caisse d’Épargne', 'CIC', 'Banque Populaire']);
    const reference = method === 'cheque' ? `Chèque n° ${int(1000, 9999)}` : method === 'virement' ? `EMG-26-${pad(paySeq + 1)}` : method === 'ancv' ? `Lot ANCV ${int(10, 99)}` : 'Espèces';
    const isLate = e.status === 'a_valider';
    if (it.rank === 1) {
      if (isLate) {
        if (method === 'virement') continue;
        const p: Payment = { id: `pay-${pad(++paySeq, 4)}`, installmentId: it.id, familyId: it.familyId, amount: it.amount, method, reference, bank: method === 'especes' ? '' : bank, receivedOn: addDays(e.createdAt.slice(0, 10), 1), cashedOn: null, depositSlipId: null, createdAt: e.createdAt };
        payments.push(p);
        toHandIn.push(p);
        continue;
      }
      const received = addDays(it.dueOn > e.createdAt.slice(0, 10) ? '2026-09-14' : e.createdAt.slice(0, 10), int(0, 25));
      const recv = received > '2026-10-24' ? '2026-10-24' : received;
      const cashed = method === 'virement' ? recv : slipDates.find((d) => d > recv) ?? '2026-10-26';
      payments.push({ id: `pay-${pad(++paySeq, 4)}`, installmentId: it.id, familyId: it.familyId, amount: it.amount, method, reference, bank: method === 'especes' ? '' : bank, receivedOn: recv, cashedOn: cashed, depositSlipId: null, createdAt: recv });
    } else if (method === 'cheque' && e.plan === 3 && !isLate && r() < 0.55) {
      // Chèques remis d'avance, à encaisser à l'échéance
      payments.push({ id: `pay-${pad(++paySeq, 4)}`, installmentId: it.id, familyId: it.familyId, amount: it.amount, method, reference: `Chèque n° ${int(1000, 9999)}`, bank, receivedOn: '2026-09-20', cashedOn: null, depositSlipId: null, createdAt: '2026-09-20' });
    }
  }
  // Bordereaux 1 à 6 (déposés)
  slipDates.forEach((d, i) => {
    const ids = payments.filter((p) => p.cashedOn === d && p.method !== 'virement' && p.installmentId.startsWith('ins-') && installments.find((x) => x.id === p.installmentId)?.seasonId === cur.id).map((p) => p.id);
    const slip: DepositSlip = { id: `slip-${i + 1}`, number: i + 1, createdAt: addDays(d, -1), depositedOn: d, paymentIds: ids };
    ids.forEach((id) => { const p = payments.find((x) => x.id === id)!; p.depositSlipId = slip.id; });
    depositSlips.push(slip);
  });

  // Liste d'attente : piano 4, batterie 2, éveil 1
  const waitlist: WaitlistEntry[] = [];
  const waitDefs: [string, string, string, number][] = [['Arthur', 'piano', '2026-06-18', 9], ['Zoé', 'piano', '2026-06-22', 11], ['Nina', 'batterie', '2026-06-26', 12], ['Sacha', 'piano', '2026-07-02', 8], ['Rose', 'batterie', '2026-08-29', 10], ['Élio', 'eveil', '2026-09-04', 5], ['Manon', 'piano', '2026-09-15', 10]];
  for (const [first, key, date, age] of waitDefs) {
    const f = newFamily(surname());
    f.createdAt = date;
    newGuardian(f, pick([...ADULT_F, ...ADULT_M]), pick(['Mère', 'Père']));
    const s = newStudent(f, first, birth(age));
    waitlist.push({ id: `wl-${pad(waitlist.length + 1)}`, seasonId: cur.id, courseId: `${cur.id}-${key}`, studentId: s.id, familyId: f.id, level: key === 'eveil' ? 'Éveil 5 ans' : '1re année', slot: COURSES.find((c) => c.key === key)!.slots[0], plan: 3, intendedMethod: 'cheque', imageRights: true, consentAt: `${date}T20:05:00`, createdAt: `${date}T20:05:00`, status: 'en_attente', proposedAt: null });
  }
  // Une famille dont le rattachement est à vérifier (fratrie déclarée, non trouvée automatiquement)
  const toCheck = enrollments.find((e) => e.seasonId === cur.id && e.status === 'a_valider' && !(students.find((s) => s.id === e.studentId)?.firstName === 'Tom'));
  if (toCheck) {
    toCheck.siblingCheck = 'a_verifier';
    families.find((f) => f.id === toCheck.familyId)!.siblingCheck = 'a_verifier';
  }
  for (const f of families) {
    if (f.siblingCheck === 'aucun' && enrollments.filter((e) => e.familyId === f.id && e.seasonId === cur.id).length > 1) f.siblingCheck = 'validee';
  }

  // Événements et comptabilité
  const events: SchoolEvent[] = [
    { id: 'ev-noel-25', seasonId: past.id, name: 'Audition de Noël 2025', date: '2025-12-14', kind: 'audition', place: 'Salle des fêtes de Givry', budget: 350 },
    { id: 'ev-printemps-26', seasonId: past.id, name: 'Concert de printemps 2026', date: '2026-04-11', kind: 'concert', place: 'Église de Givry', budget: 600 },
    { id: 'ev-fete-26', seasonId: past.id, name: 'Fête de la musique 2026', date: '2026-06-21', kind: 'concert', place: 'Place de la Halle', budget: 150 },
    { id: 'ev-forum-26', seasonId: cur.id, name: 'Forum des associations', date: '2026-09-05', kind: 'autre', place: 'Halle de Givry', budget: 80 },
    { id: 'ev-noel-26', seasonId: cur.id, name: 'Audition de Noël', date: '2026-12-13', kind: 'audition', place: 'Salle des fêtes de Givry', budget: 380 },
    { id: 'ev-stage-27', seasonId: cur.id, name: 'Stage d’orchestre', date: '2027-02-15', kind: 'stage', place: 'École de musique', budget: 380 },
    { id: 'ev-printemps-27', seasonId: cur.id, name: 'Concert de printemps', date: '2027-04-04', kind: 'concert', place: 'Église de Givry, avec l’Harmonie', budget: 620 },
  ];
  let entSeq = 0;
  const manual: LedgerEntry[] = [];
  const m = (date: string, kind: 'recette' | 'depense', categoryId: string, amount: number, label: string, eventId: string | null = null, method: PaymentMethod | null = 'virement', att: string | null = null) =>
    manual.push({ id: `led-${pad(++entSeq, 4)}`, date, kind, categoryId, amount, label, eventId, paymentId: null, method, attachmentId: att, source: 'manuel', createdAt: `${date}T18:00:00` });
  // Exercice 2025-2026
  m('2025-10-10', 'recette', 'cat-rec-sub-commune', 3000, 'Subvention de fonctionnement 2025, commune de Givry');
  m('2026-02-20', 'recette', 'cat-rec-sub-dep', 1000, 'Subvention du département, enseignement musical');
  m('2025-12-14', 'recette', 'cat-rec-concerts', 310, 'Buvette de l’audition de Noël', 'ev-noel-25', 'especes');
  m('2026-04-11', 'recette', 'cat-rec-concerts', 840, 'Entrées et buvette du concert de printemps', 'ev-printemps-26', 'especes');
  m('2026-06-21', 'recette', 'cat-rec-concerts', 190, 'Buvette de la fête de la musique', 'ev-fete-26', 'especes');
  m('2026-03-02', 'recette', 'cat-rec-dons', 450, 'Dons de particuliers', null, 'cheque');
  for (const [i, mo] of ['2025-09', '2025-10', '2025-11', '2025-12', '2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06'].entries()) m(`${mo}-28`, 'depense', 'cat-dep-prof', i === 0 ? 3100 : 2950, `Salaires et charges des professeurs, ${mo}`);
  m('2025-09-30', 'depense', 'cat-dep-assurance', 590, 'Assurance multirisque association');
  m('2025-10-05', 'depense', 'cat-dep-cmf', 380, 'Cotisation annuelle CMF');
  m('2025-12-01', 'depense', 'cat-dep-evenements', 120, 'Location de la salle des fêtes', 'ev-noel-25');
  m('2026-04-01', 'depense', 'cat-dep-evenements', 520, 'Affiches, salle et réception du concert', 'ev-printemps-26');
  m('2026-04-15', 'depense', 'cat-dep-sacem', 140, 'SACEM, concert de printemps', 'ev-printemps-26');
  m('2026-01-12', 'depense', 'cat-dep-instruments', 760, 'Révision des pianos et location de deux violons');
  m('2026-02-10', 'depense', 'cat-dep-partitions', 410, 'Partitions et méthodes');
  m('2026-06-30', 'depense', 'cat-dep-banque', 115, 'Frais de tenue de compte');
  m('2026-06-15', 'depense', 'cat-dep-fonctionnement', 240, 'Fournitures, affranchissement, nom de domaine');
  // Exercice 2026-2027, au 9 novembre
  m('2026-10-08', 'recette', 'cat-rec-sub-commune', 3000, 'Subvention de fonctionnement 2026, commune de Givry');
  m('2026-10-21', 'recette', 'cat-rec-sub-dep', 1000, 'Subvention du département, acompte');
  m('2026-09-05', 'recette', 'cat-rec-concerts', 200, 'Buvette du forum des associations', 'ev-forum-26', 'especes');
  m('2026-10-02', 'recette', 'cat-rec-dons', 280, 'Dons de particuliers', null, 'cheque');
  m('2026-09-28', 'depense', 'cat-dep-prof', 8950, 'Salaires et charges des professeurs, septembre 2026');
  m('2026-10-28', 'depense', 'cat-dep-prof', 8950, 'Salaires et charges des professeurs, octobre 2026');
  m('2026-09-03', 'depense', 'cat-dep-evenements', 80, 'Stand et affiches du forum', 'ev-forum-26', 'cheque', 'att-001');
  m('2026-11-05', 'depense', 'cat-dep-evenements', 120, 'Location de la salle des fêtes, audition du 13/12', 'ev-noel-26', 'cheque', 'att-002');
  m('2026-10-10', 'depense', 'cat-dep-evenements', 880, 'Sono et éclairage, achat mutualisé avec l’Harmonie');
  m('2026-09-30', 'depense', 'cat-dep-assurance', 610, 'Assurance multirisque association', null, 'virement', 'att-003');
  m('2026-10-06', 'depense', 'cat-dep-cmf', 390, 'Cotisation annuelle CMF', null, 'virement', 'att-004');
  m('2026-09-15', 'depense', 'cat-dep-instruments', 820, 'Accord des pianos et entretien des instruments', null, 'cheque');
  m('2026-09-10', 'depense', 'cat-dep-partitions', 460, 'Partitions et méthodes de rentrée', null, 'cheque', 'att-005');
  m('2026-10-31', 'depense', 'cat-dep-banque', 120, 'Frais de tenue de compte', null, 'virement', 'att-006');
  const attachments = [
    { id: 'att-001', filename: 'forum-affiches.pdf' }, { id: 'att-002', filename: 'facture-salle-des-fetes.pdf' }, { id: 'att-003', filename: 'avis-echeance-assurance.pdf' },
    { id: 'att-004', filename: 'appel-cotisation-cmf.pdf' }, { id: 'att-005', filename: 'facture-partitions.pdf' }, { id: 'att-006', filename: 'releve-frais-bancaires.pdf' },
  ].map((a) => ({ ...a, mime: 'application/pdf', size: 48_000, createdAt: '2026-11-05T18:00:00' }));

  const famName = new Map(families.map((f) => [f.id, f.familyName]));
  const instMap = new Map(installments.map((i) => [i.id, i]));
  const entries = syncAutoEntries(manual, payments, (p) => {
    const it = instMap.get(p.installmentId)!;
    const stu = students.find((s) => s.id === enrollments.find((e) => e.id === it.enrollmentId)!.studentId)!;
    return { familyName: famName.get(p.familyId) ?? '', installmentLabel: `${stu.firstName} · échéance ${it.rank}/${it.count}` };
  }, () => `led-${pad(++entSeq, 4)}`, '2026-11-09T08:00:00');

  const audit: AuditEntry[] = [
    { id: 'aud-1', at: '2026-10-26T18:40:00', actor: 'Claire Dumas', action: 'Bordereau déposé', entity: 'deposit_slips', entityId: 'slip-6', details: 'Bordereau n° 6 marqué comme déposé' },
    { id: 'aud-2', at: '2026-11-05T19:02:00', actor: 'Claire Dumas', action: 'Dépense saisie', entity: 'ledger_entries', entityId: null, details: 'Location de la salle des fêtes, 120 €' },
  ];
  const mails: MailMessage[] = [];
  const roux = families.find((f) => f.familyName === 'Roux')!;
  const rouxG = guardians.find((g) => g.familyId === roux.id)!;
  mails.push({ id: 'mail-1', to: rouxG.email, subject: 'Inscription reçue · École de Musique de Givry', body: 'Bonjour Camille,\n\nNous avons bien reçu l’inscription de Tom pour la saison 2026-2027.\n\nLe bureau', kind: 'confirmation', status: 'envoye', createdAt: '2026-11-06T20:14:00', sentAt: '2026-11-06T20:14:00', validatedBy: null });

  return {
    seasons, families, guardians, students, courses, enrollments, waitlist, feeLines, feeRules, installments, payments, depositSlips,
    categories: DEFAULT_CATEGORIES.map((c) => ({ ...c })), entries, events, attachments, staff: DEMO_STAFF.map((s) => ({ ...s })), audit, mails,
    settings: { ...DEFAULT_SETTINGS, requiredDocuments: [...DEFAULT_SETTINGS.requiredDocuments] },
  };
}

export const SEED_CHECK = () => {
  const s = buildSeed();
  return { students: s.enrollments.filter((e) => e.seasonId === 's2026').length, total: round2(s.installments.filter((i) => i.seasonId === 's2026').reduce((a, i) => a + i.amount, 0)) };
};
