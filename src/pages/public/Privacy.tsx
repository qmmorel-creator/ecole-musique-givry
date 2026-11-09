import { useEffect, useState } from 'react';
import { dataSource, type PublicCatalog } from '../../data/index.ts';
import { FamilyHeader } from './Inscription.tsx';

export function PrivacyPage() {
  const [c, setC] = useState<PublicCatalog | null>(null);
  useEffect(() => { dataSource.publicApi.getCatalog().then(setC).catch(() => setC(null)); }, []);
  const years = c?.settings.retentionYears ?? 3;
  const mail = c?.settings.schoolEmail ?? 'l’adresse de l’école';
  return (
    <div className="fam">
      <FamilyHeader title="Données personnelles" />
      <main className="fb" id="contenu">
        <div className="fc">
          <h2>Qui traite vos données ?</h2>
          <p style={{ margin: 0 }}>L’École de Musique de Givry, association loi 1901, responsable du traitement. Contact : {mail}.</p>
          <h2>Pourquoi ?</h2>
          <p style={{ margin: 0 }}>Gérer les inscriptions, les cours, la liste d’attente, les règlements, les reçus et la comptabilité de l’association. Base légale : l’exécution de l’inscription ; le droit à l’image repose sur votre consentement, modifiable à tout moment auprès du bureau.</p>
          <h2>Quelles données ?</h2>
          <p style={{ margin: 0 }}>Identité et coordonnées du responsable légal, prénom, nom et date de naissance de l’élève, cours choisi, règlements, consentements et leur date. Aucune donnée de santé ni numéro de sécurité sociale n’est demandé.</p>
          <h2>Qui y accède ?</h2>
          <p style={{ margin: 0 }}>Les seuls membres du bureau (présidence, trésorerie, secrétariat), chacun selon son rôle, après connexion. Les données sont hébergées dans l’Union européenne. Elles ne sont ni vendues ni cédées.</p>
          <h2>Combien de temps ?</h2>
          <p style={{ margin: 0 }}>{years} ans après la dernière saison de l’élève, puis suppression. Les écritures comptables restent conservées sans donnée personnelle.</p>
          <h2>Vos droits</h2>
          <p style={{ margin: 0 }}>Accès, rectification, effacement, limitation et opposition : écrivez à {mail}. Vous pouvez aussi saisir la CNIL (cnil.fr).</p>
          <p className="xs muted" style={{ margin: 0 }}>Texte proposé par défaut, à valider par le bureau.</p>
        </div>
      </main>
    </div>
  );
}
