import { useState } from 'react';
import { dataSource, type PurgePreview, type Snapshot } from '../../data/index.ts';
import { formatDateFr } from '../../domain/index.ts';
import { Modal } from '../../components/ui.tsx';
import { useStore } from '../../store.tsx';
import { downloadBlob } from '../../lib/download.ts';
import { toCsv, xlsxBlob, type Cell, type Sheet } from '../../lib/xlsx.ts';
import { PageTop } from './BureauApp.tsx';

/** Une feuille par table, colonnes reprises telles quelles : export complet et réimportable. */
export function snapshotSheets(s: Snapshot): Sheet[] {
  const tables: [string, object[]][] = [
    ['seasons', s.seasons], ['families', s.families], ['guardians', s.guardians], ['students', s.students], ['courses', s.courses],
    ['enrollments', s.enrollments], ['waitlist', s.waitlist], ['fee_grid', s.feeLines], ['fee_rules', s.feeRules], ['installments', s.installments],
    ['payments', s.payments], ['deposit_slips', s.depositSlips], ['ledger_categories', s.categories], ['ledger_entries', s.entries], ['events', s.events],
    ['attachments', s.attachments], ['staff_profiles', s.staff], ['audit_log', s.audit], ['mail_outbox', s.mails], ['settings', [s.settings]],
  ];
  return tables.map(([name, rows]) => {
    const columns = [...new Set(rows.flatMap((r) => Object.keys(r)))];
    return { name, columns, rows: rows.map((r) => columns.map((c): Cell => { const v = (r as Record<string, unknown>)[c]; return v === null || v === undefined ? null : typeof v === 'number' ? v : typeof v === 'object' ? JSON.stringify(v) : String(v); })) };
  });
}

export default function DonneesPage() {
  const { snap, run, today } = useStore();
  const s = snap!;
  const [preview, setPreview] = useState<PurgePreview | null>(null);
  const [q, setQ] = useState('');
  const stamp = today;
  const exportXlsx = async () => downloadBlob(await xlsxBlob(snapshotSheets(s)), `export-complet-${stamp}.xlsx`);
  const exportCsv = async () => {
    const { zipSync, strToU8 } = await import('fflate');
    const files: Record<string, Uint8Array> = {};
    for (const sh of snapshotSheets(s)) files[`${sh.name}.csv`] = strToU8(toCsv(sh));
    files['LISEZMOI.txt'] = strToU8(`Export complet des données de ${s.settings.schoolName}, établi le ${formatDateFr(today)}.\r\nUn fichier CSV par table (séparateur point-virgule, encodage UTF-8).\r\nLes justificatifs se téléchargent depuis la comptabilité.\r\n`);
    downloadBlob(new Blob([zipSync(files)], { type: 'application/zip' }), `export-complet-${stamp}-csv.zip`);
  };
  const audit = s.audit.filter((a) => !q || `${a.actor} ${a.action} ${a.details}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <>
      <PageTop title="Données et RGPD" sub="Les données restent celles de l’école : exportables à tout moment" />
      <main className="content" id="contenu">
        <div className="grid2e">
          <section className="card">
            <header><h2>Export complet</h2></header>
            <div className="body" style={{ display: 'grid', gap: 10 }}>
              <p className="sm" style={{ margin: 0 }}>Toutes les tables : familles, élèves, inscriptions, échéances, règlements, bordereaux, comptabilité, événements, paramètres et journal.</p>
              <div className="filters"><button type="button" className="btn pri" onClick={exportXlsx}>Exporter en Excel (.xlsx)</button><button type="button" className="btn" onClick={exportCsv}>Exporter en CSV (.zip)</button></div>
            </div>
          </section>
          <section className="card">
            <header><h2>Conservation et purge</h2></header>
            <div className="body" style={{ display: 'grid', gap: 10 }}>
              <p className="sm" style={{ margin: 0 }}>Durée de conservation : <b>{s.settings.retentionYears} ans</b> après la dernière saison de la famille (réglable dans Paramètres). La purge supprime les familles, élèves, inscriptions et règlements concernés ; les écritures comptables sont gardées sans donnée personnelle.</p>
              <div><button type="button" className="btn" onClick={async () => { try { setPreview(await dataSource.staffApi.purgePreview()); } catch (e) { alert(e instanceof Error ? e.message : 'Erreur'); } }}>Voir les données à purger</button></div>
            </div>
          </section>
        </div>
        <section className="card">
          <header><h2>Journal des actions du bureau</h2><span className="sp" /><label className="search"><span className="sr-only">Filtrer le journal</span><input className="in" type="search" placeholder="Filtrer" value={q} onChange={(e) => setQ(e.target.value)} /></label></header>
          <div className="tw"><table className="t"><thead><tr><th>Date</th><th>Personne</th><th>Action</th><th>Détail</th></tr></thead><tbody>
            {audit.slice(0, 300).map((a) => <tr key={a.id}><td className="tnum sm" style={{ whiteSpace: 'nowrap' }}>{formatDateFr(a.at)} {a.at.slice(11, 16)}</td><td className="sm">{a.actor}</td><td className="sm"><b style={{ fontWeight: 600 }}>{a.action}</b></td><td className="sm">{a.details}</td></tr>)}
          </tbody></table>{audit.length === 0 && <div className="empty">Aucune action.</div>}</div>
        </section>
      </main>
      {preview && (
        <Modal title="Purge des anciennes saisons" onClose={() => setPreview(null)} footer={<><button type="button" className="btn" onClick={() => setPreview(null)}>Annuler</button><button type="button" className="btn danger" disabled={!preview.families} onClick={async () => { if (confirm('Supprimer définitivement ces données ? Faites d’abord un export complet.') && await run(() => dataSource.staffApi.purge(), 'Purge effectuée.')) setPreview(null); }}>Purger définitivement</button></>}>
          <p style={{ margin: 0 }}>Familles sans inscription depuis le {formatDateFr(preview.before)} : <b>{preview.families}</b> famille(s), {preview.students} élève(s), {preview.enrollments} inscription(s).</p>
          {preview.families === 0 && <div className="note ok">Rien à purger pour le moment.</div>}
        </Modal>
      )}
    </>
  );
}
