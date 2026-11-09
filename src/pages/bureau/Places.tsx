import { useState } from 'react';
import { dataSource } from '../../data/index.ts';
import { formatDateFr, weekStart, type CourseKind } from '../../domain/index.ts';
import { Bar, Badge, InstrumentTag, Kpi, Modal } from '../../components/ui.tsx';
import { useStore } from '../../store.tsx';
import { useDerived } from '../../lib/derive.ts';
import { PageTop } from './BureauApp.tsx';
import { FamilyModal } from './Eleves.tsx';

export function PlacesPage() {
  const { snap, run, can } = useStore();
  const s = snap!;
  const d = useDerived();
  const [kind, setKind] = useState<CourseKind>('instrument');
  const [openFamily, setOpenFamily] = useState<string | null>(null);
  const [linksOpen, setLinksOpen] = useState(false);
  const api = dataSource.staffApi;

  const fill = d.courseFill.filter((c) => c.course.kind !== 'fm');
  const cap = fill.reduce((a, c) => a + c.course.capacity, 0);
  const ins = fill.reduce((a, c) => a + c.enrolled, 0);
  const waitlist = s.waitlist.filter((w) => w.seasonId === d.season.id && (w.status === 'en_attente' || w.status === 'proposee')).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const received = d.seasonEnrollments.length + s.waitlist.filter((w) => w.seasonId === d.season.id).length;
  const validated = d.activeEnrollments.filter((e) => e.status === 'validee');
  const reinscr = validated.filter((e) => e.source === 'reinscription').length;
  const byDisc = new Map<string, number>();
  for (const w of waitlist) { const c = d.courses.get(w.courseId); if (c) byDisc.set(c.discipline, (byDisc.get(c.discipline) ?? 0) + 1); }

  // Dossiers reçus par semaine
  const weeks = new Map<string, { re: number; nouveaux: number }>();
  for (const e of d.seasonEnrollments) { const w = weekStart(e.createdAt.slice(0, 10)); const x = weeks.get(w) ?? { re: 0, nouveaux: 0 }; if (e.source === 'reinscription') x.re++; else x.nouveaux++; weeks.set(w, x); }
  for (const e of s.waitlist.filter((x) => x.seasonId === d.season.id)) { const w = weekStart(e.createdAt.slice(0, 10)); const x = weeks.get(w) ?? { re: 0, nouveaux: 0 }; x.nouveaux++; weeks.set(w, x); }
  const series = [...weeks.entries()].sort((a, b) => a[0].localeCompare(b[0])).slice(-12);

  const isFirst = (id: string, courseId: string) => waitlist.filter((w) => w.courseId === courseId)[0]?.id === id;

  return (
    <>
      <PageTop
        title="Inscriptions et places restantes"
        sub={`Saison ${d.season.label} · inscriptions ${d.season.registrationOpen ? 'ouvertes' : 'fermées'}`}
        acts={can('places') && <button type="button" className="btn pri" onClick={() => setLinksOpen(true)}>Envoyer les liens de réinscription</button>}
      />
      <main className="content" id="contenu">
        <div className="kpis">
          <Kpi label="Dossiers reçus" value={received} detail={`depuis l’ouverture · dont ${s.waitlist.filter((w) => w.seasonId === d.season.id).length} en liste d’attente`} />
          <Kpi label="Inscriptions validées" value={validated.length} detail={`dont ${reinscr} réinscriptions · ${d.toValidate.length} à valider`} />
          <Kpi label="Places restantes" value={cap - ins} bar={cap ? (ins / cap) * 100 : 0} detail={`${ins} places occupées sur ${cap}`} />
          <Kpi label="Liste d’attente" value={waitlist.length} detail={[...byDisc.entries()].map(([k, v]) => `${k.toLowerCase()} ${v}`).join(' · ') || 'vide'} alert={waitlist.length > 0} />
        </div>
        <div className="grid2">
          <section className="card" aria-labelledby="pl-h">
            <header><h2 id="pl-h">Places par cours</h2><span className="sp" /><div className="seg" role="group" aria-label="Type de cours">{([['instrument', 'Instruments'], ['collectif', 'Collectifs'], ['fm', 'Formation musicale']] as [CourseKind, string][]).map(([k, l]) => <button key={k} type="button" aria-pressed={kind === k} onClick={() => setKind(k)}>{l}</button>)}</div></header>
            <div className="tw"><table className="t">
              <thead><tr><th>Cours</th><th>Professeur</th><th>Remplissage</th><th className="r">Inscrits</th><th className="r">Restantes</th><th className="r">Attente</th></tr></thead>
              <tbody>{d.courseFill.filter((c) => c.course.kind === kind).map((c) => (
                <tr key={c.course.id}><td><InstrumentTag abbr={c.course.abbr} color={c.course.color} name={c.course.discipline} /></td><td className="sm">{c.course.teacher}</td><td style={{ minWidth: 110 }}><Bar value={c.enrolled} max={c.course.capacity} full={c.remaining <= 0} /></td><td className="r tnum">{c.enrolled}/{c.course.capacity}</td><td className="r">{c.remaining <= 0 ? <Badge tone="warn">complet</Badge> : <b className="tnum">{c.remaining}</b>}</td><td className="r tnum">{c.waiting || <span className="muted">—</span>}</td></tr>
              ))}</tbody>
            </table></div>
            <div className="foot muted sm">Les capacités se règlent dans Paramètres.</div>
          </section>
          <div className="stack">
            <section className="card" aria-labelledby="wk-h">
              <header><h2 id="wk-h">Dossiers reçus par semaine</h2></header>
              <div className="body"><WeekChart series={series} /></div>
            </section>
            <section className="card" aria-labelledby="wl-h">
              <header><h2 id="wl-h">Liste d’attente</h2><span className="sp" /><span className="muted sm">dans l’ordre d’arrivée</span></header>
              <div className="list">
                {waitlist.length === 0 && <div className="empty">Personne en attente.</div>}
                {waitlist.map((w, i) => {
                  const st = d.students.get(w.studentId);
                  const c = d.courses.get(w.courseId)!;
                  const free = (d.courseFill.find((x) => x.course.id === c.id)?.remaining ?? 0) > 0;
                  return (
                    <div className="li" key={w.id}>
                      <span className="tnum muted" style={{ width: 18, fontWeight: 700 }}>{i + 1}</span>
                      <span className="grow"><button type="button" className="linkbtn" style={{ textDecoration: 'none', color: 'inherit' }} onClick={() => setOpenFamily(w.familyId)}><b style={{ fontWeight: 600 }}>{st?.firstName} {st?.lastName.slice(0, 1)}.</b></button><div className="muted sm">{c.discipline} · depuis le {formatDateFr(w.createdAt, false)}{w.status === 'proposee' ? ` · place proposée le ${formatDateFr(w.proposedAt)}` : ''}</div></span>
                      {can('places') && w.status === 'en_attente' && isFirst(w.id, c.id) && <button type="button" className="btn pri sm" disabled={!free} title={free ? undefined : 'Aucune place libre dans ce cours'} onClick={() => run(() => api.proposePlace(w.id), 'Place proposée : mail envoyé à la famille.')}>Proposer la place</button>}
                      {can('places') && w.status === 'proposee' && <><button type="button" className="btn pri sm" onClick={() => run(() => api.acceptWaitlist(w.id), 'Inscription créée.')}>Inscrire</button><button type="button" className="btn sm" onClick={() => run(() => api.refuseWaitlist(w.id), 'Demande retirée.')}>Retirer</button></>}
                    </div>
                  );
                })}
              </div>
            </section>
          </div>
        </div>
        <section className="card" aria-labelledby="val-h">
          <header><h2 id="val-h">Dossiers à valider</h2><span className="sp" /><span className="muted sm">{d.toValidate.length} dossier{d.toValidate.length > 1 ? 's' : ''}</span></header>
          <div className="list">
            {d.toValidate.length === 0 && <div className="empty">Tous les dossiers sont validés.</div>}
            {d.toValidate.map((e) => {
              const st = d.students.get(e.studentId)!;
              const c = d.courses.get(e.courseId)!;
              return (
                <div className="li" key={e.id}>
                  <span className="grow"><b style={{ fontWeight: 600 }}>{st.firstName} {st.lastName}</b> · {c.discipline}<div className="muted sm">reçu le {formatDateFr(e.createdAt)} · {e.source === 'reinscription' ? 'réinscription' : 'inscription en ligne'}{e.siblingCheck === 'a_verifier' ? ' · rattachement à vérifier' : ''}</div></span>
                  <button type="button" className="btn sm" onClick={() => setOpenFamily(e.familyId)}>Ouvrir le dossier</button>
                  {can('eleves') && e.siblingCheck !== 'a_verifier' && <button type="button" className="btn pri sm" onClick={() => run(() => api.validateEnrollment(e.id), 'Inscription validée.')}>Valider</button>}
                </div>
              );
            })}
          </div>
        </section>
      </main>
      {openFamily && <FamilyModal familyId={openFamily} d={d} onClose={() => setOpenFamily(null)} />}
      {linksOpen && <ReinscriptionLinks onClose={() => setLinksOpen(false)} />}
    </>
  );
}

function WeekChart({ series }: { series: [string, { re: number; nouveaux: number }][] }) {
  if (!series.length) return <p className="muted sm">Aucun dossier.</p>;
  const W = 420, H = 170, L = 26, B = 24, T = 12;
  const max = Math.max(10, Math.ceil(Math.max(...series.map(([, v]) => v.re + v.nouveaux)) / 10) * 10);
  const bw = (W - L - 8) / series.length;
  const y = (v: number) => H - B - (v / max) * (H - B - T);
  const ticks = [0, max / 2, max];
  return (
    <>
      <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Dossiers reçus par semaine : ${series.map(([w, v]) => `semaine du ${formatDateFr(w, false)}, ${v.re + v.nouveaux}`).join(' ; ')}`}>
        {ticks.map((v) => <g key={v}><line x1={L} x2={W - 4} y1={y(v)} y2={y(v)} stroke="#e4e7ec" /><text x={L - 6} y={y(v) + 4} fontSize="10" textAnchor="end" fill="#5a6478">{v}</text></g>)}
        {series.map(([w, v], i) => {
          const x = L + 6 + i * bw;
          const tot = v.re + v.nouveaux;
          return (
            <g key={w}>
              <rect x={x} y={y(tot)} width={Math.max(4, bw - 10)} height={H - B - y(v.nouveaux)} rx="2" fill="#8cbbe6" />
              <rect x={x} y={y(v.re)} width={Math.max(4, bw - 10)} height={H - B - y(v.re)} rx="2" fill="#1f78c8" />
              <text x={x + (bw - 10) / 2} y={y(tot) - 4} fontSize="10" textAnchor="middle" fill="#16181d" fontWeight="700">{tot}</text>
              <text x={x + (bw - 10) / 2} y={H - 8} fontSize="9.5" textAnchor="middle" fill="#5a6478">{formatDateFr(w, false)}</text>
            </g>
          );
        })}
      </svg>
      <div className="muted xs" style={{ display: 'flex', gap: 14, marginTop: 4, flexWrap: 'wrap' }}><span><b style={{ color: '#1f78c8' }}>■</b> réinscriptions</span><span><b style={{ color: '#8cbbe6' }}>■</b> nouveaux élèves et liste d’attente</span></div>
    </>
  );
}

function ReinscriptionLinks({ onClose }: { onClose: () => void }) {
  const { snap, run } = useStore();
  const s = snap!;
  const d = useDerived();
  const prev = s.seasons.filter((x) => x.startsOn < d.season.startsOn).sort((a, b) => b.startsOn.localeCompare(a.startsOn))[0];
  const already = new Set(d.activeEnrollments.map((e) => e.studentId));
  const fams = prev ? [...new Set(s.enrollments.filter((e) => e.seasonId === prev.id && e.status === 'validee' && !already.has(e.studentId)).map((e) => e.familyId))].map((id) => d.families.get(id)!).filter(Boolean) : [];
  const [sel, setSel] = useState<Set<string>>(new Set(fams.map((f) => f.id)));
  const sentTo = new Set(s.mails.filter((m) => m.kind === 'reinscription').map((m) => m.to));
  return (
    <Modal title="Envoyer les liens de réinscription" onClose={onClose} footer={<><button type="button" className="btn" onClick={onClose}>Annuler</button><button type="button" className="btn pri" disabled={!sel.size} onClick={async () => { if (await run(() => dataSource.staffApi.sendReinscriptionLinks([...sel]), `${sel.size} lien(s) envoyé(s).`)) onClose(); }}>Envoyer {sel.size} lien{sel.size > 1 ? 's' : ''}</button></>}>
      <p className="sm" style={{ margin: 0 }}>Familles inscrites en {prev?.label ?? '—'} dont au moins un élève n’est pas encore réinscrit. Chaque famille reçoit un lien personnel pour réinscrire ses enfants sans tout ressaisir.</p>
      {fams.length === 0 && <div className="empty">Aucune famille à relancer.</div>}
      <div className="list">{fams.map((f) => { const g = d.guardiansByFamily.get(f.id)?.[0]; return <label key={f.id} className="checkline li"><input type="checkbox" checked={sel.has(f.id)} onChange={(e) => { const n = new Set(sel); if (e.target.checked) n.add(f.id); else n.delete(f.id); setSel(n); }} /><span>Famille {f.familyName} · {f.commune}{g && sentTo.has(g.email) ? <span className="muted sm"> · lien déjà envoyé</span> : null}</span></label>; })}</div>
    </Modal>
  );
}
