import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ApiError, dataSource } from '../../data/index.ts';
import { formatDateFr, formatEuros, METHOD_LABELS, normalizeName, round2, STATUS_LABELS, sum, type InstallmentStatus, type PaymentMethod } from '../../domain/index.ts';
import { Badge, Field, Kpi, Modal, type Tone } from '../../components/ui.tsx';
import { useStore } from '../../store.tsx';
import { useDerived, type InstallmentRow } from '../../lib/derive.ts';
import { downloadBlob } from '../../lib/download.ts';
import { paymentLabel } from '../../lib/format.ts';
import { PageTop } from './BureauApp.tsx';

const TONE: Record<InstallmentStatus, Tone> = { encaisse: 'ok', a_remettre: 'warn', en_retard: 'late', prevu: 'idle' };
type Filter = 'toutes' | InstallmentStatus;

export function EncaissementsPage() {
  const { snap, run, can, today } = useStore();
  const s = snap!;
  const d = useDerived();
  const api = dataSource.staffApi;
  const [filter, setFilter] = useState<Filter>('toutes');
  const [q, setQ] = useState('');
  const [payFor, setPayFor] = useState<InstallmentRow | null | 'choose'>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [depositDate, setDepositDate] = useState(today);

  const counts = useMemo(() => {
    const c: Record<string, number> = { toutes: d.installments.length };
    for (const i of d.installments) c[i.state.status] = (c[i.state.status] ?? 0) + 1;
    return c;
  }, [d]);
  const nq = normalizeName(q);
  const rows = d.installments.filter((i) => (filter === 'toutes' || i.state.status === filter) && (!nq || normalizeName(i.family.familyName + i.student.firstName).includes(nq)));
  const pending = s.depositSlips.filter((x) => !x.depositedOn).sort((a, b) => b.number - a.number)[0];
  const deposited = s.depositSlips.filter((x) => x.depositedOn).sort((a, b) => b.number - a.number);
  const toHandIn = d.toHandIn;
  const pct = d.expected ? Math.round((d.cashed / d.expected) * 100) : 0;
  const lateFamilies = new Set(d.late.map((i) => i.familyId));
  const lateAmount = sum(d.late.map((i) => round2(i.amount - i.state.received)));
  const handInAmount = sum(toHandIn.map((p) => p.amount));
  const byMethod = (['cheque', 'virement', 'ancv', 'especes'] as PaymentMethod[]).map((m) => ({ m, total: sum(s.payments.filter((p) => p.method === m && p.cashedOn && d.instById.has(p.installmentId)).map((p) => p.amount)) }));
  const maxM = Math.max(1, ...byMethod.map((x) => x.total));
  const drafts = s.mails.filter((m) => m.kind === 'relance' && m.status === 'brouillon').length;
  const school = { name: s.settings.schoolName, address: s.settings.schoolAddress, email: s.settings.schoolEmail };

  const slipPdf = async (slipId: string) => {
    const slip = s.depositSlips.find((x) => x.id === slipId)!;
    const { bordereauPdf } = await import('../../lib/pdf.ts');
    const lines = slip.paymentIds.map((id) => s.payments.find((p) => p.id === id)!).filter(Boolean).map((p) => ({ family: `Famille ${d.families.get(p.familyId)?.familyName ?? ''}`, payment: p }));
    downloadBlob(bordereauPdf(school, slip, lines, today), `bordereau-${slip.number}.pdf`);
  };

  return (
    <>
      <PageTop
        title="Encaissements"
        sub={`Chaque échéance suivie jusqu’à la banque · saison ${d.season.label}`}
        acts={<><button type="button" className="btn" disabled={!d.late.length} onClick={() => run(() => api.prepareReminders(d.late.map((i) => i.id)), 'Relances préparées : à valider dans Mails.')}>Préparer les relances</button><button type="button" className="btn pri" onClick={() => setPayFor('choose')}>+ Enregistrer un règlement</button></>}
      />
      <main className="content" id="contenu">
        <div className="kpis">
          <Kpi label="Attendu sur la saison" value={formatEuros(Math.round(d.expected))} detail={`${d.activeEnrollments.length} inscriptions · ${d.installments.length} échéances`} />
          <Kpi label="Encaissé" value={formatEuros(Math.round(d.cashed))} bar={pct} detail={`${pct} % · à jour au ${formatDateFr(today)}`} />
          <Kpi label="À remettre en banque" value={formatEuros(handInAmount, true)} detail={`${toHandIn.length} pièce${toHandIn.length > 1 ? 's' : ''} non déposée${toHandIn.length > 1 ? 's' : ''}`} />
          <Kpi label="En retard" value={formatEuros(lateAmount)} detail={<span className="neg">{lateFamilies.size} famille{lateFamilies.size > 1 ? 's' : ''}{drafts ? ` · ${drafts} relance${drafts > 1 ? 's' : ''} à valider` : ''}</span>} alert={lateFamilies.size > 0} />
        </div>
        {drafts > 0 && <div className="note warn"><span>{drafts} relance{drafts > 1 ? 's' : ''} préparée{drafts > 1 ? 's' : ''}, en attente de validation.</span><Link to="/bureau/mails" className="btn sm" style={{ marginLeft: 'auto' }}>Relire et envoyer</Link></div>}
        <div className="grid2">
          <section className="card" aria-labelledby="ech-h">
            <header><h2 id="ech-h">Échéances</h2><span className="sp" />
              <div className="seg" role="group" aria-label="Statut">{(['toutes', 'a_remettre', 'en_retard', 'prevu', 'encaisse'] as Filter[]).map((f) => <button key={f} type="button" aria-pressed={filter === f} onClick={() => setFilter(f)}>{f === 'toutes' ? 'Toutes' : STATUS_LABELS[f]} · {counts[f] ?? 0}</button>)}</div>
            </header>
            <header className="filters"><label className="search"><span className="sr-only">Rechercher une famille</span><input className="in" type="search" placeholder="Rechercher une famille, un élève…" value={q} onChange={(e) => setQ(e.target.value)} /></label></header>
            <div className="tw"><table className="t">
              <thead><tr><th>Échéance</th><th>Famille</th><th>Mode et référence</th><th className="r">Montant</th><th>Statut</th><th><span className="sr-only">Action</span></th></tr></thead>
              <tbody>{rows.slice(0, 200).map((i) => (
                <tr key={i.id}>
                  <td className="tnum">{formatDateFr(i.dueOn, false)}</td>
                  <td><b style={{ fontWeight: 600 }}>Famille {i.family.familyName}</b><div className="muted xs">{i.student.firstName} · {i.rank}/{i.count}</div></td>
                  <td className="sm">{i.payments.length ? i.payments.map((p) => <div key={p.id}>{paymentLabel(p)}</div>) : <span className="muted">{METHOD_LABELS[i.enrollment.intendedMethod]} attendu</span>}</td>
                  <td className="r tnum"><b>{formatEuros(i.amount, true)}</b></td>
                  <td><Badge tone={TONE[i.state.status]}>{STATUS_LABELS[i.state.status]}</Badge>{i.state.received > 0 && i.state.received < i.amount && <div className="muted xs">reçu {formatEuros(i.state.received, true)}</div>}</td>
                  <td>{i.state.received < i.amount && <button type="button" className="btn sm" onClick={() => setPayFor(i)}>Enregistrer</button>}</td>
                </tr>
              ))}</tbody>
            </table>
            {rows.length > 200 && <div className="empty">200 premières échéances affichées : affinez la recherche.</div>}
            {rows.length === 0 && <div className="empty">Aucune échéance.</div>}
            </div>
          </section>
          <div className="stack">
            {can('bordereaux') && (
              <section className="card" aria-labelledby="bord-h">
                {pending ? (
                  <>
                    <header><h2 id="bord-h">Bordereau de remise n° {pending.number}</h2><span className="sp" /><Badge tone="warn">à déposer</Badge></header>
                    <div className="tw"><table className="t"><thead><tr><th>Famille</th><th>Pièce</th><th className="r">Montant</th></tr></thead><tbody>
                      {pending.paymentIds.map((id) => s.payments.find((p) => p.id === id)!).filter(Boolean).map((p) => <tr key={p.id}><td>Famille {d.families.get(p.familyId)?.familyName}</td><td className="sm">{p.method === 'cheque' ? p.reference : METHOD_LABELS[p.method]}</td><td className="r tnum">{formatEuros(p.amount, true)}</td></tr>)}
                      <tr className="tot"><td colSpan={2}>Total du bordereau</td><td className="r tnum">{formatEuros(sum(pending.paymentIds.map((id) => s.payments.find((p) => p.id === id)?.amount ?? 0)), true)}</td></tr>
                    </tbody></table></div>
                    <div className="foot">
                      <button type="button" className="btn pri sm" onClick={() => slipPdf(pending.id)}>Générer le bordereau PDF</button>
                      <label className="sm" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>Déposé le<input type="date" className="in" style={{ width: 'auto', minHeight: 30, padding: '3px 6px' }} value={depositDate} max={today} onChange={(e) => setDepositDate(e.target.value)} /></label>
                      <button type="button" className="btn sm" onClick={() => run(() => api.markDeposited(pending.id, depositDate), 'Bordereau déposé : recettes ajoutées en comptabilité.')}>Marquer comme déposé</button>
                    </div>
                  </>
                ) : (
                  <>
                    <header><h2 id="bord-h">Pièces à remettre en banque</h2><span className="sp" /><span className="muted sm">{toHandIn.length} pièce{toHandIn.length > 1 ? 's' : ''}</span></header>
                    <div className="list">
                      {toHandIn.length === 0 && <div className="empty">Aucune pièce en attente de dépôt.</div>}
                      {toHandIn.map((p) => <label key={p.id} className="li checkline"><input type="checkbox" checked={selected.has(p.id)} onChange={(e) => { const n = new Set(selected); if (e.target.checked) n.add(p.id); else n.delete(p.id); setSelected(n); }} /><span className="grow">Famille {d.families.get(p.familyId)?.familyName}<div className="muted sm">{paymentLabel(p)} · reçu le {formatDateFr(p.receivedOn)}</div></span><b className="tnum">{formatEuros(p.amount, true)}</b></label>)}
                    </div>
                    {toHandIn.length > 0 && <div className="foot"><button type="button" className="btn sm" onClick={() => setSelected(new Set(toHandIn.map((p) => p.id)))}>Tout sélectionner</button><button type="button" className="btn pri sm" disabled={!selected.size} onClick={async () => { if (await run(() => api.createDepositSlip([...selected]), 'Bordereau préparé.')) setSelected(new Set()); }}>Préparer le bordereau</button></div>}
                  </>
                )}
                {deposited.length > 0 && (
                  <details className="foot" style={{ display: 'block' }}>
                    <summary className="sm" style={{ cursor: 'pointer', fontWeight: 600 }}>Bordereaux déposés ({deposited.length})</summary>
                    <div className="list">{deposited.map((x) => <div className="li" key={x.id}><span className="grow">N° {x.number} · déposé le {formatDateFr(x.depositedOn)}<div className="muted sm">{x.paymentIds.length} pièce{x.paymentIds.length > 1 ? 's' : ''} · {formatEuros(sum(x.paymentIds.map((id) => s.payments.find((p) => p.id === id)?.amount ?? 0)), true)}</div></span><button type="button" className="btn sm" onClick={() => slipPdf(x.id)}>PDF</button></div>)}</div>
                  </details>
                )}
              </section>
            )}
            <section className="card" aria-labelledby="mode-h">
              <header><h2 id="mode-h">Encaissé par mode de règlement</h2></header>
              <div style={{ padding: '8px 0' }}>{byMethod.map((x) => <div className="fill" key={x.m}><span className="sm">{METHOD_LABELS[x.m]}</span><span className="bar" role="img" aria-label={formatEuros(x.total)}><i style={{ width: `${(x.total / maxM) * 100}%` }} /></span><span className="tnum sm" style={{ textAlign: 'right' }}>{formatEuros(Math.round(x.total))}</span></div>)}</div>
              <div className="foot muted xs">Les chèques vacances ANCV figurent sur le bordereau pour le suivi ; leur remboursement passe par l’ANCV.</div>
            </section>
          </div>
        </div>
      </main>
      {payFor && <PaymentModal row={payFor === 'choose' ? null : payFor} onClose={() => setPayFor(null)} />}
    </>
  );
}

export function PaymentModal({ row, onClose }: { row: InstallmentRow | null; onClose: () => void }) {
  const { run, today } = useStore();
  const d = useDerived();
  const [instId, setInstId] = useState(row?.id ?? '');
  const [q, setQ] = useState('');
  const current = d.instById.get(instId) ?? null;
  const [amount, setAmount] = useState(row ? String(round2(row.amount - row.state.received)) : '');
  const [method, setMethod] = useState<PaymentMethod>(row?.enrollment.intendedMethod ?? 'cheque');
  const [reference, setReference] = useState('');
  const [bank, setBank] = useState('');
  const [receivedOn, setReceivedOn] = useState(today);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const nq = normalizeName(q);
  const open = d.installments.filter((i) => i.state.received < i.amount && (!nq || normalizeName(i.family.familyName + i.student.firstName).includes(nq))).slice(0, 40);
  const choose = (id: string) => {
    const i = d.instById.get(id);
    setInstId(id);
    if (i) { setAmount(String(round2(i.amount - i.state.received))); setMethod(i.enrollment.intendedMethod); }
  };
  const save = async () => {
    const e: Record<string, string> = {};
    if (!current) e.inst = 'Choisissez l’échéance réglée.';
    const n = Number(amount.replace(',', '.'));
    if (!(n > 0)) e.amount = 'Indiquez un montant positif.';
    if (method === 'cheque' && !reference.trim()) e.reference = 'Indiquez le numéro du chèque.';
    setErrors(e);
    if (Object.keys(e).length) return;
    const ok = await run(async () => {
      try { await dataSource.staffApi.recordPayment({ installmentId: instId, amount: n, method, reference: method === 'cheque' && !/^ch/i.test(reference.trim()) ? `Chèque n° ${reference.trim()}` : reference, bank, receivedOn }); }
      catch (err) { if (err instanceof ApiError && err.fieldErrors) setErrors(err.fieldErrors); throw err; }
    }, method === 'virement' ? 'Virement enregistré : recette ajoutée en comptabilité.' : 'Règlement enregistré : à remettre en banque.');
    if (ok) onClose();
  };
  return (
    <Modal title="Enregistrer un règlement" onClose={onClose} footer={<><button type="button" className="btn" onClick={onClose}>Annuler</button><button type="button" className="btn pri" onClick={save}>Enregistrer le règlement</button></>}>
      {current ? (
        <div className="fin"><div>Famille {current.family.familyName} · {current.student.firstName}<small>Échéance {current.rank}/{current.count} du {formatDateFr(current.dueOn)} · {formatEuros(current.amount, true)}{current.state.received ? ` · déjà reçu ${formatEuros(current.state.received, true)}` : ''}</small></div>{!row && <button type="button" className="linkbtn sm" onClick={() => setInstId('')}>Changer</button>}</div>
      ) : (
        <div className="field">
          <label htmlFor="pay-search">Échéance réglée</label>
          <input id="pay-search" className="in" type="search" placeholder="Nom de la famille ou de l’élève" value={q} onChange={(e) => setQ(e.target.value)} />
          <div className="list" style={{ maxHeight: 220, overflow: 'auto', border: '1px solid var(--line)', borderRadius: 8 }}>
            {open.map((i) => <button key={i.id} type="button" className="li linkbtn" style={{ textDecoration: 'none', color: 'inherit', textAlign: 'left', width: '100%' }} onClick={() => choose(i.id)}><span className="grow">Famille {i.family.familyName} · {i.student.firstName} · {i.rank}/{i.count}<span className="muted sm" style={{ display: 'block' }}>{formatDateFr(i.dueOn)} · {STATUS_LABELS[i.state.status]}</span></span><b className="tnum">{formatEuros(i.amount, true)}</b></button>)}
          </div>
          {errors.inst && <span className="err" role="alert">{errors.inst}</span>}
        </div>
      )}
      <div className="form">
        <Field label="Mode de règlement">{(p) => <select {...p} className="in" value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>{(Object.keys(METHOD_LABELS) as PaymentMethod[]).map((m) => <option key={m} value={m}>{METHOD_LABELS[m]}</option>)}</select>}</Field>
        <Field label="Montant (€)" error={errors.amount}>{(p) => <input {...p} className="in tnum" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />}</Field>
        {method !== 'especes' && <Field label={method === 'cheque' ? 'Numéro du chèque' : method === 'virement' ? 'Référence du virement' : 'Référence du lot'} error={errors.reference}>{(p) => <input {...p} className="in" value={reference} onChange={(e) => setReference(e.target.value)} />}</Field>}
        {(method === 'cheque' || method === 'virement') && <Field label="Banque">{(p) => <input {...p} className="in" value={bank} onChange={(e) => setBank(e.target.value)} />}</Field>}
        <Field label="Reçu le" error={errors.receivedOn}>{(p) => <input {...p} className="in" type="date" max={today} value={receivedOn} onChange={(e) => setReceivedOn(e.target.value)} />}</Field>
      </div>
      <p className="xs muted" style={{ margin: 0 }}>{method === 'virement' ? 'Un virement est encaissé à sa réception : la recette est créée tout de suite en comptabilité.' : 'La pièce passe « à remettre » ; la recette est créée quand le bordereau est marqué comme déposé.'}</p>
    </Modal>
  );
}
