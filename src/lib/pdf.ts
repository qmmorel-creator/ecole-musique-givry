// Documents PDF générés dans le navigateur, aux couleurs de l'école : bleu du logo et note orange.
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { Bilan } from '../domain/ledger.ts';
import { formatDateFr, formatEuros, METHOD_LABELS, type Payment } from '../domain/index.ts';

const BLUE: [number, number, number] = [31, 120, 200];
const BLUE_DARK: [number, number, number] = [22, 103, 176];
const ORANGE: [number, number, number] = [243, 154, 30];
const INK: [number, number, number] = [22, 24, 29];
const MUTED: [number, number, number] = [90, 100, 120];

/** Les polices standard des PDF ne couvrent que le jeu Latin-1 étendu : on remplace les caractères hors jeu. */
export const pdfText = (s: string): string =>
  s
    .replace(/[\u202f\u00a0\u2009]/g, ' ')
    .replace(/[\u2212\u2013]/g, '-')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[\u2713\u2714]/g, 'v')
    .replace(/[^\t\n\r\u0020-\u00ff\u20ac\u2026\u0153\u0152\u2014]/g, '');

const eur = (n: number) => pdfText(formatEuros(n, true));

export interface SchoolInfo { name: string; address: string; email: string }

function drawLogo(doc: jsPDF, x: number, y: number, size: number) {
  doc.setFillColor(...ORANGE);
  doc.roundedRect(x, y, size, size, size * 0.22, size * 0.22, 'F');
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(255, 255, 255);
  const s = size / 24;
  doc.ellipse(x + 7.4 * s, y + 16.8 * s, 2.5 * s, 2.1 * s, 'F');
  doc.ellipse(x + 14.8 * s, y + 14.8 * s, 2.5 * s, 2.1 * s, 'F');
  doc.setLineWidth(1.4 * s);
  doc.line(x + 9.7 * s, y + 16.6 * s, x + 9.7 * s, y + 5.6 * s);
  doc.line(x + 17.1 * s, y + 14.6 * s, x + 17.1 * s, y + 3.8 * s);
  doc.setLineWidth(2.2 * s);
  doc.line(x + 9.7 * s, y + 6.2 * s, x + 17.1 * s, y + 4.4 * s);
}

function header(doc: jsPDF, school: SchoolInfo, title: string, subtitle?: string) {
  const w = doc.internal.pageSize.getWidth();
  doc.setFillColor(...BLUE);
  doc.rect(0, 0, w, 30, 'F');
  doc.setFillColor(...BLUE_DARK);
  doc.rect(0, 30, w, 1.2, 'F');
  drawLogo(doc, 14, 7, 16);
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text(pdfText(school.name), 35, 14);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(pdfText(`${school.address} · ${school.email}`), 35, 20);
  doc.setTextColor(...INK);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(17);
  doc.text(pdfText(title), 14, 45);
  doc.setFillColor(...ORANGE);
  doc.rect(14, 48, 22, 1.4, 'F');
  if (subtitle) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(...MUTED);
    doc.text(pdfText(subtitle), 14, 56);
  }
  doc.setTextColor(...INK);
}

function footers(doc: jsPDF, school: SchoolInfo, generatedOn: string) {
  const n = doc.getNumberOfPages();
  const w = doc.internal.pageSize.getWidth();
  const h = doc.internal.pageSize.getHeight();
  for (let i = 1; i <= n; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(...MUTED);
    doc.text(pdfText(`${school.name} · document établi le ${formatDateFr(generatedOn)}`), 14, h - 8);
    doc.text(`${i} / ${n}`, w - 14, h - 8, { align: 'right' });
  }
}

const tableStyle = {
  styles: { font: 'helvetica', fontSize: 9.5, cellPadding: 2.2, textColor: INK, lineColor: [228, 231, 236] as [number, number, number], lineWidth: 0.1 },
  headStyles: { fillColor: BLUE, textColor: [255, 255, 255] as [number, number, number], fontStyle: 'bold' as const },
  footStyles: { fillColor: [250, 251, 252] as [number, number, number], textColor: INK, fontStyle: 'bold' as const },
  alternateRowStyles: { fillColor: [247, 249, 252] as [number, number, number] },
  margin: { left: 14, right: 14 },
};

const lastY = (doc: jsPDF) => (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;

export interface SlipLine { family: string; payment: Payment }

export function bordereauPdf(school: SchoolInfo, slip: { number: number; createdAt: string; depositedOn: string | null }, lines: SlipLine[], today: string): Blob {
  const doc = new jsPDF();
  header(doc, school, `Bordereau de remise n° ${slip.number}`, `Préparé le ${formatDateFr(slip.createdAt.slice(0, 10))}${slip.depositedOn ? ` · déposé le ${formatDateFr(slip.depositedOn)}` : ' · à déposer'}`);
  let y = 64;
  const groups: Payment['method'][] = ['cheque', 'ancv', 'especes'];
  let grand = 0;
  for (const m of groups) {
    const list = lines.filter((l) => l.payment.method === m);
    if (!list.length) continue;
    const total = list.reduce((a, l) => a + l.payment.amount, 0);
    grand += total;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text(pdfText(`${METHOD_LABELS[m]} · ${list.length} pièce${list.length > 1 ? 's' : ''}`), 14, y);
    autoTable(doc, {
      ...tableStyle,
      startY: y + 3,
      head: [['N°', 'Famille', 'Référence', 'Banque', 'Reçu le', 'Montant']],
      body: list.map((l, i) => [String(i + 1), pdfText(l.family), pdfText(l.payment.reference), pdfText(l.payment.bank || '-'), formatDateFr(l.payment.receivedOn), eur(l.payment.amount)]),
      foot: [[{ content: pdfText(`Sous-total ${METHOD_LABELS[m].toLowerCase()}`), colSpan: 5 }, eur(total)]],
      columnStyles: { 5: { halign: 'right' } },
    });
    y = lastY(doc) + 10;
  }
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text(pdfText(`Total du bordereau : ${eur(grand)}`), 14, y);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...MUTED);
  doc.text(pdfText('Signature du déposant :'), 14, y + 14);
  doc.text(pdfText('Date de dépôt :'), 110, y + 14);
  footers(doc, school, today);
  return doc.output('blob');
}

export function bilanPdf(school: SchoolInfo, bilan: Bilan, today: string): Blob {
  const doc = new jsPDF();
  const ex = bilan.exercise;
  header(doc, school, `Bilan de l'exercice ${ex.label}`, `Comptabilité de trésorerie · du ${formatDateFr(ex.start)} au ${formatDateFr(ex.end)} · situation au ${formatDateFr(today < ex.end ? today : ex.end)}`);
  const kpiY = 62;
  const box = (x: number, label: string, value: string, color: [number, number, number]) => {
    doc.setDrawColor(228, 231, 236);
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(x, kpiY, 58, 20, 2, 2, 'FD');
    doc.setFontSize(8.5);
    doc.setTextColor(...MUTED);
    doc.text(pdfText(label), x + 4, kpiY + 7);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(...color);
    doc.text(pdfText(value), x + 4, kpiY + 15.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...INK);
  };
  box(14, 'Recettes', eur(bilan.totalRecettes), INK);
  box(76, 'Dépenses', eur(bilan.totalDepenses), INK);
  box(138, 'Résultat', `${bilan.resultat >= 0 ? '+ ' : '- '}${eur(Math.abs(bilan.resultat))}`, bilan.resultat >= 0 ? [18, 112, 63] : [180, 45, 10]);
  autoTable(doc, {
    ...tableStyle,
    startY: kpiY + 28,
    head: [['Recettes par catégorie', 'Montant']],
    body: bilan.recettes.filter((r) => r.amount !== 0).map((r) => [pdfText(r.label + (r.auto ? ' (automatique)' : '')), eur(r.amount)]),
    foot: [['Total des recettes', eur(bilan.totalRecettes)]],
    columnStyles: { 1: { halign: 'right', cellWidth: 40 } },
  });
  autoTable(doc, {
    ...tableStyle,
    startY: lastY(doc) + 8,
    head: [['Dépenses par catégorie', 'Montant']],
    body: bilan.depenses.filter((r) => r.amount !== 0).map((r) => [pdfText(r.label), eur(r.amount)]),
    foot: [['Total des dépenses', eur(bilan.totalDepenses)], ['Résultat de l’exercice'.replace('’', "'"), `${bilan.resultat >= 0 ? '+ ' : '- '}${eur(Math.abs(bilan.resultat))}`]],
    columnStyles: { 1: { halign: 'right', cellWidth: 40 } },
  });
  if (bilan.events.length) {
    autoTable(doc, {
      ...tableStyle,
      startY: lastY(doc) + 8,
      head: [['Résultat par événement', 'Date', 'Recettes', 'Dépenses', 'Résultat']],
      body: bilan.events.map((e) => [pdfText(e.name), formatDateFr(e.date), eur(e.recettes), eur(e.depenses), `${e.result >= 0 ? '+ ' : '- '}${eur(Math.abs(e.result))}`]),
      columnStyles: { 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' } },
    });
  }
  let y = lastY(doc) + 10;
  if (y > 260) { doc.addPage(); y = 20; }
  doc.setFillColor(253, 240, 220);
  doc.roundedRect(14, y, 182, 18, 2, 2, 'F');
  doc.setFontSize(8.5);
  doc.setTextColor(107, 44, 4);
  doc.text(doc.splitTextToSize(pdfText(`Document établi en comptabilité de trésorerie : il retrace les recettes encaissées et les dépenses payées sur l'exercice (${bilan.entryCount} opérations). Il ne constitue ni des comptes annuels ni une liasse fiscale et ne remplace pas le travail d'un expert-comptable.`), 174), 18, y + 6);
  footers(doc, school, today);
  return doc.output('blob');
}

export interface ReceiptData {
  familyName: string;
  guardianName: string;
  address: string;
  season: string;
  lines: { date: string; label: string; method: string; amount: number }[];
  signer: string;
  signerRole: string;
  number: string;
}

export function recuPdf(school: SchoolInfo, d: ReceiptData, today: string): Blob {
  const doc = new jsPDF();
  header(doc, school, 'Reçu de paiement', `Reçu n° ${d.number} · saison ${d.season}`);
  doc.setFontSize(10.5);
  doc.text(pdfText(`Reçu de : ${d.guardianName}, famille ${d.familyName}`), 14, 66);
  doc.text(pdfText(d.address), 14, 72);
  const total = d.lines.reduce((a, l) => a + l.amount, 0);
  autoTable(doc, {
    ...tableStyle,
    startY: 80,
    head: [['Date', 'Objet', 'Mode', 'Montant']],
    body: d.lines.map((l) => [formatDateFr(l.date), pdfText(l.label), pdfText(l.method), eur(l.amount)]),
    foot: [[{ content: 'Total reçu', colSpan: 3 }, eur(total)]],
    columnStyles: { 3: { halign: 'right' } },
  });
  const y = lastY(doc) + 12;
  doc.setFontSize(10.5);
  doc.text(doc.splitTextToSize(pdfText(`L'association ${school.name} reconnaît avoir reçu la somme de ${eur(total)} au titre de l'inscription aux cours de la saison ${d.season}. Ce reçu n'est pas un reçu fiscal.`), 182), 14, y);
  doc.text(pdfText(`Fait le ${formatDateFr(today)}, pour l'association.`), 14, y + 16);
  doc.text(pdfText(`${d.signer}, ${d.signerRole.toLowerCase()}`), 14, y + 24);
  footers(doc, school, today);
  return doc.output('blob');
}

export interface AttestationData {
  studentName: string;
  birthDate: string;
  guardianName: string;
  season: string;
  seasonStart: string;
  seasonEnd: string;
  discipline: string;
  fm: string | null;
  total: number;
  paid: number;
  lastPaymentOn: string | null;
  signer: string;
  signerRole: string;
}

export function attestationPdf(school: SchoolInfo, d: AttestationData, today: string): Blob {
  const doc = new jsPDF();
  header(doc, school, "Attestation d'inscription et de paiement", `Saison ${d.season}`);
  doc.setFontSize(11);
  const text = `Je soussigné(e) ${d.signer}, ${d.signerRole.toLowerCase()} de l'association ${school.name}, atteste que ${d.studentName}, né(e) le ${formatDateFr(d.birthDate)}, est inscrit(e) à l'école pour la saison ${d.season}, du ${formatDateFr(d.seasonStart)} au ${formatDateFr(d.seasonEnd)}, en ${d.discipline}${d.fm ? `, avec ${d.fm}` : ''}.\n\nLe montant de l'inscription s'élève à ${eur(d.total)}. La somme de ${eur(d.paid)} a été acquittée par ${d.guardianName}${d.lastPaymentOn ? `, dernier règlement encaissé le ${formatDateFr(d.lastPaymentOn)}` : ''}.\n\nAttestation délivrée pour servir et valoir ce que de droit.`;
  doc.text(doc.splitTextToSize(pdfText(text), 182), 14, 70);
  doc.text(pdfText(`Fait le ${formatDateFr(today)}.`), 14, 140);
  doc.text(pdfText(`${d.signer}, ${d.signerRole.toLowerCase()}`), 14, 150);
  footers(doc, school, today);
  return doc.output('blob');
}

/** Justificatif fictif pour les pièces du jeu d'essai. */
export function placeholderPdf(filename: string): string {
  const doc = new jsPDF();
  header(doc, { name: 'École de Musique de Givry', address: 'Givry (71640)', email: 'démonstration' }, 'Justificatif fictif', pdfText(filename));
  doc.setFontSize(11);
  doc.text(pdfText('Pièce jointe de démonstration : aucun document réel.'), 14, 70);
  return doc.output('datauristring');
}
