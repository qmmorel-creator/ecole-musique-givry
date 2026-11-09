import { useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ApiError, dataSource, type LedgerEntryInput } from '../../data/index.ts';
import {
  computeBilan, exerciseFor, formatDateFr, formatEuros, METHOD_LABELS, normalizeName, type EventKind, type LedgerEntry, type LedgerKind, type PaymentMethod, type SchoolEvent,
} from '../../domain/index.ts';
import { Field, Kpi, Modal } from '../../components/ui.tsx';
import { useStore } from '../../store.tsx';
import { downloadBlob } from '../../lib/download.ts';
import { exportXlsx } from '../../lib/xlsx.ts';
import { PageTop } from './BureauApp.tsx';

const EVENT_KINDS: Record<EventKind, string> = { audition: 'Audition', concert: 'Concert', stage: 'Stage', autre: 'Autre' };

export default function ComptabilitePage() {
  const { snap, today, run } = useStore();
  const s = snap!;
  const [params] = useSearchParams();
  const { exerciseStartMonth: m, exerciseStartDay: dd } = s.settings;
  const exercises = useMemo(() => {
    const labels = new Map<string, ReturnType<typeof exerciseFor>>();
    for (const e of [...s.entries.map((x) => x.date), today]) { const ex = exerciseFor(e, m, dd); labels.set(ex.label, ex); }
    return [...labels.values()].sort((a, b) => b.start.localeCompare(a.start));
  }, [s.entries, today, m, dd]);
  const [exLabel, setExLabel] = useState(exerciseFor(today, m, dd).label);
  const exercise = exercises.find((x) => x.label === exLabel) ?? exercises[0];
  const bilan = useMemo(() => computeBilan(s.entries, s.categories, s.events, exercise), [s.entries, s.categories, s.events, exercise]);
  const inscriptions = bilan.recettes.filter((r) => r.auto).reduce((a, r) => a + r.amount, 0);
  const [editing, setEditing] = useState<LedgerEntry | null>(null);
  const [eventEdit, setEventEdit] = useState<Partial<SchoolEvent> | null>(null);
  const [kindFilter, setKindFilter] = useState<'' | LedgerKind>('');
  const [catFilter, setCatFilter] = useState('');
  const [q, setQ] = useState('');
  const [attOnly, setAttOnly] = useState(false);
  const school = { name: s.settings.schoolName, address: s.settings.schoolAddress, email: s.settings.schoolEmail };
  const catLabel = (id: string) => s.categories.find((c) => c.id === id)?.label ?? '—';
  const evName = (id: string | null) => (id ? s.events.find((e) => e.id === id)?.name ?? '' : '');

  const entries = s.entries
    .filter((e) => e.date >= exercise.start && e.date <= exercise.end)
    .filter((e) => !kindFilter || e.kind === kindFilter)
    .filter((e) => !catFilter || e.categoryId === catFilter)
    .filter((e) => !attOnly || (e.kind === 'depense' && !e.attachmentId))
    .filter((e) => !q || normalizeName(e.label + evName(e.eventId)).includes(normalizeName(q)))
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));

  const pdf = async () => {
    const { bilanPdf } = await import('../../lib/pdf.ts');
    downloadBlob(bilanPdf(school, bilan, today), `bilan-${exercise.label}.pdf`);
  };
  const exportCa = () => exportXlsx([
    { name: 'Bilan', columns: ['Section', 'Catégorie', 'Montant'], rows: [
      ...bilan.recettes.map((r) => ['Recettes', r.label, r.amount]), ['Recettes', 'Total des recettes', bilan.totalRecettes],
      ...bilan.depenses.map((r) => ['Dépenses', r.label, r.amount]), ['Dépenses', 'Total des dépenses', bilan.totalDepenses],
      ['Résultat', 'Résultat de l’exercice', bilan.resultat],
    ] },
    { name: 'Événements', columns: ['Événement', 'Date', 'Recettes', 'Dépenses', 'Résultat'], rows: bilan.events.map((e) => [e.name, formatDateFr(e.date), e.recettes, e.depenses, e.result]) },
    { name: 'Opérations', columns: ['Date', 'Type', 'Catégorie', 'Libellé', 'Événement', 'Mode', 'Montant', 'Origine', 'Justificatif'], rows: s.entries.filter((e) => e.date >= exercise.start && e.date <= exercise.end).sort((a, b) => a.date.localeCompare(b.date)).map((e) => [formatDateFr(e.date), e.kind, catLabel(e.categoryId), e.label, evName(e.eventId), e.method ? METHOD_LABELS[e.method] : '', e.amount, e.source === 'auto' ? 'automatique' : 'saisie', e.attachmentId ? s.attachments.find((a) => a.id === e.attachmentId)?.filename ?? 'oui' : '']) },
  ], `comptes-${exercise.label}.xlsx`);
  const openAtt = async (id: string) => {
    const url = await dataSource.staffApi.attachmentUrl(id);
    const att = s.attachments.find((a) => a.id === id);
    const blob = await (await fetch(url)).blob();
    downloadBlob(blob, att?.filename ?? 'justificatif');
  };

  return (
    <>
      <PageTop
        title="Comptabilité de l’association"
        sub={`Exercice du ${formatDateFr(exercise.start)} au ${formatDateFr(exercise.end)} · comptabilité de trésorerie`}
        acts={<>
          <label><span className="sr-only">Exercice</span><select className="in" style={{ width: 'auto' }} value={exercise.label} onChange={(e) => setExLabel(e.target.value)}>{exercises.map((x) => <option key={x.label} value={x.label}>Exercice {x.label}</option>)}</select></label>
          <button type="button" className="btn" onClick={exportCa}>Exporter pour le CA</button>
          <button type="button" className="btn pri" onClick={pdf}>Générer le bilan PDF</button>
        </>}
      />
      <main className="content" id="contenu">
        <div className="kpis">
          <Kpi label="Recettes de l’exercice" value={formatEuros(Math.round(bilan.totalRecettes))} detail={`dont ${formatEuros(Math.round(inscriptions))} d’inscriptions encaissées`} />
          <Kpi label="Dépenses de l’exercice" value={formatEuros(Math.round(bilan.totalDepenses))} detail={`${bilan.entryCount} opérations sur l’exercice`} />
          <Kpi label="Résultat à date" value={<span className={bilan.resultat >= 0 ? 'pos' : 'neg'}>{bilan.resultat >= 0 ? '+ ' : '− '}{formatEuros(Math.round(Math.abs(bilan.resultat)))}</span>} detail={today < exercise.end ? `au ${formatDateFr(today)}` : 'exercice clos'} />
          <Kpi label="Justificatifs manquants" value={bilan.missingAttachments} detail={<button type="button" className="linkbtn sm" onClick={() => setAttOnly(true)}>dépenses sans pièce jointe</button>} alert={bilan.missingAttachments > 0} />
        </div>
        <div className="grid2e">
          <CategoryTable title="Recettes par catégorie" hint="les inscriptions encaissées arrivent seules" rows={bilan.recettes} total={bilan.totalRecettes} totalLabel="Total des recettes" />
          <CategoryTable title="Dépenses par catégorie" rows={bilan.depenses} total={bilan.totalDepenses} totalLabel="Total des dépenses" />
        </div>
        <div className="grid2e">
          <section className="card" aria-labelledby="ev-h">
            <header><h2 id="ev-h">Résultat par événement</h2><span className="sp" /><button type="button" className="btn sm" onClick={() => setEventEdit({ kind: 'concert', date: today, budget: 0, name: '', place: '' })}>+ Événement</button></header>
            {bilan.events.length === 0 && <div className="empty">Aucun événement sur l’exercice.</div>}
            {bilan.events.map((e) => {
              const ev = s.events.find((x) => x.id === e.eventId)!;
              return (
                <div className="ev" key={e.eventId}>
                  <b><button type="button" className="linkbtn" style={{ textDecoration: 'none', color: 'inherit' }} onClick={() => setEventEdit(ev)}>{e.name}</button></b>
                  <span className={`r tnum ${e.result >= 0 ? 'pos' : 'neg'}`}>{e.result >= 0 ? '+ ' : '− '}{formatEuros(Math.abs(e.result))}</span>
                  <span className="muted sm">{formatDateFr(e.date)}{e.date > today ? ' · à venir' : ''} · budget prévu {formatEuros(ev?.budget ?? 0)}</span>
                  <span className="muted sm tnum" style={{ textAlign: 'right' }}>recettes {formatEuros(e.recettes)} · dépenses {formatEuros(e.depenses)}</span>
                </div>
              );
            })}
          </section>
          <EntryForm key={editing?.id ?? 'new'} initial={editing} initialKind={params.get('saisie') === 'recette' ? 'recette' : 'depense'} onDone={() => setEditing(null)} />
        </div>
        <section className="card" aria-labelledby="ops-h">
          <header><h2 id="ops-h">Opérations de l’exercice</h2><span className="sp" /><span className="muted sm">{entries.length}</span></header>
          <header className="filters">
            <label className="search"><span className="sr-only">Rechercher une opération</span><input className="in" type="search" placeholder="Rechercher un libellé, un événement…" value={q} onChange={(e) => setQ(e.target.value)} /></label>
            <label><span className="sr-only">Type</span><select className="in" style={{ width: 'auto' }} value={kindFilter} onChange={(e) => { setKindFilter(e.target.value as LedgerKind | ''); setCatFilter(''); }}><option value="">Recettes et dépenses</option><option value="recette">Recettes</option><option value="depense">Dépenses</option></select></label>
            <label><span className="sr-only">Catégorie</span><select className="in" style={{ width: 'auto', maxWidth: '100%' }} value={catFilter} onChange={(e) => setCatFilter(e.target.value)}><option value="">Toutes les catégories</option>{s.categories.filter((c) => !kindFilter || c.kind === kindFilter).map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</select></label>
            <label className="checkline sm"><input type="checkbox" checked={attOnly} onChange={(e) => setAttOnly(e.target.checked)} />Sans justificatif</label>
          </header>
          <div className="tw"><table className="t">
            <thead><tr><th>Date</th><th>Libellé</th><th>Catégorie</th><th className="r">Montant</th><th>Justificatif</th><th><span className="sr-only">Actions</span></th></tr></thead>
            <tbody>{entries.slice(0, 300).map((e) => (
              <tr key={e.id}>
                <td className="tnum sm">{formatDateFr(e.date)}</td>
                <td className="sm">{e.label}{e.source === 'auto' && <span className="tag-auto">auto</span>}{e.eventId && <div className="muted xs">{evName(e.eventId)}</div>}</td>
                <td className="sm">{catLabel(e.categoryId)}</td>
                <td className={`r tnum ${e.kind === 'recette' ? 'pos' : ''}`}><b>{e.kind === 'recette' ? '+ ' : '− '}{formatEuros(e.amount, true)}</b></td>
                <td className="sm">{e.attachmentId ? <button type="button" className="linkbtn" onClick={() => openAtt(e.attachmentId!)}>{s.attachments.find((a) => a.id === e.attachmentId)?.filename ?? 'pièce'}</button> : e.kind === 'depense' ? <span className="neg">manquant</span> : <span className="muted">—</span>}</td>
                <td>{e.source === 'manuel' && <div className="filters" style={{ flexWrap: 'nowrap' }}><button type="button" className="btn sm" onClick={() => { setEditing(e); window.scrollTo({ top: 0 }); }}>Modifier</button><button type="button" className="btn danger sm" onClick={() => { if (confirm(`Supprimer « ${e.label} » ?`)) void run(() => dataSource.staffApi.deleteLedgerEntry(e.id), 'Opération supprimée.'); }}>Supprimer</button></div>}</td>
              </tr>
            ))}</tbody>
          </table>{entries.length === 0 && <div className="empty">Aucune opération.</div>}</div>
          <div className="foot muted xs">Comptabilité de trésorerie : recettes encaissées et dépenses payées. L’outil ne remplace pas un expert-comptable et ne produit ni comptabilité d’engagement ni liasse fiscale.</div>
        </section>
      </main>
      {eventEdit && <EventModal initial={eventEdit} onClose={() => setEventEdit(null)} />}
    </>
  );
}

function CategoryTable({ title, hint, rows, total, totalLabel }: { title: string; hint?: string; rows: { categoryId: string; label: string; amount: number; auto: boolean }[]; total: number; totalLabel: string }) {
  return (
    <section className="card">
      <header><h2>{title}</h2><span className="sp" />{hint && <span className="muted sm">{hint}</span>}</header>
      <div className="tw"><table className="t"><thead><tr><th>Catégorie</th><th className="r">Montant</th></tr></thead><tbody>
        {rows.filter((r) => r.amount !== 0).map((r) => <tr key={r.categoryId}><td>{r.label}{r.auto && <span className="tag-auto">auto</span>}</td><td className="r tnum">{formatEuros(r.amount, true)}</td></tr>)}
        <tr className="tot"><td>{totalLabel}</td><td className="r tnum">{formatEuros(total, true)}</td></tr>
      </tbody></table></div>
    </section>
  );
}

function EntryForm({ initial, initialKind, onDone }: { initial: LedgerEntry | null; initialKind: LedgerKind; onDone: () => void }) {
  const { snap, run, today } = useStore();
  const s = snap!;
  const [kind, setKind] = useState<LedgerKind>(initial?.kind ?? initialKind);
  const [f, setF] = useState({ categoryId: initial?.categoryId ?? '', eventId: initial?.eventId ?? '', amount: initial ? String(initial.amount).replace('.', ',') : '', date: initial?.date ?? today, label: initial?.label ?? '', method: (initial?.method ?? 'virement') as PaymentMethod, attachmentId: initial?.attachmentId ?? null as string | null });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const cats = s.categories.filter((c) => c.kind === kind && !c.system && (!c.archived || c.id === f.categoryId));
  const att = f.attachmentId ? s.attachments.find((a) => a.id === f.attachmentId) : null;
  const upload = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    try {
      const a = await dataSource.staffApi.uploadAttachment(file);
      await run(async () => {}, `Justificatif « ${a.filename} » joint.`);
      setF((x) => ({ ...x, attachmentId: a.id }));
    } catch (e) { setErrors({ attachment: e instanceof Error ? e.message : 'Erreur' }); } finally { setUploading(false); if (fileRef.current) fileRef.current.value = ''; }
  };
  const save = async () => {
    const input: LedgerEntryInput = { id: initial?.id, kind, categoryId: f.categoryId, eventId: f.eventId || null, amount: Number(f.amount.replace(',', '.').replace(/\s/g, '')), date: f.date, label: f.label, method: f.method, attachmentId: f.attachmentId };
    let fieldErrs: Record<string, string> = {};
    const ok = await run(async () => { try { await dataSource.staffApi.saveLedgerEntry(input); } catch (e) { if (e instanceof ApiError && e.fieldErrors) fieldErrs = e.fieldErrors; throw e; } }, initial ? 'Opération modifiée.' : kind === 'depense' ? 'Dépense enregistrée.' : 'Recette enregistrée.');
    setErrors(fieldErrs);
    if (ok) { setF({ categoryId: '', eventId: '', amount: '', date: today, label: '', method: 'virement', attachmentId: null }); onDone(); }
  };
  return (
    <section className="card" aria-labelledby="saisie-h">
      <header><h2 id="saisie-h">{initial ? 'Modifier l’opération' : 'Saisir une opération'}</h2><span className="sp" />
        <div className="seg" role="group" aria-label="Type d’opération"><button type="button" aria-pressed={kind === 'depense'} onClick={() => { setKind('depense'); setF({ ...f, categoryId: '' }); }}>Dépense</button><button type="button" aria-pressed={kind === 'recette'} onClick={() => { setKind('recette'); setF({ ...f, categoryId: '' }); }}>Recette</button></div>
      </header>
      <div className="body"><div className="form">
        <Field label="Catégorie" error={errors.categoryId}>{(p) => <select {...p} className="in" value={f.categoryId} onChange={(e) => setF({ ...f, categoryId: e.target.value })}><option value="">Choisir…</option>{cats.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</select>}</Field>
        <Field label="Événement (facultatif)">{(p) => <select {...p} className="in" value={f.eventId} onChange={(e) => setF({ ...f, eventId: e.target.value })}><option value="">Aucun</option>{[...s.events].sort((a, b) => b.date.localeCompare(a.date)).map((ev) => <option key={ev.id} value={ev.id}>{ev.name}</option>)}</select>}</Field>
        <Field label="Montant (€)" error={errors.amount}>{(p) => <input {...p} className="in tnum" inputMode="decimal" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} />}</Field>
        <Field label="Date" error={errors.date}>{(p) => <input {...p} className="in" type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} />}</Field>
        <Field label="Libellé" full error={errors.label}>{(p) => <input {...p} className="in" value={f.label} onChange={(e) => setF({ ...f, label: e.target.value })} />}</Field>
        <Field label="Mode de paiement">{(p) => <select {...p} className="in" value={f.method} onChange={(e) => setF({ ...f, method: e.target.value as PaymentMethod })}>{(Object.keys(METHOD_LABELS) as PaymentMethod[]).map((m) => <option key={m} value={m}>{METHOD_LABELS[m]}</option>)}</select>}</Field>
        <div className="field">
          <label htmlFor="justif">Justificatif (PDF, JPEG, PNG)</label>
          <input id="justif" ref={fileRef} className="in" type="file" accept="application/pdf,image/jpeg,image/png" onChange={(e) => upload(e.target.files?.[0])} disabled={uploading} />
          {errors.attachment && <span className="err" role="alert">{errors.attachment}</span>}
        </div>
        <div className="full drop">{att ? <>Justificatif joint : {att.filename} ✓ <button type="button" className="linkbtn sm" onClick={() => setF({ ...f, attachmentId: null })}>retirer</button></> : uploading ? 'Envoi du justificatif…' : 'Aucun justificatif joint. Stockage privé, accessible au bureau seulement.'}</div>
        <div className="full filters" style={{ justifyContent: 'flex-end' }}>
          {initial && <button type="button" className="btn" onClick={onDone}>Annuler</button>}
          <button type="button" className="btn pri" onClick={save}>{initial ? 'Enregistrer les modifications' : kind === 'depense' ? 'Enregistrer la dépense' : 'Enregistrer la recette'}</button>
        </div>
      </div></div>
    </section>
  );
}

function EventModal({ initial, onClose }: { initial: Partial<SchoolEvent>; onClose: () => void }) {
  const { snap, run } = useStore();
  const season = snap!.seasons.find((x) => x.isCurrent) ?? snap!.seasons[0];
  const [e, setE] = useState({ name: initial.name ?? '', date: initial.date ?? '', kind: initial.kind ?? 'concert' as EventKind, place: initial.place ?? '', budget: String(initial.budget ?? 0) });
  const save = async () => {
    const seasonId = initial.seasonId ?? (snap!.seasons.find((x) => e.date >= x.startsOn && e.date <= x.endsOn)?.id ?? season.id);
    if (await run(() => dataSource.staffApi.saveEvent({ id: initial.id, seasonId, name: e.name, date: e.date, kind: e.kind, place: e.place, budget: Number(e.budget.replace(',', '.')) || 0 }), 'Événement enregistré.')) onClose();
  };
  return (
    <Modal title={initial.id ? 'Modifier l’événement' : 'Nouvel événement'} onClose={onClose} footer={<><button type="button" className="btn" onClick={onClose}>Annuler</button><button type="button" className="btn pri" onClick={save}>Enregistrer</button></>}>
      <div className="form">
        <Field label="Nom" full>{(p) => <input {...p} className="in" value={e.name} onChange={(x) => setE({ ...e, name: x.target.value })} />}</Field>
        <Field label="Date">{(p) => <input {...p} className="in" type="date" value={e.date} onChange={(x) => setE({ ...e, date: x.target.value })} />}</Field>
        <Field label="Type">{(p) => <select {...p} className="in" value={e.kind} onChange={(x) => setE({ ...e, kind: x.target.value as EventKind })}>{(Object.keys(EVENT_KINDS) as EventKind[]).map((k) => <option key={k} value={k}>{EVENT_KINDS[k]}</option>)}</select>}</Field>
        <Field label="Lieu">{(p) => <input {...p} className="in" value={e.place} onChange={(x) => setE({ ...e, place: x.target.value })} />}</Field>
        <Field label="Budget prévu (€)">{(p) => <input {...p} className="in" inputMode="decimal" value={e.budget} onChange={(x) => setE({ ...e, budget: x.target.value })} />}</Field>
      </div>
    </Modal>
  );
}
