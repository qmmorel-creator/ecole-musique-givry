// Modèles des mails envoyés aux familles : mêmes textes en démonstration, dans le navigateur et dans les fonctions Edge.
import type { PriceBreakdown, SiblingCheck } from './types.ts';
import { formatDateFr } from './dates.ts';
import { formatEuros } from './money.ts';

export interface MailDraft { subject: string; body: string }
const SIGN = 'Le bureau de l’École de Musique de Givry';

export function confirmationMail(a: {
  guardianFirstName: string; studentFirstName: string; discipline: string; season: string; reference: string; outcome: 'inscription' | 'liste_attente';
  pricing: PriceBreakdown; installments: { rank: number; count: number; dueOn: string; amount: number }[]; siblingCheck: SiblingCheck;
}): MailDraft {
  if (a.outcome === 'liste_attente') {
    return { subject: 'Liste d’attente · École de Musique de Givry', body: `Bonjour ${a.guardianFirstName},\n\nLe cours de ${a.discipline} est complet pour la saison ${a.season}. ${a.studentFirstName} est inscrit(e) sur la liste d’attente (référence ${a.reference}). Nous vous écrirons dès qu’une place se libère, dans l’ordre d’arrivée des demandes.\n\n${SIGN}` };
  }
  const lines = a.pricing.lines.map((l) => `  · ${l.label} : ${l.note ?? formatEuros(l.amount, true)}`).join('\n');
  const ech = a.installments.map((i) => `  · ${i.rank}/${i.count} : ${formatEuros(i.amount, true)} au ${formatDateFr(i.dueOn)}`).join('\n');
  const sib = a.siblingCheck === 'a_verifier' ? '\nLe rattachement à votre famille sera vérifié par le bureau ; la réduction fratrie éventuelle sera appliquée à ce moment-là.\n' : '';
  return {
    subject: 'Inscription reçue · École de Musique de Givry',
    body: `Bonjour ${a.guardianFirstName},\n\nNous avons bien reçu l’inscription de ${a.studentFirstName} en ${a.discipline} pour la saison ${a.season} (référence ${a.reference}).\n\nTarif selon la grille de l’école :\n${lines}\n  Total : ${formatEuros(a.pricing.total, true)}\n\nÉchéances :\n${ech}\n${sib}\nLe dossier sera validé par le bureau. Vous pouvez répondre à ce message pour toute question.\n\n${SIGN}`,
  };
}

export function reminderMail(a: { guardianFirstName: string; lines: { studentFirstName: string; rank: number; count: number; dueOn: string; amount: number }[] }): MailDraft {
  const total = a.lines.reduce((s, l) => s + l.amount, 0);
  const detail = a.lines.map((l) => `  · ${l.studentFirstName}, échéance ${l.rank}/${l.count} du ${formatDateFr(l.dueOn)} : ${formatEuros(l.amount, true)}`).join('\n');
  return {
    subject: 'Rappel de règlement · École de Musique de Givry',
    body: `Bonjour ${a.guardianFirstName},\n\nSauf erreur de notre part, le règlement suivant n’a pas encore été reçu :\n${detail}\n  Total : ${formatEuros(Math.round(total * 100) / 100, true)}\n\nVous pouvez le déposer lors d’un cours ou faire un virement. Si vous l’avez déjà fait, merci de ne pas tenir compte de ce message.\n\n${SIGN}`,
  };
}

export function placeOfferMail(a: { guardianFirstName: string; studentFirstName: string; discipline: string; teacher: string }): MailDraft {
  return {
    subject: `Une place se libère en ${a.discipline}`,
    body: `Bonjour ${a.guardianFirstName},\n\nUne place s’est libérée en ${a.discipline} (${a.teacher}). Elle est proposée à ${a.studentFirstName}, en tête de la liste d’attente.\n\nMerci de nous confirmer votre réponse sous 7 jours en répondant à ce message.\n\n${SIGN}`,
  };
}

export function reinscriptionMail(a: { guardianFirstName: string; season: string; link: string }): MailDraft {
  return {
    subject: `Réinscription ${a.season} · École de Musique de Givry`,
    body: `Bonjour ${a.guardianFirstName},\n\nLes réinscriptions pour la saison ${a.season} sont ouvertes. Ce lien personnel vous permet de réinscrire vos enfants en quelques clics, sans tout ressaisir :\n${a.link}\n\nCe lien est personnel : merci de ne pas le transférer.\n\n${SIGN}`,
  };
}
