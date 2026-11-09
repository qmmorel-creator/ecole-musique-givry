import { useState } from 'react';
import { dataSource } from '../../data/index.ts';

/** Démonstration : aucun mail ne part, on montre le mail simulé à l'écran. */
export function DemoMailNotice({ to }: { to: string }) {
  const [open, setOpen] = useState(false);
  const mails = dataSource.demoMailsTo?.(to) ?? [];
  const last = mails[0];
  if (!last) return null;
  return (
    <div className="fc">
      <div className="note"><span aria-hidden="true">✉</span><span>Démonstration : aucun mail réel n’est envoyé. Le message est consigné dans le journal des mails.</span></div>
      <button type="button" className="btn" onClick={() => setOpen(!open)} aria-expanded={open}>{open ? 'Masquer le mail simulé' : 'Voir le mail simulé'}</button>
      {open && <div data-testid="mail-simule"><p className="sm" style={{ margin: 0 }}><b>À :</b> {last.to}<br /><b>Objet :</b> {last.subject}</p><pre className="mail">{last.body}</pre></div>}
    </div>
  );
}
