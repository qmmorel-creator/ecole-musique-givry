import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { dataSource, type Snapshot } from '../../data/index.ts';
import {
  dossierState, formatDateFr, formatEuros, METHOD_LABELS, normalizeEmail, normalizeName, ROLE_LABELS, STATUS_LABELS, sum, type Enrollment, type Family,
} from '../../domain/index.ts';
import { Badge, Field, initials, InstrumentTag, Modal, type Tone } from '../../components/ui.tsx';
import { useStore } from '../../store.tsx';
import { useDerived, type Derived, type InstallmentRow } from '../../lib/derive.ts';
import { exportXlsx } from '../../lib/xlsx.ts';
import { paymentLabel } from '../../lib/format.ts';
import { downloadBlob, slugify } from '../../lib/download.ts';
import { PageTop } from './BureauApp.tsx';

type Vue = 'tous' | 'enfants' | 'adultes' | 'fratries' | 'a_valider' | 'incomplets';
const STATUS_TONE: Record<string, Tone> = { encaisse: 'ok', a_remettre: 'warn', en_retard: 'late', prevu: 'idle' };

export function paymentBadge(rows: InstallmentRow[]): { tone: Tone; text: string } {
  if (!rows.length) return { tone: 'idle', text: '—' };
  if (rows.some((r) => r.state.status === 'en_retard')) return { tone: 'late', text: 'En retard' };
  const cashed = rows.filter((r) => r.state.status === 'encaisse').length;
  if (cashed === rows.length) return { tone: 'ok', text: 'À jour' };
  if (rows.some((r) => r.state.status === 'a_remettre')) return { tone: 'warn', text: 'À remettre' };
  return { tone: 'info', text: `${cashed}/${rows.length} reçu${cashed > 1 ? 's' : ''}` };
}

export function dossierBadge(e: Enrollment, required: string[]): { tone: Tone; text: string } {
  if (e.status === 'annulee') return { tone: 'idle', text: 'Annulé' };
  if (e.siblingCheck === 'a_verifier') return { tone: 'warn', text: 'Rattachement à vérifier' };
  if (e.status === 'a_valider') return { tone: 'info', text: 'À valider' };
  return dossierState(e, required).complete ? { tone: 'ok', text: 'Complet' } : { tone: 'warn', text: 'Incomplet' };
}

export function ElevesPage() {
  const { snap } = useStore();
  const s = snap!;
  const [params, setParams] = useSearchParams();
  const [seasonId, setSeasonId] = useState(s.seasons.find((x) => x.isCurrent)?.id ?? s.seasons[0].id);
  const d = useDerived(seasonId);
  const vue = (params.get('vue') as Vue) || 'tous';
  const [q, setQ] = useState('');
  const [discipline, setDiscipline] = useState('');
  const [teacher, setTeacher] = useState('');
  const [openFamily, setOpenFamily] = useState<string | null>(null);

  const instByEnr = useMemo(() => {
    const m = new Map<string, InstallmentRow[]>();
    for (const i of d.installments) m.set(i.enrollmentId, [...(m.get(i.enrollmentId) ?? []), i]);
    return m;
  }, [d]);
  const familySize = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of d.activeEnrollments) m.set(e.familyId, (m.get(e.familyId) ?? 0) + 1);
    return m;
  }, [d]);

  const rows = d.seasonEnrollments.filter((e) => e.status !== 'annulee').map((e) => ({ e, st: d.students.get(e.studentId)!, f: d.families.get(e.familyId)!, c: d.courses.get(e.courseId)! })).filter((r) => r.st && r.f && r.c);
  const counts = {
    tous: rows.length,
    enfants: rows.filter((r) => r.e.public === 'enfant').length,
    adultes: rows.filter((r) => r.e.public === 'adulte').length,
    fratries: rows.filter((r) => (familySize.get(r.e.familyId) ?? 0) > 1).length,
    a_valider: rows.filter((r) => r.e.status === 'a_valider' || r.e.siblingCheck === 'a_verifier').length,
    incomplets: rows.filter((r) => !dossierState(r.e, s.settings.requiredDocuments).complete).length,
  };
  const nq = normalizeName(q);
  const filtered = rows
    .filter((r) => vue === 'tous' || (vue === 'enfants' && r.e.public === 'enfant') || (vue === 'adultes' && r.e.public === 'adulte') || (vue === 'fratries' && (familySize.get(r.e.familyId) ?? 0) > 1) || (vue === 'a_valider' && (r.e.status === 'a_valider' || r.e.siblingCheck === 'a_verifier')) || (vue === 'incomplets' && !dossierState(r.e, s.settings.requiredDocuments).complete))
    .filter((r) => !discipline || r.c.discipline === discipline)
    .filter((r) => !teacher || r.c.teacher === teacher)
    .filter((r) => !nq || normalizeName(`${r.st.firstName}${r.st.lastName}${r.f.familyName}${r.f.commune}`).includes(nq) || (d.guardiansByFamily.get(r.f.id) ?? []).some((g) => normalizeEmail(g.email).includes(q.trim().toLowerCase())))
    .sort((a, b) => a.f.familyName.localeCompare(b.f.familyName) || a.st.firstName.localeCompare(b.st.firstName));
  const disciplines = [...new Set(rows.map((r) => r.c.discipline))].sort();
  const teachers = [...new Set(rows.map((r) => r.c.teacher))].sort();
  const setVue = (v: Vue) => { params.set('vue', v); setParams(params, { replace: true }); };

  const exportList = () => exportXlsx([{
    name: `Élèves ${d.season.label}`,
    columns: ['Nom', 'Prénom', 'Date de naissance', 'Âge', 'Public', 'Famille', 'Commune', 'Responsable', 'Mail', 'Téléphone', 'Discipline', 'Professeur', 'Créneau', 'Niveau', 'Formation musicale', 'Tarif', 'Règlement', 'Dossier', 'Droit à l’image', 'Source'],
    rows: filtered.map(({ e, st, f, c }) => {
      const g = (d.guardiansByFamily.get(f.id) ?? []).find((x) => x.isPrimary) ?? d.guardiansByFamily.get(f.id)?.[0];
      return [st.lastName, st.firstName, formatDateFr(st.birthDate), d.ageOf(st), e.public, f.familyName, f.commune, g ? `${g.firstName} ${g.lastName}` : '', g?.email ?? '', g?.phone ?? '', c.discipline, c.teacher, e.slot, e.level, e.fmCourseId ? d.courses.get(e.fmCourseId)?.discipline ?? '' : '', e.pricing.total, paymentBadge(instByEnr.get(e.id) ?? []).text, dossierBadge(e, s.settings.requiredDocuments).text, e.imageRights === null ? 'non renseigné' : e.imageRights ? 'oui' : 'non', e.source];
    }),
  }], `eleves-${d.season.label}.xlsx`);

  const VUES: [Vue, string][] = [['tous', 'Tous'], ['enfants', 'Enfants'], ['adultes', 'Adultes'], ['fratries', 'Fratries'], ['a_valider', 'À valider'], ['incomplets', 'Incomplets']];
  return (
    <>
      <PageTop
        title="Élèves"
        sub={`${new Set(rows.map((r) => r.st.id)).size} élèves · ${new Set(rows.map((r) => r.f.id)).size} familles · saison ${d.season.label}`}
        acts={<><button type="button" className="btn" onClick={exportList}>Exporter en Excel</button><a className="btn pri" href="/inscription" target="_blank" rel="noopener">+ Inscrire au guichet</a></>}
      />
      <main className="content" id="contenu">
        <section className="card" aria-label="Liste des élèves">
          <header>
            <div className="seg" role="group" aria-label="Vue">{VUES.map(([v, l]) => <button key={v} type="button" aria-pressed={vue === v} onClick={() => setVue(v)}>{l} · {counts[v]}</button>)}</div>
          </header>
          <header className="filters">
            <label className="search"><span className="sr-only">Rechercher</span><input className="in" type="search" placeholder="Rechercher un élève, une famille, un mail…" value={q} onChange={(e) => setQ(e.target.value)} /></label>
            <label><span className="sr-only">Instrument</span><select className="in" value={discipline} onChange={(e) => setDiscipline(e.target.value)} style={{ width: 'auto' }}><option value="">Instrument : tous</option>{disciplines.map((x) => <option key={x}>{x}</option>)}</select></label>
            <label><span className="sr-only">Professeur</span><select className="in" value={teacher} onChange={(e) => setTeacher(e.target.value)} style={{ width: 'auto' }}><option value="">Professeur : tous</option>{teachers.map((x) => <option key={x}>{x}</option>)}</select></label>
            <label><span className="sr-only">Saison</span><select className="in" value={seasonId} onChange={(e) => setSeasonId(e.target.value)} style={{ width: 'auto' }}>{s.seasons.map((x) => <option key={x.id} value={x.id}>Année {x.label}</option>)}</select></label>
          </header>
          <div className="tw">
            <table className="t">
              <thead><tr><th>Élève</th><th>Famille</th><th>Discipline</th><th>Professeur</th><th>Créneau</th><th>Niveau</th><th>Règlement</th><th>Dossier</th></tr></thead>
              <tbody>
                {filtered.map(({ e, st, f, c }) => {
                  const pb = paymentBadge(instByEnr.get(e.id) ?? []);
                  const db = dossierBadge(e, s.settings.requiredDocuments);
                  const n = familySize.get(f.id) ?? 1;
                  return (
                    <tr key={e.id} className="click" onClick={() => setOpenFamily(f.id)}>
                      <td><div className="who"><span className="av" aria-hidden="true">{initials(`${st.firstName} ${st.lastName}`)}</span><div><button type="button" className="linkbtn" style={{ textDecoration: 'none', color: 'inherit' }} onClick={(ev) => { ev.stopPropagation(); setOpenFamily(f.id); }}><b>{st.firstName} {st.lastName}</b></button><span className="muted xs">{d.ageOf(st)} ans · {f.commune}</span></div></div></td>
                      <td className="sm">{n > 1 ? `Famille ${f.familyName} · ${n} élèves` : <span className="muted">—</span>}</td>
                      <td><InstrumentTag abbr={c.abbr} color={c.color} name={c.discipline} /></td>
                      <td className="sm">{c.teacher}</td>
                      <td className="sm tnum">{e.slot}</td>
                      <td className="sm">{e.level}</td>
                      <td><Badge tone={pb.tone}>{pb.text}</Badge></td>
                      <td><Badge tone={db.tone}>{db.text}</Badge></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {filtered.length === 0 && <div className="empty">Aucun élève ne correspond.</div>}
          </div>
        </section>
      </main>
      {openFamily && <FamilyModal familyId={openFamily} d={d} onClose={() => setOpenFamily(null)} />}
    </>
  );
}

export function FamilyModal({ familyId, d, onClose }: { familyId: string; d: Derived; onClose: () => void }) {
  const { snap, run, can, session, today } = useStore();
  const s = snap!;
  const f = s.families.find((x) => x.id === familyId);
  const [edit, setEdit] = useState(false);
  const [target, setTarget] = useState('');
  if (!f) return null;
  const guardians = s.guardians.filter((g) => g.familyId === f.id);
  const students = s.students.filter((x) => x.familyId === f.id);
  const api = dataSource.staffApi;
  const candidates = siblingCandidates(s, f);
  const school = { name: s.settings.schoolName, address: s.settings.schoolAddress, email: s.settings.schoolEmail };
  const signer = { signer: session!.staff.fullName, signerRole: ROLE_LABELS[session!.staff.role] };

  const receipt = async () => {
    const { recuPdf } = await import('../../lib/pdf.ts');
    const pays = s.payments.filter((p) => p.familyId === f.id && p.cashedOn && d.instById.has(p.installmentId));
    const g = guardians.find((x) => x.isPrimary) ?? guardians[0];
    downloadBlob(recuPdf(school, {
      familyName: f.familyName, guardianName: g ? `${g.firstName} ${g.lastName}` : '', address: `${f.address}, ${f.postalCode} ${f.commune}`, season: d.season.label,
      lines: pays.map((p) => { const it = d.instById.get(p.installmentId)!; return { date: p.cashedOn!, label: `${it.student.firstName} · ${d.courses.get(it.enrollment.courseId)?.discipline} · échéance ${it.rank}/${it.count}`, method: METHOD_LABELS[p.method], amount: p.amount }; }),
      number: `${d.season.label.slice(2, 4)}-${f.id.slice(-4).toUpperCase()}`, ...signer,
    }, today), `recu-${slugify(f.familyName)}-${d.season.label}.pdf`);
  };
  const attestation = async (e: Enrollment) => {
    const { attestationPdf } = await import('../../lib/pdf.ts');
    const st = d.students.get(e.studentId)!;
    const rows = d.installments.filter((i) => i.enrollmentId === e.id);
    const paid = sum(rows.map((r) => r.state.cashed));
    const last = s.payments.filter((p) => rows.some((r) => r.id === p.installmentId) && p.cashedOn).map((p) => p.cashedOn!).sort().pop() ?? null;
    const g = guardians.find((x) => x.isPrimary) ?? guardians[0];
    downloadBlob(attestationPdf(school, {
      studentName: `${st.firstName} ${st.lastName}`, birthDate: st.birthDate, guardianName: g ? `${g.firstName} ${g.lastName}` : '', season: d.season.label, seasonStart: d.season.startsOn, seasonEnd: d.season.endsOn,
      discipline: d.courses.get(e.courseId)!.discipline.toLowerCase(), fm: e.fmCourseId ? d.courses.get(e.fmCourseId)?.discipline.toLowerCase() ?? null : null, total: e.pricing.total, paid, lastPaymentOn: last, ...signer,
    }, today), `attestation-${slugify(st.firstName + '-' + st.lastName)}-${d.season.label}.pdf`);
  };

  return (
    <Modal title={`Famille ${f.familyName}`} onClose={onClose} wide footer={<>
      {can('places') && <button type="button" className="btn" onClick={() => run(() => api.sendReinscriptionLinks([f.id]), 'Lien de réinscription envoyé.')}>Envoyer le lien de réinscription</button>}
      {can('comptabilite') && <button type="button" className="btn" onClick={receipt}>Reçu de paiement PDF</button>}
      <button type="button" className="btn pri" onClick={onClose}>Fermer</button>
    </>}>
      {f.siblingCheck === 'a_verifier' && (
        <div className="note warn" style={{ display: 'grid', gap: 8 }}>
          <b>Rattachement à vérifier</b>
          <span>La famille a déclaré un enfant déjà inscrit, ou ses coordonnées ressemblent à une famille connue. Choisissez la famille à laquelle la rattacher, ou confirmez qu’il n’y a pas de fratrie. Les tarifs non encore réglés sont recalculés.</span>
          <div className="filters">
            <label><span className="sr-only">Famille de rattachement</span><select className="in" value={target} onChange={(e) => setTarget(e.target.value)} style={{ width: 'auto', maxWidth: '100%' }}><option value="">Choisir une famille…</option>{candidates.map((c) => <option key={c.f.id} value={c.f.id}>{c.label}</option>)}<optgroup label="Toutes les familles">{s.families.filter((x) => x.id !== f.id).sort((a, b) => a.familyName.localeCompare(b.familyName)).map((x) => <option key={x.id} value={x.id}>Famille {x.familyName} · {x.commune}</option>)}</optgroup></select></label>
            <button type="button" className="btn pri sm" disabled={!target} onClick={async () => { if (await run(() => api.resolveSibling(f.id, { attachTo: target }), 'Famille rattachée, tarifs recalculés.')) onClose(); }}>Rattacher</button>
            <button type="button" className="btn sm" onClick={() => run(() => api.resolveSibling(f.id, { attachTo: null }), 'Rattachement vérifié : pas de fratrie.')}>Pas de fratrie</button>
          </div>
        </div>
      )}
      <div className="grid2e">
        <div>
          <h3 style={{ margin: '0 0 8px', fontSize: 14 }}>Coordonnées</h3>
          {edit ? <FamilyEditor family={f} onDone={() => setEdit(false)} /> : (
            <dl className="dl">
              <dt>Adresse</dt><dd>{f.address}, {f.postalCode} {f.commune}</dd>
              {guardians.map((g) => <GuardianLines key={g.id} g={g} />)}
              {f.notes && <><dt>Notes</dt><dd>{f.notes}</dd></>}
            </dl>
          )}
          {!edit && can('eleves') && <button type="button" className="btn sm" style={{ marginTop: 8 }} onClick={() => setEdit(true)}>Modifier</button>}
        </div>
        <div>
          <h3 style={{ margin: '0 0 8px', fontSize: 14 }}>Règlements de la saison {d.season.label}</h3>
          <InstallmentsMini rows={d.installments.filter((i) => i.familyId === f.id)} />
        </div>
      </div>
      {students.map((st) => <StudentBlock key={st.id} studentId={st.id} d={d} onAttestation={can('comptabilite') ? attestation : undefined} />)}
    </Modal>
  );
}

function siblingCandidates(s: Snapshot, f: Family) {
  const emails = new Set(s.guardians.filter((g) => g.familyId === f.id).map((g) => normalizeEmail(g.email)));
  return s.families.filter((x) => x.id !== f.id && (normalizeName(x.familyName) === normalizeName(f.familyName) || s.guardians.some((g) => g.familyId === x.id && emails.has(normalizeEmail(g.email))) || (x.postalCode === f.postalCode && normalizeName(x.familyName).slice(0, 3) === normalizeName(f.familyName).slice(0, 3))))
    .map((x) => ({ f: x, label: `Suggestion · famille ${x.familyName} · ${x.commune}` }));
}

function GuardianLines({ g }: { g: Snapshot['guardians'][number] }) {
  return <><dt>{g.relation}</dt><dd>{g.firstName} {g.lastName}<br /><a href={`mailto:${g.email}`}>{g.email}</a> · <a href={`tel:${g.phone.replace(/\s/g, '')}`}>{g.phone}</a></dd></>;
}

function FamilyEditor({ family, onDone }: { family: Family; onDone: () => void }) {
  const { snap, run } = useStore();
  const guardians = snap!.guardians.filter((g) => g.familyId === family.id);
  const [f, setF] = useState({ address: family.address, postalCode: family.postalCode, commune: family.commune, notes: family.notes });
  const [gs, setGs] = useState(guardians.map((g) => ({ id: g.id, email: g.email, phone: g.phone })));
  const save = async () => {
    const ok = await run(async () => {
      await dataSource.staffApi.updateFamily(family.id, f);
      for (const g of gs) await dataSource.staffApi.updateGuardian(g.id, { email: g.email, phone: g.phone });
    }, 'Coordonnées enregistrées.');
    if (ok) onDone();
  };
  return (
    <div className="form">
      <Field label="Adresse" full>{(p) => <input {...p} className="in" value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} />}</Field>
      <Field label="Code postal">{(p) => <input {...p} className="in" value={f.postalCode} onChange={(e) => setF({ ...f, postalCode: e.target.value })} />}</Field>
      <Field label="Commune">{(p) => <input {...p} className="in" value={f.commune} onChange={(e) => setF({ ...f, commune: e.target.value })} />}</Field>
      {gs.map((g, i) => (
        <div key={g.id} className="form full">
          <Field label={`Mail · ${guardians[i].firstName}`}>{(p) => <input {...p} className="in" type="email" value={g.email} onChange={(e) => setGs(gs.map((x) => (x.id === g.id ? { ...x, email: e.target.value } : x)))} />}</Field>
          <Field label={`Téléphone · ${guardians[i].firstName}`}>{(p) => <input {...p} className="in" value={g.phone} onChange={(e) => setGs(gs.map((x) => (x.id === g.id ? { ...x, phone: e.target.value } : x)))} />}</Field>
        </div>
      ))}
      <Field label="Notes du bureau" full hint="Pas de donnée de santé.">{(p) => <textarea {...p} className="in" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} />}</Field>
      <div className="full filters"><button type="button" className="btn pri sm" onClick={save}>Enregistrer</button><button type="button" className="btn sm" onClick={onDone}>Annuler</button></div>
    </div>
  );
}

export function InstallmentsMini({ rows }: { rows: InstallmentRow[] }) {
  if (!rows.length) return <p className="muted sm" style={{ margin: 0 }}>Aucune échéance sur la saison.</p>;
  return (
    <div className="tw"><table className="t"><thead><tr><th>Échéance</th><th className="r">Montant</th><th>Statut</th></tr></thead><tbody>
      {rows.map((r) => <tr key={r.id}><td className="sm">{r.student.firstName} · {r.rank}/{r.count} · {formatDateFr(r.dueOn)}{r.payments.length > 0 && <div className="muted xs">{r.payments.map((p) => paymentLabel(p, false)).join(', ')}</div>}</td><td className="r tnum">{formatEuros(r.amount, true)}</td><td><Badge tone={STATUS_TONE[r.state.status]}>{STATUS_LABELS[r.state.status]}</Badge></td></tr>)}
    </tbody></table></div>
  );
}

function StudentBlock({ studentId, d, onAttestation }: { studentId: string; d: Derived; onAttestation?: (e: Enrollment) => void }) {
  const { snap, run, can } = useStore();
  const s = snap!;
  const st = s.students.find((x) => x.id === studentId)!;
  const history = s.enrollments.filter((e) => e.studentId === st.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const current = history.find((e) => e.seasonId === d.season.id && e.status !== 'annulee');
  const waits = s.waitlist.filter((w) => w.studentId === st.id && (w.status === 'en_attente' || w.status === 'proposee'));
  const api = dataSource.staffApi;
  const seasonLabel = (id: string) => s.seasons.find((x) => x.id === id)?.label ?? '';
  return (
    <section className="card" aria-label={`Élève ${st.firstName}`}>
      <header><div className="who"><span className="av" aria-hidden="true">{initials(`${st.firstName} ${st.lastName}`)}</span><div><b>{st.firstName} {st.lastName}</b><span className="muted xs">né(e) le {formatDateFr(st.birthDate)} · {d.ageOf(st)} ans</span></div></div><span className="sp" />{current && <Badge {...dossierBadge(current, s.settings.requiredDocuments)}>{dossierBadge(current, s.settings.requiredDocuments).text}</Badge>}</header>
      <div className="body" style={{ display: 'grid', gap: 12 }}>
        {current && (() => {
          const c = d.courses.get(current.courseId)!;
          const ds = dossierState(current, s.settings.requiredDocuments);
          return (
            <>
              <dl className="dl">
                <dt>Cours {d.season.label}</dt><dd>{c.discipline} · {c.teacher} · {current.slot} · {current.level}{current.fmCourseId ? ` · avec ${d.courses.get(current.fmCourseId)?.discipline.toLowerCase()}` : ''}</dd>
                <dt>Tarif</dt><dd>{current.pricing.lines.map((l) => `${l.label} ${l.note ?? formatEuros(l.amount, true)}`).join(' · ')} · <b>total {formatEuros(current.pricing.total, true)}</b> en {current.plan} fois</dd>
                <dt>Consentements</dt><dd>Règlement intérieur {current.rulesAcceptedAt ? `accepté le ${formatDateFr(current.rulesAcceptedAt)}` : 'non signé'} · droit à l’image {current.imageRights === null ? 'non renseigné' : `${current.imageRights ? 'accordé' : 'refusé'} le ${formatDateFr(current.imageRightsAt)}`}</dd>
                {!ds.complete && <><dt>Manquant</dt><dd className="neg">{ds.missing.join(', ')}</dd></>}
              </dl>
              {can('eleves') && (
                <div className="filters">
                  {current.status === 'a_valider' && <button type="button" className="btn pri sm" disabled={current.siblingCheck === 'a_verifier'} title={current.siblingCheck === 'a_verifier' ? 'Vérifiez d’abord le rattachement' : undefined} onClick={() => run(() => api.validateEnrollment(current.id), 'Inscription validée.')}>Valider l’inscription</button>}
                  <label className="checkline sm"><span>Droit à l’image</span><select className="in" style={{ width: 'auto', minHeight: 30, padding: '3px 8px' }} value={current.imageRights === null ? '' : current.imageRights ? 'oui' : 'non'} onChange={(e) => run(() => api.updateEnrollment(current.id, { imageRights: e.target.value === '' ? null : e.target.value === 'oui' }), 'Consentement enregistré avec sa date.')}><option value="">non renseigné</option><option value="oui">accordé</option><option value="non">refusé</option></select></label>
                  {s.settings.requiredDocuments.map((doc) => (
                    <label key={doc} className="checkline sm"><input type="checkbox" checked={current.documentsReceived.includes(doc)} onChange={(e) => run(() => api.updateEnrollment(current.id, { documentsReceived: e.target.checked ? [...current.documentsReceived, doc] : current.documentsReceived.filter((x) => x !== doc) }), 'Pièce mise à jour.')} />{doc} reçue</label>
                  ))}
                  {onAttestation && <button type="button" className="btn sm" onClick={() => onAttestation(current)}>Attestation PDF</button>}
                  <button type="button" className="btn danger sm" onClick={() => { if (confirm(`Annuler l’inscription de ${st.firstName} ? Les échéances non réglées seront supprimées.`)) void run(() => api.cancelEnrollment(current.id), 'Inscription annulée.'); }}>Annuler l’inscription</button>
                </div>
              )}
            </>
          );
        })()}
        {waits.map((w) => <div key={w.id} className="note warn">Sur liste d’attente en {d.courses.get(w.courseId)?.discipline} depuis le {formatDateFr(w.createdAt)}{w.status === 'proposee' ? ' · place proposée' : ''}.</div>)}
        <div>
          <h4 style={{ margin: '0 0 6px', fontSize: 13 }}>Historique des saisons</h4>
          <div className="tw"><table className="t"><thead><tr><th>Saison</th><th>Cours</th><th>Niveau</th><th className="r">Tarif</th><th>Statut</th></tr></thead><tbody>
            {history.map((e) => <tr key={e.id}><td className="tnum">{seasonLabel(e.seasonId)}</td><td className="sm">{d.courses.get(e.courseId)?.discipline}</td><td className="sm">{e.level}</td><td className="r tnum">{formatEuros(e.pricing.total, true)}</td><td className="sm">{e.status === 'validee' ? 'validée' : e.status === 'a_valider' ? 'à valider' : 'annulée'}</td></tr>)}
          </tbody></table></div>
        </div>
      </div>
    </section>
  );
}
