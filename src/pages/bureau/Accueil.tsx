import { Link } from 'react-router-dom';
import { addDays, formatDateFr, formatEuros, sum, weekStart } from '../../domain/index.ts';
import { paymentLabel } from '../../lib/format.ts';
import { Bar, InstrumentTag, Kpi } from '../../components/ui.tsx';
import { useStore } from '../../store.tsx';
import { useDerived } from '../../lib/derive.ts';
import { PageTop } from './BureauApp.tsx';

const DAYS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
export const longDate = (iso: string) => { const d = new Date(`${iso}T12:00:00`); return `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`; };

export function AccueilPage() {
  const { snap, today, session, can } = useStore();
  const d = useDerived();
  const s = snap!;
  const studentsIn = new Set(d.activeEnrollments.map((e) => e.studentId));
  const thisWeek = d.activeEnrollments.filter((e) => e.createdAt.slice(0, 10) >= weekStart(today)).length;
  const fill = d.courseFill.filter((c) => c.course.kind !== 'fm');
  const remaining = fill.reduce((a, c) => a + c.remaining, 0);
  const full = fill.filter((c) => c.remaining <= 0).length;
  const waiting = fill.reduce((a, c) => a + c.waiting, 0);
  const pct = d.expected ? Math.round((d.cashed / d.expected) * 100) : 0;
  const lateFamilies = new Set(d.late.map((i) => i.familyId));
  const handIn = sum(d.toHandIn.map((p) => p.amount));
  const freePlaces = fill.filter((c) => c.remaining > 0 && c.waiting > 0);
  const firstWaiting = (courseId: string) => s.waitlist.filter((w) => w.courseId === courseId && w.status === 'en_attente').sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0];
  const missingAtt = s.entries.filter((e) => e.kind === 'depense' && !e.attachmentId && e.date >= d.season.startsOn && e.date <= d.season.endsOn).length;
  const nextEvent = s.events.filter((e) => e.date >= today).sort((a, b) => a.date.localeCompare(b.date))[0];

  const todo: { title: string; detail: string; to: string }[] = [];
  if (d.toHandIn.length && can('bordereaux')) todo.push({ title: `Remettre ${d.toHandIn.length} pièce${d.toHandIn.length > 1 ? 's' : ''} en banque`, detail: `bordereau à préparer · ${formatEuros(handIn, true)}`, to: '/bureau/encaissements' });
  if (lateFamilies.size) todo.push({ title: `Relancer ${lateFamilies.size} famille${lateFamilies.size > 1 ? 's' : ''} en retard de règlement`, detail: 'mails préparés, envoyés après validation', to: '/bureau/encaissements' });
  for (const c of freePlaces) { const w = firstWaiting(c.course.id); const st = w && d.students.get(w.studentId); if (st) todo.push({ title: `Proposer la place libre en ${c.course.discipline} à ${st.firstName} ${st.lastName.slice(0, 1)}.`, detail: '1er de la liste d’attente', to: '/bureau/places' }); }
  if (d.siblingChecks.length) todo.push({ title: `Vérifier ${d.siblingChecks.length} rattachement${d.siblingChecks.length > 1 ? 's' : ''} de fratrie`, detail: 'dossiers reçus avec la mention « rattachement à vérifier »', to: '/bureau/eleves?vue=a_valider' });
  if (d.toValidate.length) todo.push({ title: `Valider ${d.toValidate.length} dossier${d.toValidate.length > 1 ? 's' : ''} reçu${d.toValidate.length > 1 ? 's' : ''}`, detail: 'inscriptions en ligne et réinscriptions', to: '/bureau/eleves?vue=a_valider' });
  if (d.incomplete.length) todo.push({ title: `Compléter ${d.incomplete.length} dossier${d.incomplete.length > 1 ? 's' : ''}`, detail: 'pièces ou autorisations manquantes', to: '/bureau/eleves?vue=incomplets' });
  if (missingAtt && can('comptabilite')) todo.push({ title: `Joindre ${missingAtt} justificatif${missingAtt > 1 ? 's' : ''} de dépense`, detail: 'comptabilité de la saison', to: '/bureau/comptabilite' });

  const lastPayments = [...s.payments].filter((p) => d.instById.has(p.installmentId)).sort((a, b) => b.receivedOn.localeCompare(a.receivedOn) || b.createdAt.localeCompare(a.createdAt)).slice(0, 5);

  return (
    <>
      <PageTop
        title={`Bonjour ${session!.staff.fullName.split(' ')[0]}`}
        sub={`${longDate(today).replace(/^./, (c) => c.toUpperCase())} · saison ${d.season.label}`}
        acts={<><a className="btn" href="/inscription" target="_blank" rel="noopener">Voir le formulaire famille</a>{can('comptabilite') && <Link className="btn pri" to="/bureau/comptabilite?saisie=depense">+ Saisir une dépense</Link>}</>}
      />
      <main className="content" id="contenu">
        <div className="kpis">
          <Kpi label="Élèves inscrits" value={studentsIn.size} detail={thisWeek ? <span className="pos">+{thisWeek} cette semaine</span> : 'aucun nouveau dossier cette semaine'} />
          <Kpi label="Dossiers incomplets" value={d.incomplete.length} detail="pièces ou autorisations manquantes" alert={d.incomplete.length > 0} />
          <Kpi label="Encaissé" value={<>{formatEuros(Math.round(d.cashed))} <small>/ {formatEuros(Math.round(d.expected))}</small></>} bar={pct} detail={`${pct} % des montants de la saison`} />
          <Kpi label="Places restantes" value={remaining} detail={`${full} cours complet${full > 1 ? 's' : ''} · ${waiting} en attente`} />
        </div>
        <div className="grid2">
          <div className="stack">
            <section className="card" aria-labelledby="todo-h">
              <header><h2 id="todo-h">À faire cette semaine</h2><span className="sp" /><span className="muted sm">{todo.length} action{todo.length > 1 ? 's' : ''}</span></header>
              <div className="list">
                {todo.length === 0 && <div className="empty">Rien d’urgent. Bonne semaine !</div>}
                {todo.map((t) => <div className="li" key={t.title}><span className="grow"><b style={{ fontWeight: 600 }}>{t.title}</b><div className="muted sm">{t.detail}</div></span><Link className="btn sm" to={t.to}>Ouvrir</Link></div>)}
              </div>
            </section>
            <section className="card" aria-labelledby="last-h">
              <header><h2 id="last-h">Derniers règlements reçus</h2><span className="sp" /><Link className="btn sm" to="/bureau/encaissements">Tout voir</Link></header>
              <div className="tw"><table className="t"><thead><tr><th>Date</th><th>Famille</th><th>Mode</th><th className="r">Montant</th></tr></thead><tbody>
                {lastPayments.map((p) => { const it = d.instById.get(p.installmentId)!; return <tr key={p.id}><td className="tnum">{formatDateFr(p.receivedOn, false)}</td><td>{d.familyLabel(p.familyId)}<div className="muted xs">{it.student.firstName} · {it.rank}/{it.count}</div></td><td className="sm">{paymentLabel(p, false)}</td><td className="r tnum"><b>{formatEuros(p.amount)}</b></td></tr>; })}
              </tbody></table></div>
            </section>
          </div>
          <div className="stack">
            <section className="card" aria-labelledby="fill-h">
              <header><h2 id="fill-h">Remplissage des cours</h2><span className="sp" /><Link className="btn sm" to="/bureau/places">Détail</Link></header>
              <div style={{ padding: '8px 0' }}>
                {fill.map((c) => <div className="fill" key={c.course.id}><InstrumentTag abbr={c.course.abbr} color={c.course.color} name={c.course.discipline} /><Bar value={c.enrolled} max={c.course.capacity} full={c.remaining <= 0} /><span className="tnum sm" style={{ textAlign: 'right' }}>{c.enrolled}/{c.course.capacity}</span></div>)}
              </div>
            </section>
            <section className="card" aria-labelledby="ev-h">
              <header><h2 id="ev-h">Prochain événement</h2></header>
              <div className="body" style={{ display: 'grid', gap: 6 }}>
                {nextEvent ? <>
                  <b style={{ fontSize: 15 }}>{nextEvent.name} · {longDate(nextEvent.date)}</b>
                  <span className="muted sm">{nextEvent.place} · budget prévu {formatEuros(nextEvent.budget)}{nextEvent.date <= addDays(today, 7) ? ' · cette semaine' : ''}</span>
                  {can('comptabilite') && <div><Link className="btn sm" to="/bureau/comptabilite">Budget de l’événement</Link></div>}
                </> : <span className="muted">Aucun événement prévu.</span>}
              </div>
            </section>
          </div>
        </div>
      </main>
    </>
  );
}
