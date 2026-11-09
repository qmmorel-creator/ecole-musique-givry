import { lazy, Suspense, useState, type ReactNode } from 'react';
import { Link, Navigate, NavLink, Route, Routes, useNavigate } from 'react-router-dom';
import { dataSource, isDemo } from '../../data/index.ts';
import { ROLE_LABELS, type Capability, type Role } from '../../domain/index.ts';
import { Field, Footer, initials, Loading, NoteMark } from '../../components/ui.tsx';
import { StoreProvider, useStore } from '../../store.tsx';
import { useDerived } from '../../lib/derive.ts';
import { AccueilPage } from './Accueil.tsx';
import { ElevesPage } from './Eleves.tsx';
import { PlacesPage } from './Places.tsx';
import { EncaissementsPage } from './Encaissements.tsx';
import { MailsPage } from './Mails.tsx';

const ComptabilitePage = lazy(() => import('./Comptabilite.tsx'));
const ParametresPage = lazy(() => import('./Parametres.tsx'));
const DonneesPage = lazy(() => import('./Donnees.tsx'));

export default function BureauApp() {
  return <StoreProvider><Gate /></StoreProvider>;
}

function Gate() {
  const { session, ready, snap } = useStore();
  if (!ready) return <Loading />;
  if (!session) return <LoginPage />;
  if (!snap) return <Loading text="Chargement des données…" />;
  return <Shell />;
}

function LoginPage() {
  const { setSession } = useStore();
  const api = dataSource.staffApi;
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const roles: Role[] = ['presidence', 'tresorerie', 'secretariat'];
  const names: Record<Role, string> = { presidence: 'Hélène Marchal', tresorerie: 'Claire Dumas', secretariat: 'Nicolas Perret' };
  return (
    <div className="fam">
      <header className="fh"><Link to="/" className="brand"><NoteMark size={30} /><span>École de Musique de Givry<small>Espace du bureau</small></span></Link><h1>Connexion</h1></header>
      <main className="fb" id="contenu">
        {api.loginMode === 'role' ? (
          <div className="fc">
            <h2>Démonstration : choisissez un rôle</h2>
            <p className="sm" style={{ margin: 0 }}>Dans l’outil réel, chaque membre du bureau reçoit un lien de connexion par mail. Ici, choisissez le rôle à essayer. Les personnes sont fictives.</p>
            {roles.map((r) => (
              <button key={r} type="button" className="btn" style={{ justifyContent: 'flex-start', padding: 12 }} onClick={async () => { try { setSession(await api.signInWithRole(r)); } catch (e) { setError(e instanceof Error ? e.message : 'Erreur'); } }}>
                <span className="av" aria-hidden="true">{initials(names[r])}</span>
                <span style={{ textAlign: 'left' }}>{ROLE_LABELS[r]}<span className="muted sm" style={{ display: 'block', fontWeight: 500 }}>{names[r]}</span></span>
              </button>
            ))}
          </div>
        ) : (
          <form className="fc" onSubmit={async (e) => { e.preventDefault(); setError(''); try { await api.sendMagicLink(email); setSent(true); } catch (err) { setError(err instanceof Error ? err.message : 'Erreur'); } }}>
            <h2>Recevoir un lien de connexion</h2>
            <Field label="Adresse mail du membre du bureau">{(p) => <input {...p} className="in" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />}</Field>
            <button className="cta" type="submit">Envoyer le lien</button>
            {sent && <div className="note ok">Si cette adresse correspond à un compte du bureau, un lien de connexion vient d’être envoyé.</div>}
          </form>
        )}
        {error && <div className="note late" role="alert">{error}</div>}
      </main>
      <Footer />
    </div>
  );
}

interface NavItem { to: string; label: string; ic: string; cap: Capability; badge?: number; short: string }

function Shell() {
  const { session, setSession, can } = useStore();
  const d = useDerived();
  const { snap } = useStore();
  const nav = useNavigate();
  const waiting = snap!.waitlist.filter((w) => w.seasonId === d.season.id && (w.status === 'en_attente' || w.status === 'proposee')).length;
  const drafts = snap!.mails.filter((m) => m.status === 'brouillon').length;
  const items: NavItem[] = [
    { to: '/bureau', label: 'Accueil', short: 'Accueil', ic: '⌂', cap: 'eleves' },
    { to: '/bureau/eleves', label: 'Élèves', short: 'Élèves', ic: '♫', cap: 'eleves', badge: d.toValidate.length || undefined },
    { to: '/bureau/places', label: 'Inscriptions et places', short: 'Places', ic: '▦', cap: 'places', badge: waiting || undefined },
    { to: '/bureau/encaissements', label: 'Encaissements', short: 'Encaiss.', ic: '€', cap: 'encaissements', badge: d.toHandIn.length || undefined },
    { to: '/bureau/comptabilite', label: 'Comptabilité', short: 'Comptes', ic: '≡', cap: 'comptabilite' },
    { to: '/bureau/mails', label: 'Mails', short: 'Mails', ic: '✉', cap: 'encaissements', badge: drafts || undefined },
    { to: '/bureau/parametres', label: 'Paramètres', short: 'Param.', ic: '⚙', cap: 'parametres' },
    { to: '/bureau/donnees', label: 'Données et RGPD', short: 'RGPD', ic: '⛁', cap: 'rgpd' },
  ].filter((i) => can(i.cap as Capability)) as NavItem[];
  const staff = session!.staff;
  const logout = async () => { await dataSource.staffApi.signOut(); setSession(null); nav('/bureau'); };
  const guard = (cap: Capability, el: ReactNode) => (can(cap) ? el : <Navigate to="/bureau" replace />);
  return (
    <div className="app">
      <aside className="side">
        <Link to="/bureau" className="logo"><NoteMark /><span>École de Musique<br />de Givry<small>Inscriptions · élèves · trésorerie</small></span></Link>
        <nav className="nav" aria-label="Menu du bureau">
          {items.map((i) => (
            <NavLink key={i.to} to={i.to} end={i.to === '/bureau'} className={({ isActive }) => (isActive ? 'active' : '')}>
              <span className="ic" aria-hidden="true">{i.ic}</span>{i.label}{i.badge ? <span className="n" aria-label={`${i.badge} à traiter`}>{i.badge}</span> : null}
            </NavLink>
          ))}
          <span className="grp">Côté familles</span>
          <a href="/inscription" target="_blank" rel="noopener"><span className="ic" aria-hidden="true">✎</span>Formulaire en ligne</a>
        </nav>
        <div className="me">
          <span className="av" aria-hidden="true">{initials(staff.fullName)}</span>
          <div>{staff.fullName}<div className="muted xs">{ROLE_LABELS[staff.role]}{isDemo ? ' · démo' : ''}</div></div>
          <button type="button" onClick={logout}>Quitter</button>
        </div>
      </aside>
      <div className="main">
        <Suspense fallback={<Loading />}>
          <Routes>
            <Route index element={<AccueilPage />} />
            <Route path="eleves" element={guard('eleves', <ElevesPage />)} />
            <Route path="places" element={guard('places', <PlacesPage />)} />
            <Route path="encaissements" element={guard('encaissements', <EncaissementsPage />)} />
            <Route path="mails" element={guard('encaissements', <MailsPage />)} />
            <Route path="comptabilite" element={guard('comptabilite', <ComptabilitePage />)} />
            <Route path="parametres" element={guard('parametres', <ParametresPage />)} />
            <Route path="donnees" element={guard('rgpd', <DonneesPage />)} />
            <Route path="menu" element={<MenuPage items={items} onLogout={logout} name={staff.fullName} role={ROLE_LABELS[staff.role]} />} />
            <Route path="*" element={<Navigate to="/bureau" replace />} />
          </Routes>
        </Suspense>
        <Footer />
      </div>
      <nav className="tabbar" aria-label="Menu du bureau (mobile)">
        {items.slice(0, 4).map((i) => (
          <NavLink key={i.to} to={i.to} end={i.to === '/bureau'} className={({ isActive }) => (isActive ? 'active' : '')}><span aria-hidden="true">{i.ic}</span>{i.short}</NavLink>
        ))}
        <NavLink to="/bureau/menu" className={({ isActive }) => (isActive ? 'active' : '')}><span aria-hidden="true">☰</span>Menu</NavLink>
      </nav>
    </div>
  );
}

export function PageTop({ title, sub, acts }: { title: string; sub?: ReactNode; acts?: ReactNode }) {
  return (
    <>
      <div className="top"><div><h1>{title}</h1>{sub && <div className="sub">{sub}</div>}</div><div className="sp" /><div className="acts">{acts}</div></div>
      <div className="mtop"><div><h1>{title}</h1>{sub && <div className="sub">{sub}</div>}</div></div>
    </>
  );
}

function MenuPage({ items, onLogout, name, role }: { items: NavItem[]; onLogout: () => void; name: string; role: string }) {
  return (
    <>
      <PageTop title="Menu" sub={`${name} · ${role}`} />
      <main className="content" id="contenu">
        <div className="card"><div className="list">
          {items.map((i) => <Link key={i.to} to={i.to} className="li" style={{ textDecoration: 'none', color: 'inherit' }}><span aria-hidden="true">{i.ic}</span><span className="grow"><b>{i.label}</b></span>{i.badge ? <span className="b warn">{i.badge}</span> : null}</Link>)}
          <a href="/inscription" className="li" style={{ textDecoration: 'none', color: 'inherit' }}><span aria-hidden="true">✎</span><span className="grow"><b>Formulaire en ligne des familles</b></span></a>
        </div></div>
        <button type="button" className="btn" onClick={onLogout}>Se déconnecter</button>
      </main>
    </>
  );
}
