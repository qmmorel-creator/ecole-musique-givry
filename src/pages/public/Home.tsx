import { Link } from 'react-router-dom';
import { isDemo } from '../../data/index.ts';
import { FamilyHeader } from './Inscription.tsx';

export function HomePage() {
  return (
    <div className="fam">
      <FamilyHeader title="Bienvenue" />
      <main className="fb" id="contenu">
        <div className="fc hero">
          <h2>Inscriptions en ligne</h2>
          <p style={{ margin: 0 }}>Inscrivez un enfant ou vous-même aux cours de l’école : instrument, éveil musical ou chorale. Le tarif est calculé selon la grille de l’école et le règlement peut se faire en une ou trois fois.</p>
          <Link to="/inscription" className="cta">Inscrire un élève</Link>
          <p className="sm muted" style={{ margin: 0 }}>Déjà inscrit l’an dernier ? Utilisez le lien personnel de réinscription reçu par mail.</p>
        </div>
        <div className="fc">
          <h2>Bureau de l’association</h2>
          <p className="sm" style={{ margin: 0 }}>Espace réservé aux membres du bureau : élèves, règlements et comptabilité.</p>
          <Link to="/bureau" className="btn">Accéder à l’espace du bureau</Link>
        </div>
        {isDemo && (
          <div className="fc">
            <h2>Démonstration</h2>
            <p className="sm" style={{ margin: 0 }}>Exemple de lien de réinscription envoyé à une famille fictive :</p>
            <Link to="/reinscription/demo-reinscription" className="btn">Ouvrir une réinscription fictive</Link>
          </div>
        )}
      </main>
    </div>
  );
}

export function NotFoundPage() {
  return (
    <div className="fam">
      <FamilyHeader title="Page introuvable" />
      <main className="fb" id="contenu"><div className="fc"><p style={{ margin: 0 }}>Cette page n’existe pas.</p><Link to="/" className="btn">Revenir à l’accueil</Link></div></main>
    </div>
  );
}
