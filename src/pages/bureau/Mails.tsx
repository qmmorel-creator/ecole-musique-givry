import { useState } from 'react';
import { dataSource, isDemo } from '../../data/index.ts';
import { formatDateFr, type MailMessage } from '../../domain/index.ts';
import { Badge, Modal } from '../../components/ui.tsx';
import { useStore } from '../../store.tsx';
import { PageTop } from './BureauApp.tsx';

const KIND: Record<MailMessage['kind'], string> = { confirmation: 'Confirmation', relance: 'Relance', proposition_place: 'Place proposée', reinscription: 'Réinscription', connexion: 'Connexion' };

export function MailsPage() {
  const { snap, run } = useStore();
  const s = snap!;
  const drafts = s.mails.filter((m) => m.status === 'brouillon');
  const sent = s.mails.filter((m) => m.status === 'envoye');
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [view, setView] = useState<MailMessage | null>(null);
  const toggle = (id: string, on: boolean) => { const n = new Set(sel); if (on) n.add(id); else n.delete(id); setSel(n); };
  return (
    <>
      <PageTop title="Mails" sub={isDemo ? 'Démonstration : aucun mail ne part, tout est consigné ici' : 'Mails préparés et journal des envois'} />
      <main className="content" id="contenu">
        <section className="card" aria-labelledby="dr-h">
          <header><h2 id="dr-h">À valider avant envoi</h2><span className="sp" /><span className="muted sm">{drafts.length} brouillon{drafts.length > 1 ? 's' : ''}</span></header>
          <div className="list">
            {drafts.length === 0 && <div className="empty">Aucun mail en attente. Les relances se préparent depuis Encaissements.</div>}
            {drafts.map((m) => (
              <div className="li" key={m.id}>
                <input type="checkbox" className="chk" aria-label={`Sélectionner le mail à ${m.to}`} checked={sel.has(m.id)} onChange={(e) => toggle(m.id, e.target.checked)} />
                <span className="grow"><b style={{ fontWeight: 600 }}>{m.subject}</b><div className="muted sm">à {m.to} · préparé le {formatDateFr(m.createdAt)}</div></span>
                <button type="button" className="btn sm" onClick={() => setView(m)}>Relire</button>
              </div>
            ))}
          </div>
          {drafts.length > 0 && (
            <div className="foot">
              <button type="button" className="btn sm" onClick={() => setSel(new Set(drafts.map((m) => m.id)))}>Tout sélectionner</button>
              <button type="button" className="btn pri sm" disabled={!sel.size} onClick={async () => { if (await run(() => dataSource.staffApi.sendMails([...sel]), isDemo ? `${sel.size} mail(s) validé(s) : envoi simulé.` : `${sel.size} mail(s) envoyé(s).`)) setSel(new Set()); }}>Valider et envoyer ({sel.size})</button>
              <button type="button" className="btn danger sm" disabled={!sel.size} onClick={async () => { if (await run(() => dataSource.staffApi.discardMails([...sel]), 'Brouillons supprimés.')) setSel(new Set()); }}>Supprimer</button>
            </div>
          )}
        </section>
        <section className="card" aria-labelledby="se-h">
          <header><h2 id="se-h">Journal des mails envoyés</h2><span className="sp" /><span className="muted sm">{sent.length}</span></header>
          <div className="tw"><table className="t"><thead><tr><th>Date</th><th>Type</th><th>Destinataire</th><th>Objet</th><th>Validé par</th><th><span className="sr-only">Lire</span></th></tr></thead><tbody>
            {sent.slice(0, 300).map((m) => <tr key={m.id}><td className="tnum sm">{formatDateFr(m.sentAt)}</td><td><Badge tone="info">{KIND[m.kind]}</Badge></td><td className="sm">{m.to}</td><td className="sm">{m.subject}</td><td className="sm">{m.validatedBy ?? <span className="muted">automatique</span>}</td><td><button type="button" className="btn sm" onClick={() => setView(m)}>Lire</button></td></tr>)}
          </tbody></table>{sent.length === 0 && <div className="empty">Aucun mail envoyé.</div>}</div>
        </section>
      </main>
      {view && <Modal title={view.subject} onClose={() => setView(null)}><p className="sm" style={{ margin: 0 }}><b>À :</b> {view.to}</p><pre className="mail">{view.body}</pre></Modal>}
    </>
  );
}
