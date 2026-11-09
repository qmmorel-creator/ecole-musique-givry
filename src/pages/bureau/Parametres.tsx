import { useState } from 'react';
import { dataSource } from '../../data/index.ts';
import { ROLE_LABELS, type Role, type Course, type FeeLine, type FeeRules, type LedgerKind, type Public, type Residence, type Season, type Settings } from '../../domain/index.ts';
import { Badge, Field, InstrumentTag, Modal } from '../../components/ui.tsx';
import { useStore } from '../../store.tsx';
import { PageTop } from './BureauApp.tsx';

type Tab = 'saison' | 'cours' | 'tarifs' | 'categories' | 'general' | 'comptes';
const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

export default function ParametresPage() {
  const { can } = useStore();
  const [tab, setTab] = useState<Tab>('tarifs');
  const tabs: [Tab, string][] = [['tarifs', 'Grille tarifaire'], ['cours', 'Cours et places'], ['saison', 'Saison'], ['categories', 'Catégories comptables'], ['general', 'Général'], ...(can('comptes') ? [['comptes', 'Comptes du bureau'] as [Tab, string]] : [])];
  return (
    <>
      <PageTop title="Paramètres" sub="Valeurs par défaut proposées, à confirmer avec le bureau" />
      <main className="content" id="contenu">
        <div className="seg" role="tablist" aria-label="Rubriques">{tabs.map(([t, l]) => <button key={t} type="button" role="tab" aria-selected={tab === t} aria-pressed={tab === t} onClick={() => setTab(t)}>{l}</button>)}</div>
        {tab === 'tarifs' && <TarifsTab />}
        {tab === 'cours' && <CoursTab />}
        {tab === 'saison' && <SaisonTab />}
        {tab === 'categories' && <CategoriesTab />}
        {tab === 'general' && <GeneralTab />}
        {tab === 'comptes' && <ComptesTab />}
      </main>
    </>
  );
}

const useCurrentSeason = () => { const { snap } = useStore(); return snap!.seasons.find((x) => x.isCurrent) ?? snap!.seasons[0]; };
const num = (v: string) => Number(v.replace(',', '.').replace(/\s/g, ''));

function TarifsTab() {
  const { snap, run } = useStore();
  const s = snap!;
  const season = useCurrentSeason();
  const rules0 = s.feeRules.find((r) => r.seasonId === season.id)!;
  const [rules, setRules] = useState<FeeRules>(rules0);
  const [communes, setCommunes] = useState(rules0.communes.join(', '));
  const [lines, setLines] = useState<FeeLine[]>(s.feeLines.filter((l) => l.seasonId === season.id));
  const [newFormula, setNewFormula] = useState('');
  const combos: [Public, Residence, string][] = [['enfant', 'commune', 'Enfant · commune'], ['enfant', 'hors_commune', 'Enfant · hors commune'], ['adulte', 'commune', 'Adulte · commune'], ['adulte', 'hors_commune', 'Adulte · hors commune']];
  const get = (f: string, p: Public, r: Residence) => lines.find((l) => l.formula === f && l.public === p && l.residence === r);
  const set = (f: string, p: Public, r: Residence, v: string) => {
    const ex = get(f, p, r);
    const amount = num(v);
    setLines(ex ? lines.map((l) => (l === ex ? { ...l, amount } : l)) : [...lines, { id: `${season.id}-${f}-${p}-${r}`, seasonId: season.id, formula: f, public: p, residence: r, amount }]);
  };
  const addFormula = () => {
    const label = newFormula.trim();
    if (!label) return;
    const code = label.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 30);
    if (rules.formulas.some((f) => f.code === code)) return;
    setRules({ ...rules, formulas: [...rules.formulas, { code, label }] });
    setNewFormula('');
  };
  const save = () => run(async () => {
    await dataSource.staffApi.saveFeeRules({ ...rules, communes: communes.split(',').map((x) => x.trim()).filter(Boolean) });
    await dataSource.staffApi.saveFeeLines(lines.filter((l) => !Number.isNaN(l.amount)));
  }, 'Grille tarifaire enregistrée. Elle s’applique aux nouvelles inscriptions.');
  return (
    <>
      <div className="note warn">Grille, règles de fratrie et adhésion : hypothèses de démonstration, à remplacer par la grille réelle de l’école.</div>
      <section className="card">
        <header><h2>Grille {season.label}</h2></header>
        <div className="tw"><table className="t">
          <thead><tr><th>Formule</th>{combos.map(([, , l]) => <th key={l} className="r">{l}</th>)}</tr></thead>
          <tbody>{rules.formulas.map((f) => (
            <tr key={f.code}>
              <td><input className="in" aria-label={`Libellé de la formule ${f.label}`} value={f.label} onChange={(e) => setRules({ ...rules, formulas: rules.formulas.map((x) => (x.code === f.code ? { ...x, label: e.target.value } : x)) })} /></td>
              {combos.map(([p, r, l]) => <td key={l} className="r"><input className="in tnum" style={{ width: 90, textAlign: 'right' }} inputMode="decimal" aria-label={`${f.label}, ${l}, en euros`} value={get(f.code, p, r)?.amount ?? ''} onChange={(e) => set(f.code, p, r, e.target.value)} /></td>)}
            </tr>
          ))}</tbody>
        </table></div>
        <div className="foot"><label className="field" style={{ flex: 1 }}><span className="sr-only">Nouvelle formule</span><input className="in" placeholder="Nouvelle formule (ex. Cours individuel 45 min)" value={newFormula} onChange={(e) => setNewFormula(e.target.value)} /></label><button type="button" className="btn sm" onClick={addFormula}>Ajouter la formule</button></div>
      </section>
      <section className="card">
        <header><h2>Règles</h2></header>
        <div className="body"><div className="form">
          <Field label="Réduction fratrie (%)" hint="0 pour la désactiver">{(p) => <input {...p} className="in" inputMode="decimal" value={rules.siblingDiscountPct} onChange={(e) => setRules({ ...rules, siblingDiscountPct: num(e.target.value) || 0 })} />}</Field>
          <Field label="À partir du rang" hint="2 = dès le 2e élève de la famille">{(p) => <input {...p} className="in" type="number" min={2} value={rules.siblingFromRank} onChange={(e) => setRules({ ...rules, siblingFromRank: Number(e.target.value) || 2 })} />}</Field>
          <label className="checkline full"><input type="checkbox" checked={rules.siblingChildrenOnly} onChange={(e) => setRules({ ...rules, siblingChildrenOnly: e.target.checked })} />Seuls les enfants comptent dans la fratrie et bénéficient de la réduction</label>
          <Field label="Adhésion familiale (€ par saison)">{(p) => <input {...p} className="in" inputMode="decimal" value={rules.adhesionAmount} onChange={(e) => setRules({ ...rules, adhesionAmount: num(e.target.value) || 0 })} />}</Field>
          <Field label="Âge adulte" hint="âge au 1er jour de la saison">{(p) => <input {...p} className="in" type="number" value={rules.adultAge} onChange={(e) => setRules({ ...rules, adultAge: Number(e.target.value) || 18 })} />}</Field>
          <Field label="Communes au tarif « commune »" full hint="séparées par des virgules">{(p) => <input {...p} className="in" value={communes} onChange={(e) => setCommunes(e.target.value)} />}</Field>
          <Field label="Formule de la formation musicale ajoutée d’office">{(p) => <select {...p} className="in" value={rules.fmFormula} onChange={(e) => setRules({ ...rules, fmFormula: e.target.value })}>{rules.formulas.map((f) => <option key={f.code} value={f.code}>{f.label}</option>)}</select>}</Field>
          <label className="checkline"><input type="checkbox" checked={rules.fmIncludedForChildren} onChange={(e) => setRules({ ...rules, fmIncludedForChildren: e.target.checked })} />Formation musicale incluse dans le tarif instrument des enfants</label>
        </div></div>
        <div className="foot"><button type="button" className="btn pri" onClick={save}>Enregistrer la grille</button><span className="muted sm">Les inscriptions déjà reçues gardent leur tarif.</span></div>
      </section>
    </>
  );
}

function CoursTab() {
  const { snap } = useStore();
  const s = snap!;
  const season = useCurrentSeason();
  const [edit, setEdit] = useState<Partial<Course> | null>(null);
  const courses = s.courses.filter((c) => c.seasonId === season.id);
  const rules = s.feeRules.find((r) => r.seasonId === season.id)!;
  return (
    <section className="card">
      <header><h2>Cours {season.label}</h2><span className="sp" /><button type="button" className="btn sm" onClick={() => setEdit({ seasonId: season.id, kind: 'instrument', formula: rules.formulas[0]?.code, discipline: '', teacher: '', slots: [], levels: ['1re année', '2e année', '3e année'], capacity: 8, requiresFm: true, abbr: '', color: '#1f78c8', active: true })}>+ Ajouter un cours</button></header>
      <div className="tw"><table className="t">
        <thead><tr><th>Cours</th><th>Professeur</th><th>Formule</th><th className="r">Capacité</th><th>FM d’office</th><th>Statut</th><th><span className="sr-only">Modifier</span></th></tr></thead>
        <tbody>{courses.map((c) => <tr key={c.id}><td><InstrumentTag abbr={c.abbr} color={c.color} name={c.discipline} /></td><td className="sm">{c.teacher}</td><td className="sm">{rules.formulas.find((f) => f.code === c.formula)?.label ?? c.formula}</td><td className="r tnum">{c.capacity}</td><td className="sm">{c.requiresFm ? 'oui' : 'non'}</td><td>{c.active ? <Badge tone="ok">proposé</Badge> : <Badge tone="idle">masqué</Badge>}</td><td><button type="button" className="btn sm" onClick={() => setEdit(c)}>Modifier</button></td></tr>)}</tbody>
      </table></div>
      {edit && <CourseModal initial={edit} onClose={() => setEdit(null)} />}
    </section>
  );
}

function CourseModal({ initial, onClose }: { initial: Partial<Course>; onClose: () => void }) {
  const { snap, run } = useStore();
  const rules = snap!.feeRules.find((r) => r.seasonId === initial.seasonId)!;
  const [c, setC] = useState({ ...initial, slotsText: (initial.slots ?? []).join(', '), levelsText: (initial.levels ?? []).join(', ') });
  const save = async () => {
    const { slotsText, levelsText, ...rest } = c;
    const course = { ...rest, slots: slotsText.split(',').map((x) => x.trim()).filter(Boolean), levels: levelsText.split(',').map((x) => x.trim()).filter(Boolean), abbr: (rest.abbr || rest.discipline?.slice(0, 2) || '').slice(0, 2) } as Course;
    if (await run(() => dataSource.staffApi.saveCourse(course), 'Cours enregistré.')) onClose();
  };
  return (
    <Modal title={initial.id ? `Modifier · ${initial.discipline}` : 'Nouveau cours'} onClose={onClose} footer={<><button type="button" className="btn" onClick={onClose}>Annuler</button><button type="button" className="btn pri" onClick={save}>Enregistrer</button></>}>
      <div className="form">
        <Field label="Discipline">{(p) => <input {...p} className="in" value={c.discipline ?? ''} onChange={(e) => setC({ ...c, discipline: e.target.value })} />}</Field>
        <Field label="Professeur">{(p) => <input {...p} className="in" value={c.teacher ?? ''} onChange={(e) => setC({ ...c, teacher: e.target.value })} />}</Field>
        <Field label="Type">{(p) => <select {...p} className="in" value={c.kind} onChange={(e) => setC({ ...c, kind: e.target.value as Course['kind'] })}><option value="instrument">Instrument</option><option value="collectif">Collectif</option><option value="fm">Formation musicale</option></select>}</Field>
        <Field label="Formule tarifaire">{(p) => <select {...p} className="in" value={c.formula} onChange={(e) => setC({ ...c, formula: e.target.value })}>{rules.formulas.map((f) => <option key={f.code} value={f.code}>{f.label}</option>)}</select>}</Field>
        <Field label="Capacité (places)">{(p) => <input {...p} className="in" type="number" min={0} value={c.capacity ?? 0} onChange={(e) => setC({ ...c, capacity: Number(e.target.value) })} />}</Field>
        <Field label="Abréviation et couleur">{(p) => <div style={{ display: 'flex', gap: 8 }}><input {...p} className="in" maxLength={2} value={c.abbr ?? ''} onChange={(e) => setC({ ...c, abbr: e.target.value })} /><input aria-label="Couleur" type="color" value={c.color ?? '#1f78c8'} onChange={(e) => setC({ ...c, color: e.target.value })} style={{ height: 40, width: 56, border: 0, background: 'none' }} /></div>}</Field>
        <Field label="Créneaux" full hint="séparés par des virgules">{(p) => <input {...p} className="in" value={c.slotsText} onChange={(e) => setC({ ...c, slotsText: e.target.value })} />}</Field>
        <Field label="Niveaux" full hint="séparés par des virgules">{(p) => <input {...p} className="in" value={c.levelsText} onChange={(e) => setC({ ...c, levelsText: e.target.value })} />}</Field>
        <label className="checkline"><input type="checkbox" checked={!!c.requiresFm} onChange={(e) => setC({ ...c, requiresFm: e.target.checked })} />Formation musicale ajoutée d’office (enfants)</label>
        <label className="checkline"><input type="checkbox" checked={!!c.active} onChange={(e) => setC({ ...c, active: e.target.checked })} />Proposé sur le formulaire</label>
      </div>
    </Modal>
  );
}

function SaisonTab() {
  const { run } = useStore();
  const season = useCurrentSeason();
  const [s, setS] = useState<Season>(season);
  return (
    <section className="card">
      <header><h2>Saison {season.label}</h2></header>
      <div className="body"><div className="form">
        <Field label="Libellé">{(p) => <input {...p} className="in" value={s.label} onChange={(e) => setS({ ...s, label: e.target.value })} />}</Field>
        <label className="checkline"><input type="checkbox" checked={s.registrationOpen} onChange={(e) => setS({ ...s, registrationOpen: e.target.checked })} />Inscriptions en ligne ouvertes</label>
        <Field label="Début de saison">{(p) => <input {...p} className="in" type="date" value={s.startsOn} onChange={(e) => setS({ ...s, startsOn: e.target.value })} />}</Field>
        <Field label="Fin de saison">{(p) => <input {...p} className="in" type="date" value={s.endsOn} onChange={(e) => setS({ ...s, endsOn: e.target.value })} />}</Field>
        {[0, 1, 2].map((i) => <Field key={i} label={`Échéance ${i + 1} (règlement en 3 fois${i === 0 ? ' et en 1 fois' : ''})`}>{(p) => <input {...p} className="in" type="date" value={s.installmentDates[i] ?? ''} onChange={(e) => { const d = [...s.installmentDates]; d[i] = e.target.value; setS({ ...s, installmentDates: d }); }} />}</Field>)}
      </div></div>
      <div className="foot"><button type="button" className="btn pri" onClick={() => run(() => dataSource.staffApi.saveSeason(s), 'Saison enregistrée.')}>Enregistrer la saison</button><span className="muted sm">Une échéance déjà passée à l’inscription est ramenée à la date d’inscription.</span></div>
    </section>
  );
}

function CategoriesTab() {
  const { snap, run } = useStore();
  const s = snap!;
  const [label, setLabel] = useState('');
  const [kind, setKind] = useState<LedgerKind>('depense');
  return (
    <>
      <div className="note warn">Nomenclature associative proposée par défaut, à adapter avec la trésorerie.</div>
      <div className="grid2e">
        {(['recette', 'depense'] as LedgerKind[]).map((k) => (
          <section className="card" key={k}>
            <header><h2>{k === 'recette' ? 'Recettes' : 'Dépenses'}</h2></header>
            <div className="list">{s.categories.filter((c) => c.kind === k).map((c) => (
              <div className="li" key={c.id}>
                <input className="in" aria-label="Libellé de la catégorie" defaultValue={c.label} disabled={c.system} onBlur={(e) => { if (e.target.value.trim() && e.target.value !== c.label) void run(() => dataSource.staffApi.saveCategory({ ...c, label: e.target.value }), 'Catégorie renommée.'); }} />
                {c.system ? <Badge tone="info">automatique</Badge> : <button type="button" className="btn sm" onClick={() => run(() => dataSource.staffApi.saveCategory({ ...c, archived: !c.archived }), c.archived ? 'Catégorie réactivée.' : 'Catégorie archivée.')}>{c.archived ? 'Réactiver' : 'Archiver'}</button>}
              </div>
            ))}</div>
          </section>
        ))}
      </div>
      <section className="card"><div className="body filters">
        <label><span className="sr-only">Type</span><select className="in" style={{ width: 'auto' }} value={kind} onChange={(e) => setKind(e.target.value as LedgerKind)}><option value="depense">Dépense</option><option value="recette">Recette</option></select></label>
        <label className="field" style={{ flex: 1 }}><span className="sr-only">Nouvelle catégorie</span><input className="in" placeholder="Nouvelle catégorie" value={label} onChange={(e) => setLabel(e.target.value)} /></label>
        <button type="button" className="btn pri sm" onClick={async () => { if (await run(() => dataSource.staffApi.saveCategory({ kind, label, archived: false }), 'Catégorie ajoutée.')) setLabel(''); }}>Ajouter</button>
      </div></section>
    </>
  );
}

function GeneralTab() {
  const { snap, run } = useStore();
  const [st, setSt] = useState<Settings>(snap!.settings);
  const [docs, setDocs] = useState(snap!.settings.requiredDocuments.join('\n'));
  return (
    <section className="card">
      <header><h2>Paramètres généraux</h2></header>
      <div className="body"><div className="form">
        <Field label="Nom de l’école">{(p) => <input {...p} className="in" value={st.schoolName} onChange={(e) => setSt({ ...st, schoolName: e.target.value })} />}</Field>
        <Field label="Adresse (en-tête des PDF)">{(p) => <input {...p} className="in" value={st.schoolAddress} onChange={(e) => setSt({ ...st, schoolAddress: e.target.value })} />}</Field>
        <Field label="Adresse mail de contact">{(p) => <input {...p} className="in" type="email" value={st.schoolEmail} onChange={(e) => setSt({ ...st, schoolEmail: e.target.value })} />}</Field>
        <Field label="Durée de conservation (années après la dernière saison)">{(p) => <input {...p} className="in" type="number" min={1} max={10} value={st.retentionYears} onChange={(e) => setSt({ ...st, retentionYears: Number(e.target.value) })} />}</Field>
        <Field label="Début de l’exercice : jour">{(p) => <input {...p} className="in" type="number" min={1} max={28} value={st.exerciseStartDay} onChange={(e) => setSt({ ...st, exerciseStartDay: Number(e.target.value) })} />}</Field>
        <Field label="Début de l’exercice : mois">{(p) => <select {...p} className="in" value={st.exerciseStartMonth} onChange={(e) => setSt({ ...st, exerciseStartMonth: Number(e.target.value) })}>{MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}</select>}</Field>
        <Field label="Pièces demandées pour un dossier complet" full hint="une par ligne ; aucune donnée de santé">{(p) => <textarea {...p} className="in" value={docs} onChange={(e) => setDocs(e.target.value)} />}</Field>
      </div></div>
      <div className="foot"><button type="button" className="btn pri" onClick={() => run(() => dataSource.staffApi.saveSettings({ ...st, requiredDocuments: docs.split('\n').map((x) => x.trim()).filter(Boolean) }), 'Paramètres enregistrés.')}>Enregistrer</button></div>
    </section>
  );
}

function ComptesTab() {
  const { snap, run, session } = useStore();
  const [n, setN] = useState({ fullName: '', email: '', role: 'secretariat' as Role });
  return (
    <section className="card">
      <header><h2>Comptes du bureau</h2></header>
      <div className="tw"><table className="t"><thead><tr><th>Nom</th><th>Mail</th><th>Rôle</th><th>Accès</th></tr></thead><tbody>
        {snap!.staff.map((x) => (
          <tr key={x.id}>
            <td>{x.fullName}{x.id === session!.staff.id && <span className="muted xs"> (vous)</span>}</td>
            <td className="sm">{x.email}</td>
            <td><label><span className="sr-only">Rôle de {x.fullName}</span><select className="in" style={{ width: 'auto' }} value={x.role} disabled={x.id === session!.staff.id} onChange={(e) => run(() => dataSource.staffApi.saveStaff({ ...x, role: e.target.value as Role }), 'Rôle modifié.')}>{(Object.keys(ROLE_LABELS) as Role[]).map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}</select></label></td>
            <td>{x.id === session!.staff.id ? <Badge tone="ok">actif</Badge> : <button type="button" className="btn sm" onClick={() => run(() => dataSource.staffApi.saveStaff({ ...x, active: !x.active }), x.active ? 'Accès retiré.' : 'Accès rétabli.')}>{x.active ? 'Retirer l’accès' : 'Rétablir l’accès'}</button>}</td>
          </tr>
        ))}
      </tbody></table></div>
      <div className="body"><div className="form">
        <Field label="Nom du nouveau membre">{(p) => <input {...p} className="in" value={n.fullName} onChange={(e) => setN({ ...n, fullName: e.target.value })} />}</Field>
        <Field label="Adresse mail">{(p) => <input {...p} className="in" type="email" value={n.email} onChange={(e) => setN({ ...n, email: e.target.value })} />}</Field>
        <Field label="Rôle">{(p) => <select {...p} className="in" value={n.role} onChange={(e) => setN({ ...n, role: e.target.value as Role })}>{(Object.keys(ROLE_LABELS) as Role[]).map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}</select>}</Field>
        <div className="field" style={{ alignSelf: 'end' }}><button type="button" className="btn pri" onClick={async () => { if (await run(() => dataSource.staffApi.saveStaff({ ...n, active: true }), 'Invitation envoyée.')) setN({ fullName: '', email: '', role: 'secretariat' }); }}>Inviter</button></div>
      </div></div>
      <div className="foot muted sm">Le membre invité se connecte ensuite par lien magique, sans mot de passe. Pour transmettre l’outil au bureau suivant : inviter les nouveaux membres, puis retirer l’accès des sortants.</div>
    </section>
  );
}
