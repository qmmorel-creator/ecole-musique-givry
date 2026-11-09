import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ApiError, dataSource, isDemo, type PublicCatalog, type PublicCourse, type SubmitResult } from '../../data/index.ts';
import {
  computePrice, formatDateFr, formatEuros, METHOD_LABELS, planInstallments, publicFor, residenceFor, todayIso, validateCourse,
  validateGuardian, validateSibling, validateStudent, type Errors, type InscriptionInput, type PaymentMethod, type Plan,
} from '../../domain/index.ts';
import { Field, Loading, NoteMark } from '../../components/ui.tsx';
import { DemoMailNotice } from './DemoMailNotice.tsx';

const emptyGuardian: InscriptionInput['guardian'] = { firstName: '', lastName: '', email: '', phone: '', relation: 'Mère', address: '', postalCode: '', commune: '' };
const RELATIONS = ['Mère', 'Père', 'Tutrice', 'Tuteur', 'Élève majeur', 'Autre'];

type SiblingState = 'idle' | 'searching' | 'found' | 'not_found';

export function FamilyHeader({ title, step, of = 3, stepLabel, season }: { title: string; step?: number; of?: number; stepLabel?: string; season?: string }) {
  return (
    <header className="fh">
      <Link to="/" className="brand"><NoteMark size={30} /><span>École de Musique de Givry<small>Inscription en ligne{season ? ` · saison ${season}` : ''}</small></span></Link>
      <h1>{title}</h1>
      {step != null && (
        <>
          <div className="stp">Étape {step} sur {of} · {stepLabel}</div>
          <div className="prog" aria-hidden="true">{Array.from({ length: of }, (_, i) => <span key={i} className={i < step ? 'on' : ''} />)}</div>
        </>
      )}
    </header>
  );
}

export function PrivacyNotice({ catalog }: { catalog: PublicCatalog }) {
  return (
    <details className="legal">
      <summary>Informations sur vos données personnelles</summary>
      <p>Les informations recueillies servent uniquement à gérer l’inscription, les cours, les règlements et la vie de l’association {catalog.settings.schoolName}. Elles sont réservées aux membres du bureau, hébergées dans l’Union européenne et ne sont jamais vendues ni cédées.</p>
      <p>Aucune donnée de santé n’est demandée. Les données sont conservées {catalog.settings.retentionYears} ans après la dernière saison de l’élève, puis supprimées. Vous pouvez y accéder, les faire rectifier ou effacer en écrivant à {catalog.settings.schoolEmail}. Détails : <Link to="/donnees-personnelles">page Données personnelles</Link>.</p>
    </details>
  );
}

export function PriceTable({ lines, total, estimate }: { lines: { label: string; amount: number; note?: string; kind: string }[]; total: number; estimate?: boolean }) {
  return (
    <div className="prix">
      {lines.map((l) => (
        <div key={l.label}>
          <span>{l.label}</span>
          <span className={`tnum${l.kind === 'reduction' ? ' red' : ''}${l.note ? ' muted' : ''}`}>{l.note ?? (l.kind === 'reduction' ? `− ${formatEuros(-l.amount, true)}` : formatEuros(l.amount, true))}</span>
        </div>
      ))}
      <div className="tt"><span>{estimate ? 'Total estimé' : 'Total'}</span><span className="tnum">{formatEuros(total, true)}</span></div>
    </div>
  );
}

export function CourseGrid({ courses, value, onChange, error }: { courses: PublicCourse[]; value: string; onChange: (id: string) => void; error?: string }) {
  return (
    <div role="group" aria-label="Instrument ou discipline" aria-describedby={error ? 'course-err' : undefined}>
      <div className="igrid">
        {courses.map((c) => (
          <button key={c.id} type="button" aria-pressed={value === c.id} className={c.remaining <= 0 ? 'full' : ''} onClick={() => onChange(c.id)}>
            <i style={{ background: c.color }} aria-hidden="true">{c.abbr}</i>
            {c.discipline}
            <span className="pl">{c.remaining <= 0 ? 'liste d’attente' : `${c.remaining} place${c.remaining > 1 ? 's' : ''}`}</span>
          </button>
        ))}
      </div>
      {error && <p className="err field" id="course-err" role="alert">{error}</p>}
    </div>
  );
}

export function YesNo({ label, value, onChange, yes = 'Oui', no = 'Non', error }: { label: string; value: boolean | null; onChange: (v: boolean) => void; yes?: string; no?: string; error?: string }) {
  return (
    <div role="group" aria-label={label} className="field">
      <span>{label}</span>
      <div className="yn">
        <button type="button" aria-pressed={value === true} onClick={() => onChange(true)}>{yes}</button>
        <button type="button" aria-pressed={value === false} onClick={() => onChange(false)}>{no}</button>
      </div>
      {error && <span className="err" role="alert">{error}</span>}
    </div>
  );
}

function focusFirstError() {
  setTimeout(() => document.querySelector<HTMLElement>('[aria-invalid="true"], .err')?.closest('.field')?.querySelector<HTMLElement>('input, select, button')?.focus(), 30);
}

export function InscriptionPage() {
  const [catalog, setCatalog] = useState<PublicCatalog | null>(null);
  const [loadError, setLoadError] = useState('');
  const [step, setStep] = useState(1);
  const [guardian, setGuardian] = useState(emptyGuardian);
  const [siblingDeclared, setSiblingDeclared] = useState<boolean | null>(null);
  const [sibling, setSibling] = useState({ familyName: '', postalCode: '', email: '' });
  const [siblingState, setSiblingState] = useState<SiblingState>('idle');
  const [student, setStudent] = useState({ firstName: '', lastName: '', birthDate: '' });
  const [courseId, setCourseId] = useState('');
  const [level, setLevel] = useState('');
  const [slot, setSlot] = useState('');
  const [plan, setPlan] = useState<Plan>(3);
  const [method, setMethod] = useState<PaymentMethod>('cheque');
  const [imageRights, setImageRights] = useState<boolean | null>(null);
  const [rulesAccepted, setRulesAccepted] = useState(false);
  const [privacyAck, setPrivacyAck] = useState(false);
  const [website, setWebsite] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<SubmitResult | null>(null);
  const [continuation, setContinuation] = useState<{ token: string; previous: string } | null>(null);
  const [formError, setFormError] = useState('');
  const top = useRef<HTMLDivElement>(null);
  const today = todayIso();

  useEffect(() => {
    dataSource.publicApi.getCatalog().then(setCatalog).catch((e) => setLoadError(e instanceof Error ? e.message : 'Erreur'));
  }, []);
  useEffect(() => { top.current?.scrollIntoView?.({ block: 'start' }); window.scrollTo?.(0, 0); }, [step, result]);

  const course = catalog?.courses.find((c) => c.id === courseId) ?? null;
  const pub = catalog && /^\d{4}-\d{2}-\d{2}$/.test(student.birthDate) ? publicFor(student.birthDate, catalog.season.startsOn, catalog.rules.adultAge) : null;
  const withFm = !!course && course.requiresFm && pub === 'enfant';
  const fmCourse = withFm && catalog ? catalog.fmCourses.find((c) => c.levels.includes(level)) ?? catalog.fmCourses[0] : null;
  const knownFamily = !!continuation || siblingState === 'found';

  const estimate = useMemo(() => {
    if (!catalog || !course || !pub) return null;
    try {
      return computePrice({
        formula: course.formula, public: pub, residence: residenceFor(guardian.commune, catalog.rules),
        siblingRank: knownFamily ? 2 : 1, withFm, adhesionAlreadyCounted: knownFamily,
      }, catalog.grid, catalog.rules);
    } catch { return null; }
  }, [catalog, course, pub, guardian.commune, knownFamily, withFm]);

  if (loadError) return <div className="fam"><FamilyHeader title="Inscription" /><div className="fb"><div className="note late">{loadError}</div></div></div>;
  if (!catalog) return <div className="fam"><FamilyHeader title="Inscription" /><Loading /></div>;
  if (!catalog.season.registrationOpen) return <div className="fam"><FamilyHeader title="Inscriptions fermées" season={catalog.season.label} /><div className="fb"><div className="fc"><p>Les inscriptions en ligne ne sont pas ouvertes pour le moment. Contactez le bureau à {catalog.settings.schoolEmail}.</p></div></div></div>;

  const setG = (k: keyof typeof guardian, v: string) => setGuardian((g) => ({ ...g, [k]: v }));

  const next1 = () => {
    const e = validateGuardian(guardian);
    setErrors(e);
    if (Object.keys(e).length) return focusFirstError();
    if (!sibling.familyName) setSibling({ familyName: guardian.lastName, postalCode: guardian.postalCode, email: guardian.email });
    if (!student.lastName) setStudent((s) => ({ ...s, lastName: guardian.lastName }));
    setStep(2);
  };

  const searchSibling = async () => {
    const e = validateSibling({ declared: true, ...sibling });
    setErrors(e);
    if (Object.keys(e).length) return focusFirstError();
    setSiblingState('searching');
    try {
      const r = await dataSource.publicApi.lookupSibling(sibling);
      setSiblingState(r.found ? 'found' : 'not_found');
    } catch (err) {
      setSiblingState('idle');
      setFormError(err instanceof Error ? err.message : 'Erreur');
    }
  };

  const next2 = () => {
    let e: Errors = { ...validateStudent(student, today) };
    if (!continuation) {
      if (siblingDeclared === null) e.siblingDeclared = 'Répondez à la question.';
      if (siblingDeclared) {
        e = { ...e, ...validateSibling({ declared: true, ...sibling }) };
        if (siblingState === 'idle' || siblingState === 'searching') e.siblingSearch = 'Lancez la recherche de votre famille.';
      }
    }
    setErrors(e);
    if (Object.keys(e).length) return focusFirstError();
    setStep(3);
  };

  const submit = async () => {
    setFormError('');
    const e = validateCourse({ courseId, level, slot, plan, intendedMethod: method, rulesAccepted, privacyAck, imageRights });
    setErrors(e);
    if (Object.keys(e).length) return focusFirstError();
    setBusy(true);
    try {
      const res = await dataSource.publicApi.submitInscription({
        guardian, sibling: { declared: !!siblingDeclared && !continuation, ...sibling }, student, courseId, level, slot, plan, intendedMethod: method,
        imageRights, rulesAccepted, privacyAck, website, continuationToken: continuation?.token,
      });
      setResult(res);
    } catch (err) {
      if (err instanceof ApiError && err.fieldErrors) { setErrors(err.fieldErrors); focusFirstError(); }
      setFormError(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setBusy(false);
    }
  };

  const anotherChild = () => {
    if (!result) return;
    setContinuation({ token: result.continuationToken, previous: student.firstName });
    setResult(null);
    setStudent({ firstName: '', lastName: student.lastName, birthDate: '' });
    setCourseId(''); setLevel(''); setSlot(''); setImageRights(null); setRulesAccepted(false); setPrivacyAck(false); setErrors({});
    setStep(2);
  };

  if (result) {
    const waiting = result.outcome === 'liste_attente';
    return (
      <div className="fam" ref={top}>
        <FamilyHeader title={waiting ? 'Demande enregistrée' : 'Inscription envoyée'} season={catalog.season.label} />
        <main className="fb" id="contenu">
          <div className="fc" data-testid="confirmation">
            <h2><span className="n done" aria-hidden="true">✓</span>{waiting ? `${student.firstName} est sur la liste d’attente` : `Merci, le dossier de ${student.firstName} est envoyé`}</h2>
            <p className="sm">Référence <b className="tnum">{result.reference}</b>. {waiting ? 'Le cours est complet : le bureau vous écrira dès qu’une place se libère, dans l’ordre d’arrivée des demandes.' : 'Le bureau va vérifier et valider le dossier.'} Un mail de confirmation est envoyé à <b>{guardian.email}</b>.</p>
            {result.siblingCheck === 'a_verifier' && <div className="note warn"><span aria-hidden="true">♪</span><span>Le rattachement à votre famille sera vérifié par le bureau. La réduction fratrie, si elle s’applique, sera prise en compte à ce moment-là.</span></div>}
            {!waiting && <>
              <PriceTable lines={result.pricing.lines} total={result.pricing.total} />
              <div className="prix">
                {result.installments.map((i) => <div key={i.rank}><span>Échéance {i.rank}/{i.count} · {formatDateFr(i.dueOn)}</span><span className="tnum">{formatEuros(i.amount, true)}</span></div>)}
              </div>
              <p className="sm muted">Mode de règlement prévu : {METHOD_LABELS[method].toLowerCase()}. Les chèques sont à l’ordre de l’École de Musique de Givry.</p>
            </>}
          </div>
          {isDemo && <DemoMailNotice to={guardian.email} />}
          <button type="button" className="cta" onClick={anotherChild}>Inscrire un autre enfant de la famille</button>
          <Link to="/" className="cta ghost">Terminer</Link>
        </main>
      </div>
    );
  }

  return (
    <div className="fam" ref={top}>
      <FamilyHeader
        title={step === 1 ? 'Inscrire un élève' : step === 2 ? (continuation ? 'Un autre enfant' : 'Famille et élève') : `Le cours de ${student.firstName || 'l’élève'}`}
        step={step} stepLabel={step === 1 ? 'responsable légal' : step === 2 ? 'famille et élève' : 'cours et règlement'} season={catalog.season.label}
      />
      <main className="fb" id="contenu">
        <form onSubmit={(e) => { e.preventDefault(); if (step === 1) next1(); else if (step === 2) next2(); else void submit(); }} noValidate>
          <div className="fb" style={{ padding: 0 }}>
            {/* Champ piège pour les robots : invisible pour les personnes */}
            <div className="hp" aria-hidden="true"><label>Site web<input tabIndex={-1} autoComplete="off" name="website" value={website} onChange={(e) => setWebsite(e.target.value)} /></label></div>

            {step === 1 && (
              <div className="fc">
                <h2><span className="n" aria-hidden="true">1</span>Responsable légal</h2>
                <p className="sm muted" style={{ margin: 0 }}>Pour un élève majeur, indiquez ses propres coordonnées.</p>
                <div className="form">
                  <Field label="Prénom" error={errors['guardian.firstName']}>{(p) => <input {...p} className="in" autoComplete="given-name" value={guardian.firstName} onChange={(e) => setG('firstName', e.target.value)} />}</Field>
                  <Field label="Nom" error={errors['guardian.lastName']}>{(p) => <input {...p} className="in" autoComplete="family-name" value={guardian.lastName} onChange={(e) => setG('lastName', e.target.value)} />}</Field>
                  <Field label="Adresse mail" full error={errors['guardian.email']}>{(p) => <input {...p} className="in" type="email" inputMode="email" autoComplete="email" value={guardian.email} onChange={(e) => setG('email', e.target.value)} />}</Field>
                  <Field label="Téléphone" error={errors['guardian.phone']}>{(p) => <input {...p} className="in" type="tel" inputMode="tel" autoComplete="tel" value={guardian.phone} onChange={(e) => setG('phone', e.target.value)} />}</Field>
                  <Field label="Lien avec l’élève" error={errors['guardian.relation']}>{(p) => <select {...p} className="in" value={guardian.relation} onChange={(e) => setG('relation', e.target.value)}>{RELATIONS.map((r) => <option key={r}>{r}</option>)}</select>}</Field>
                  <Field label="Adresse" full error={errors['guardian.address']}>{(p) => <input {...p} className="in" autoComplete="street-address" value={guardian.address} onChange={(e) => setG('address', e.target.value)} />}</Field>
                  <Field label="Code postal" error={errors['guardian.postalCode']}>{(p) => <input {...p} className="in" inputMode="numeric" autoComplete="postal-code" maxLength={5} value={guardian.postalCode} onChange={(e) => setG('postalCode', e.target.value.replace(/\D/g, ''))} />}</Field>
                  <Field label="Commune" error={errors['guardian.commune']}>{(p) => <input {...p} className="in" autoComplete="address-level2" value={guardian.commune} onChange={(e) => setG('commune', e.target.value)} />}</Field>
                </div>
              </div>
            )}

            {step === 2 && (
              <>
                <div className="fc"><h2><span className="n done" aria-hidden="true">✓</span>Responsable légal</h2><div className="fin"><div>{guardian.firstName} {guardian.lastName.slice(0, 1)}.<small>{guardian.phone} · {guardian.commune}</small></div><button type="button" className="linkbtn sm" onClick={() => setStep(1)}>Modifier</button></div></div>
                {continuation ? (
                  <div className="fc"><h2><span className="n done" aria-hidden="true">✓</span>Même famille</h2><p className="sm" style={{ margin: 0 }}>Ce nouvel élève est rattaché à la même famille que {continuation.previous}.</p></div>
                ) : (
                  <div className="fc">
                    <h2><span className="n" aria-hidden="true">2</span>Un enfant de votre famille est-il déjà inscrit à l’école ?</h2>
                    <YesNo label="Un enfant de votre famille est-il déjà inscrit ?" value={siblingDeclared} onChange={(v) => { setSiblingDeclared(v); setSiblingState('idle'); }} error={errors.siblingDeclared} />
                    {siblingDeclared && (
                      <>
                        <p className="sm muted" style={{ margin: 0 }}>Indiquez les informations connues de l’école. Pour protéger les élèves, la recherche répond seulement « trouvée » ou « non trouvée ».</p>
                        <div className="form">
                          <Field label="Nom de famille" error={errors['sibling.familyName']}>{(p) => <input {...p} className="in" value={sibling.familyName} onChange={(e) => { setSibling({ ...sibling, familyName: e.target.value }); setSiblingState('idle'); }} />}</Field>
                          <Field label="Code postal" error={errors['sibling.postalCode']}>{(p) => <input {...p} className="in" inputMode="numeric" maxLength={5} value={sibling.postalCode} onChange={(e) => { setSibling({ ...sibling, postalCode: e.target.value.replace(/\D/g, '') }); setSiblingState('idle'); }} />}</Field>
                          <Field label="Adresse mail du responsable déjà connue de l’école" full error={errors['sibling.email']}>{(p) => <input {...p} className="in" type="email" inputMode="email" value={sibling.email} onChange={(e) => { setSibling({ ...sibling, email: e.target.value }); setSiblingState('idle'); }} />}</Field>
                        </div>
                        <button type="button" className="btn" onClick={searchSibling} disabled={siblingState === 'searching'}>{siblingState === 'searching' ? 'Recherche…' : 'Rechercher ma famille'}</button>
                        {errors.siblingSearch && <span className="err field" role="alert">{errors.siblingSearch}</span>}
                        <div aria-live="polite">
                          {siblingState === 'found' && <div className="match" data-testid="famille-trouvee"><span className="av" aria-hidden="true">✓</span><div><b>Famille trouvée</b><span className="muted sm">Le dossier sera rattaché à votre famille. La réduction fratrie s’applique selon la grille de l’école.</span></div></div>}
                          {siblingState === 'not_found' && <div className="match no" data-testid="famille-non-trouvee"><span className="av" aria-hidden="true">?</span><div><b>Famille non trouvée</b><span className="muted sm">Vérifiez la saisie ou continuez : le dossier partira avec la mention « rattachement à vérifier » et le bureau validera.</span></div></div>}
                        </div>
                      </>
                    )}
                  </div>
                )}
                <div className="fc">
                  <h2><span className="n" aria-hidden="true">3</span>Élève à inscrire</h2>
                  <div className="form">
                    <Field label="Prénom de l’élève" error={errors['student.firstName']}>{(p) => <input {...p} className="in" value={student.firstName} onChange={(e) => setStudent({ ...student, firstName: e.target.value })} />}</Field>
                    <Field label="Nom de l’élève" error={errors['student.lastName']}>{(p) => <input {...p} className="in" value={student.lastName} onChange={(e) => setStudent({ ...student, lastName: e.target.value })} />}</Field>
                    <Field label="Date de naissance" error={errors['student.birthDate']}>{(p) => <input {...p} className="in" type="date" max={today} value={student.birthDate} onChange={(e) => setStudent({ ...student, birthDate: e.target.value })} />}</Field>
                    <div className="field"><span>Année scolaire</span><div className="fin" style={{ minHeight: 40 }}>{catalog.season.label}</div></div>
                  </div>
                </div>
              </>
            )}

            {step === 3 && (
              <>
                <div className="fc">
                  <h2><span className="n" aria-hidden="true">4</span>Quel instrument ou quelle discipline ?</h2>
                  <CourseGrid courses={catalog.courses} value={courseId} onChange={(id) => { setCourseId(id); setLevel(''); setSlot(''); }} error={errors.courseId} />
                  {course && course.remaining <= 0 && <div className="note warn"><span aria-hidden="true">♪</span><span>{course.discipline} est complet : la demande sera inscrite sur la liste d’attente, dans l’ordre d’arrivée.</span></div>}
                </div>
                <div className="fc">
                  <h2><span className="n" aria-hidden="true">5</span>Niveau et créneau</h2>
                  <div className="form">
                    <Field label="Niveau" error={errors.level}>{(p) => <select {...p} className="in" value={level} onChange={(e) => setLevel(e.target.value)} disabled={!course}><option value="">Choisir…</option>{course?.levels.map((l) => <option key={l}>{l}</option>)}</select>}</Field>
                    <Field label="Créneau souhaité" error={errors.slot}>{(p) => <select {...p} className="in" value={slot} onChange={(e) => setSlot(e.target.value)} disabled={!course}><option value="">Choisir…</option>{course?.slots.map((l) => <option key={l}>{l}</option>)}</select>}</Field>
                  </div>
                  {withFm && <div className="note" data-testid="fm-auto"><span aria-hidden="true">♪</span><span>{fmCourse ? `${fmCourse.discipline} (${fmCourse.slots[0]})` : 'Formation musicale'} ajoutée d’office : elle accompagne l’instrument.</span></div>}
                </div>
                <div className="fc">
                  <h2><span className="n" aria-hidden="true">6</span>Tarif selon la grille {catalog.season.label}</h2>
                  {estimate ? <PriceTable lines={estimate.lines} total={estimate.total} estimate /> : <p className="sm muted" style={{ margin: 0 }}>Choisissez un cours pour voir le tarif.</p>}
                  {estimate && knownFamily && <p className="xs muted" style={{ margin: 0 }}>Estimation pour une famille déjà inscrite cette saison. Le montant exact est confirmé à l’envoi et par mail.</p>}
                  <div className="field" role="group" aria-label="Règlement en 1 ou 3 fois">
                    <span>Règlement</span>
                    <div className="yn">
                      <button type="button" aria-pressed={plan === 1} onClick={() => setPlan(1)}>En 1 fois{estimate ? ` · ${formatEuros(estimate.total, true)}` : ''}</button>
                      <button type="button" aria-pressed={plan === 3} onClick={() => setPlan(3)}>En 3 fois{estimate ? ` · ${formatEuros(planInstallments(estimate.total, 3, catalog.season.installmentDates, today)[1].amount, true)}` : ''}</button>
                    </div>
                  </div>
                  {estimate && <p className="xs muted" style={{ margin: 0 }}>Échéances : {planInstallments(estimate.total, plan, catalog.season.installmentDates, today).map((i) => `${formatDateFr(i.dueOn)} (${formatEuros(i.amount, true)})`).join(', ')}.</p>}
                  <Field label="Mode de règlement prévu" error={errors.intendedMethod}>{(p) => <select {...p} className="in" value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>{(Object.keys(METHOD_LABELS) as PaymentMethod[]).map((m) => <option key={m} value={m}>{METHOD_LABELS[m]}</option>)}</select>}</Field>
                </div>
                <div className="fc">
                  <h2><span className="n" aria-hidden="true">7</span>Autorisations</h2>
                  <YesNo label="Autorisez-vous l’école à photographier ou filmer l’élève lors des cours et des auditions, pour sa communication (droit à l’image) ?" value={imageRights} onChange={setImageRights} yes="J’autorise" no="Je n’autorise pas" error={errors.imageRights} />
                  <label className="checkline"><input type="checkbox" checked={rulesAccepted} onChange={(e) => setRulesAccepted(e.target.checked)} aria-invalid={errors.rulesAccepted ? true : undefined} />J’ai pris connaissance du règlement intérieur de l’école et je l’accepte.</label>
                  {errors.rulesAccepted && <span className="err field" role="alert">{errors.rulesAccepted}</span>}
                  <PrivacyNotice catalog={catalog} />
                  <label className="checkline"><input type="checkbox" checked={privacyAck} onChange={(e) => setPrivacyAck(e.target.checked)} aria-invalid={errors.privacyAck ? true : undefined} />J’ai lu les informations sur l’utilisation de mes données.</label>
                  {errors.privacyAck && <span className="err field" role="alert">{errors.privacyAck}</span>}
                  <p className="xs muted" style={{ margin: 0 }}>La date de vos consentements est enregistrée avec le dossier.</p>
                </div>
              </>
            )}

            {formError && <div className="note late" role="alert">{formError}</div>}
            <div className={step > 1 ? 'navrow' : ''}>
              {step > 1 && <button type="button" className="cta ghost" onClick={() => setStep(step - 1)} style={{ width: 'auto', paddingInline: 18 }}>Retour</button>}
              <button type="submit" className="cta" disabled={busy}>{step === 1 ? 'Continuer' : step === 2 ? 'Choisir l’instrument' : busy ? 'Envoi…' : course && course.remaining <= 0 ? 'Demander la liste d’attente' : 'Envoyer l’inscription'}</button>
            </div>
          </div>
        </form>
      </main>
    </div>
  );
}
