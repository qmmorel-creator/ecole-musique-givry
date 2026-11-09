import { beforeEach, describe, expect, it } from 'vitest';
import { createDemoSource } from '../../src/data/demo/index.ts';
import { installmentState, todayIso, type InscriptionInput } from '../../src/domain/index.ts';

class MemoryStorage {
  private m = new Map<string, string>();
  get length() { return this.m.size; }
  key(i: number) { return [...this.m.keys()][i] ?? null; }
  getItem(k: string) { return this.m.get(k) ?? null; }
  setItem(k: string, v: string) { this.m.set(k, String(v)); }
  removeItem(k: string) { this.m.delete(k); }
  clear() { this.m.clear(); }
}

const input = (over: Partial<InscriptionInput> = {}): InscriptionInput => ({
  guardian: { firstName: 'Camille', lastName: 'Roux', email: 'camille.roux@example.com', phone: '06 12 34 56 41', relation: 'Mère', address: '3 rue du Moulin', postalCode: '71640', commune: 'Mellecey' },
  sibling: { declared: true, familyName: 'Roux', postalCode: '71640', email: 'camille.roux@example.com' },
  student: { firstName: 'Lina', lastName: 'Roux', birthDate: '2017-05-02' },
  courseId: 's2026-guitare', level: '1re année', slot: 'Mer. 14 h', plan: 3, intendedMethod: 'cheque', imageRights: true, rulesAccepted: true, privacyAck: true, website: '',
  ...over,
});

describe('source de données de démonstration', () => {
  beforeEach(() => { (globalThis as unknown as { localStorage: MemoryStorage }).localStorage = new MemoryStorage(); });

  it('la recherche de fratrie ne renvoie que « trouvée » ou « non trouvée »', async () => {
    const ds = createDemoSource();
    const yes = await ds.publicApi.lookupSibling({ familyName: 'ROUX', postalCode: '71640', email: 'camille.roux@example.com' });
    const no = await ds.publicApi.lookupSibling({ familyName: 'Roux', postalCode: '71100', email: 'camille.roux@example.com' });
    expect(yes).toEqual({ found: true });
    expect(no).toEqual({ found: false });
    expect(Object.keys(yes)).toEqual(['found']);
  });

  it('le catalogue public ne contient aucune donnée personnelle', async () => {
    const c = await createDemoSource().publicApi.getCatalog();
    const json = JSON.stringify(c);
    expect(json).not.toMatch(/example\.com/);
    expect(json).not.toMatch(/Chloé|Camille/);
  });

  it('rattache à la famille trouvée et applique la réduction fratrie', async () => {
    const ds = createDemoSource();
    const r = await ds.publicApi.submitInscription(input());
    expect(r.outcome).toBe('inscription');
    expect(r.siblingCheck).toBe('trouvee');
    expect(r.pricing.siblingDiscount).toBeGreaterThan(0);
    expect(r.pricing.adhesion).toBe(0);
    expect(r.installments).toHaveLength(3);
  });

  it('marque « rattachement à vérifier » une fratrie déclarée mais non trouvée, sans réduction', async () => {
    const r = await createDemoSource().publicApi.submitInscription(input({ sibling: { declared: true, familyName: 'Inconnu', postalCode: '71640', email: 'x@example.com' } }));
    expect(r.siblingCheck).toBe('a_verifier');
    expect(r.pricing.siblingDiscount).toBe(0);
  });

  it('inscrit sur liste d’attente quand le cours est complet', async () => {
    const r = await createDemoSource().publicApi.submitInscription(input({ courseId: 's2026-piano', slot: 'Mer. 14 h' }));
    expect(r.outcome).toBe('liste_attente');
    expect(r.installments).toHaveLength(0);
  });

  it('ignore silencieusement un envoi de robot (champ piège)', async () => {
    const ds = createDemoSource();
    await ds.staffApi.signInWithRole('presidence');
    const before = (await ds.staffApi.load()).enrollments.length;
    await ds.publicApi.submitInscription(input({ website: 'http://spam.example' }));
    expect((await ds.staffApi.load()).enrollments.length).toBe(before);
  });

  it('valide côté serveur et refuse un dossier incomplet', async () => {
    await expect(createDemoSource().publicApi.submitInscription(input({ rulesAccepted: false }))).rejects.toThrow(/corriger/);
  });

  it('refuse l’accès aux données du bureau sans connexion', async () => {
    await expect(createDemoSource().staffApi.load()).rejects.toThrow(/Connexion requise/);
  });

  it('un encaissement crée sa recette, un virement immédiatement, un chèque au dépôt du bordereau', async () => {
    const ds = createDemoSource();
    await ds.staffApi.signInWithRole('tresorerie');
    let s = await ds.staffApi.load();
    const today = todayIso();
    const open = s.installments.filter((i) => i.seasonId === 's2026' && installmentState(i, s.payments, today).status !== 'encaisse' && !s.payments.some((p) => p.installmentId === i.id));
    const [a, b] = open;
    const auto = () => s.entries.filter((e) => e.source === 'auto').length;
    const n0 = auto();
    await ds.staffApi.recordPayment({ installmentId: a.id, amount: a.amount, method: 'virement', reference: 'EMG-TEST', bank: 'CA', receivedOn: today });
    s = await ds.staffApi.load();
    expect(auto()).toBe(n0 + 1);
    await ds.staffApi.recordPayment({ installmentId: b.id, amount: b.amount, method: 'cheque', reference: 'Chèque n° 1', bank: 'CA', receivedOn: today });
    s = await ds.staffApi.load();
    expect(auto()).toBe(n0 + 1);
    const pid = s.payments.find((p) => p.installmentId === b.id)!.id;
    const slip = await ds.staffApi.createDepositSlip([pid]);
    await ds.staffApi.markDeposited(slip.id, today);
    s = await ds.staffApi.load();
    expect(auto()).toBe(n0 + 2);
    expect(s.entries.find((e) => e.paymentId === pid)).toMatchObject({ amount: b.amount, date: today, kind: 'recette' });
  });

  it('le secrétariat ne peut pas saisir en comptabilité', async () => {
    const ds = createDemoSource();
    await ds.staffApi.signInWithRole('secretariat');
    await expect(ds.staffApi.saveLedgerEntry({ date: '2026-11-09', kind: 'depense', categoryId: 'cat-dep-autres', amount: 10, label: 'x', eventId: null, method: null, attachmentId: null })).rejects.toThrow(/rôle/);
  });

  it('le rattachement par le bureau recalcule le tarif non réglé', async () => {
    const ds = createDemoSource();
    await ds.publicApi.submitInscription(input({ sibling: { declared: true, familyName: 'Rou', postalCode: '71640', email: 'camille.roux@example.com' } }));
    await ds.staffApi.signInWithRole('secretariat');
    let s = await ds.staffApi.load();
    const fam = s.families.find((f) => f.familyName === 'Rou')!;
    const target = s.families.find((f) => f.familyName === 'Roux')!;
    await ds.staffApi.resolveSibling(fam.id, { attachTo: target.id });
    s = await ds.staffApi.load();
    const e = s.enrollments.find((x) => s.students.find((st) => st.id === x.studentId)?.firstName === 'Lina')!;
    expect(e.familyId).toBe(target.id);
    expect(e.siblingCheck).toBe('validee');
    expect(e.pricing.siblingDiscount).toBeGreaterThan(0);
  });
});
