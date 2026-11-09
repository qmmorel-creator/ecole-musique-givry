import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ApiError, dataSource, isDemo, type PublicCatalog, type ReinscriptionData, type SubmitResult } from '../../data/index.ts';
import { formatDateFr, formatEuros, METHOD_LABELS, type PaymentMethod, type Plan } from '../../domain/index.ts';
import { Field, Loading } from '../../components/ui.tsx';
import { FamilyHeader, PriceTable, PrivacyNotice, YesNo } from './Inscription.tsx';
import { DemoMailNotice } from './DemoMailNotice.tsx';

interface Choice { selected: boolean; courseId: string; level: string; slot: string }

export function ReinscriptionPage() {
  const { token = '' } = useParams();
  const [data, setData] = useState<ReinscriptionData | null | undefined>(undefined);
  const [catalog, setCatalog] = useState<PublicCatalog | null>(null);
  const [choices, setChoices] = useState<Record<string, Choice>>({});
  const [plan, setPlan] = useState<Plan>(3);
  const [method, setMethod] = useState<PaymentMethod>('cheque');
  const [imageRights, setImageRights] = useState<boolean | null>(null);
  const [rulesAccepted, setRulesAccepted] = useState(false);
  const [privacyAck, setPrivacyAck] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<SubmitResult[] | null>(null);

  useEffect(() => {
    Promise.all([dataSource.publicApi.getReinscription(token), dataSource.publicApi.getCatalog()])
      .then(([d, c]) => {
        setData(d);
        setCatalog(c);
        if (d) {
          const init: Record<string, Choice> = {};
          for (const s of d.students) {
            const course = c.courses.find((x) => x.id === s.previousCourseId);
            const idx = course ? course.levels.indexOf(s.previousLevel) : -1;
            const nextLevel = course && idx >= 0 && idx < 5 ? course.levels[idx + 1] : course?.levels.includes(s.previousLevel) ? s.previousLevel : '';
            init[s.studentId] = { selected: true, courseId: course?.id ?? '', level: nextLevel ?? '', slot: course?.slots[0] ?? '' };
          }
          setChoices(init);
        }
      })
      .catch((e) => { setError(e instanceof Error ? e.message : 'Erreur'); setData(null); });
  }, [token]);

  if (data === undefined) return <div className="fam"><FamilyHeader title="Réinscription" /><Loading /></div>;
  if (data === null || !catalog) return <div className="fam"><FamilyHeader title="Réinscription" /><main className="fb"><div className="fc"><p style={{ margin: 0 }}>{error || 'Ce lien de réinscription est invalide ou a expiré.'}</p><Link className="cta" to="/inscription">Faire une nouvelle inscription</Link></div></main></div>;

  const submit = async () => {
    setError('');
    const selected = Object.entries(choices).filter(([, c]) => c.selected);
    if (!selected.length) return setError('Choisissez au moins un élève à réinscrire.');
    if (selected.some(([, c]) => !c.courseId || !c.level || !c.slot)) return setError('Choisissez le cours, le niveau et le créneau de chaque élève.');
    if (imageRights === null) return setError('Répondez à la question sur le droit à l’image.');
    if (!rulesAccepted || !privacyAck) return setError('Merci d’accepter le règlement intérieur et de confirmer la lecture des informations sur vos données.');
    setBusy(true);
    try {
      setResults(await dataSource.publicApi.submitReinscription(token, { choices: selected.map(([studentId, c]) => ({ studentId, courseId: c.courseId, level: c.level, slot: c.slot })), plan, intendedMethod: method, imageRights, rulesAccepted, privacyAck }));
    } catch (e) {
      setError(e instanceof ApiError && e.fieldErrors ? Object.values(e.fieldErrors).join(' ') : e instanceof Error ? e.message : 'Erreur');
    } finally { setBusy(false); }
  };

  if (results) {
    return (
      <div className="fam">
        <FamilyHeader title="Réinscription envoyée" season={data.season.label} />
        <main className="fb" id="contenu">
          {results.map((r, i) => {
            const st = data.students.find((s) => s.studentId === Object.entries(choices).filter(([, c]) => c.selected)[i]?.[0]);
            return (
              <div className="fc" key={r.reference} data-testid="confirmation">
                <h2><span className="n done" aria-hidden="true">✓</span>{st?.firstName} · {r.outcome === 'liste_attente' ? 'liste d’attente' : 'dossier envoyé'}</h2>
                <p className="sm" style={{ margin: 0 }}>Référence <b>{r.reference}</b>.</p>
                {r.outcome === 'inscription' && <><PriceTable lines={r.pricing.lines} total={r.pricing.total} /><div className="prix">{r.installments.map((x) => <div key={x.rank}><span>Échéance {x.rank}/{x.count} · {formatDateFr(x.dueOn)}</span><span className="tnum">{formatEuros(x.amount, true)}</span></div>)}</div></>}
              </div>
            );
          })}
          {isDemo && <DemoMailNotice to={data.guardianEmail} />}
          <Link to="/" className="cta ghost">Terminer</Link>
        </main>
      </div>
    );
  }

  return (
    <div className="fam">
      <FamilyHeader title={`Réinscription ${data.season.label}`} season={data.season.label} />
      <main className="fb" id="contenu">
        <div className="fc"><h2>Bonjour {data.guardianFirstName}</h2><p className="sm" style={{ margin: 0 }}>Famille {data.familyName} · {data.commune}. Vos coordonnées sont déjà connues de l’école ; signalez tout changement au bureau.</p></div>
        {data.students.length === 0 && <div className="fc"><p style={{ margin: 0 }}>Tous les élèves de la famille sont déjà inscrits pour cette saison.</p></div>}
        {data.students.map((s) => {
          const c = choices[s.studentId];
          const course = catalog.courses.find((x) => x.id === c?.courseId);
          const set = (patch: Partial<Choice>) => setChoices({ ...choices, [s.studentId]: { ...c, ...patch } });
          return (
            <div className="fc" key={s.studentId}>
              <label className="checkline"><input type="checkbox" checked={c?.selected ?? false} onChange={(e) => set({ selected: e.target.checked })} /><span><b>{s.firstName}</b> · l’an dernier : {s.previousDiscipline}, {s.previousLevel}</span></label>
              {c?.selected && (
                <div className="form">
                  <Field label="Cours" full>{(p) => <select {...p} className="in" value={c.courseId} onChange={(e) => { const nc = catalog.courses.find((x) => x.id === e.target.value); set({ courseId: e.target.value, level: '', slot: nc?.slots[0] ?? '' }); }}><option value="">Choisir…</option>{catalog.courses.map((x) => <option key={x.id} value={x.id}>{x.discipline}{x.remaining <= 0 ? ' (liste d’attente)' : ` (${x.remaining} place${x.remaining > 1 ? 's' : ''})`}</option>)}</select>}</Field>
                  <Field label="Niveau">{(p) => <select {...p} className="in" value={c.level} onChange={(e) => set({ level: e.target.value })}><option value="">Choisir…</option>{course?.levels.map((l) => <option key={l}>{l}</option>)}</select>}</Field>
                  <Field label="Créneau">{(p) => <select {...p} className="in" value={c.slot} onChange={(e) => set({ slot: e.target.value })}><option value="">Choisir…</option>{course?.slots.map((l) => <option key={l}>{l}</option>)}</select>}</Field>
                </div>
              )}
            </div>
          );
        })}
        {data.students.length > 0 && (
          <div className="fc">
            <h2>Règlement et autorisations</h2>
            <div className="field" role="group" aria-label="Règlement en 1 ou 3 fois"><span>Règlement</span><div className="yn"><button type="button" aria-pressed={plan === 1} onClick={() => setPlan(1)}>En 1 fois</button><button type="button" aria-pressed={plan === 3} onClick={() => setPlan(3)}>En 3 fois</button></div></div>
            <Field label="Mode de règlement prévu">{(p) => <select {...p} className="in" value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>{(Object.keys(METHOD_LABELS) as PaymentMethod[]).map((m) => <option key={m} value={m}>{METHOD_LABELS[m]}</option>)}</select>}</Field>
            <YesNo label="Droit à l’image pour cette saison" value={imageRights} onChange={setImageRights} yes="J’autorise" no="Je n’autorise pas" />
            <label className="checkline"><input type="checkbox" checked={rulesAccepted} onChange={(e) => setRulesAccepted(e.target.checked)} />J’ai pris connaissance du règlement intérieur et je l’accepte.</label>
            <PrivacyNotice catalog={catalog} />
            <label className="checkline"><input type="checkbox" checked={privacyAck} onChange={(e) => setPrivacyAck(e.target.checked)} />J’ai lu les informations sur l’utilisation de mes données.</label>
            {error && <div className="note late" role="alert">{error}</div>}
            <button type="button" className="cta" onClick={submit} disabled={busy}>{busy ? 'Envoi…' : 'Envoyer la réinscription'}</button>
            <p className="xs muted" style={{ margin: 0 }}>Le tarif exact, fratrie comprise, s’affiche après l’envoi et vous est confirmé par mail.</p>
          </div>
        )}
      </main>
    </div>
  );
}
