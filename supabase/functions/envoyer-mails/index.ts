// Envoi des mails préparés, seulement à la demande d'un membre du bureau connecté (validation humaine).
import { cors, fail, json } from '../_shared/http.ts';
import { audit, serviceClient, staffFromRequest } from '../_shared/db.ts';
import { sendMail } from '../_shared/mail.ts';
import { can, type Role } from '../_shared/domain/index.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return fail('Méthode non autorisée', 405);
  const db = serviceClient();
  const staff = await staffFromRequest(db, req);
  if (!staff || !can(staff.role as Role, 'encaissements')) return fail('Accès réservé au bureau', 403);
  const { ids } = await req.json().catch(() => ({ ids: [] })) as { ids: string[] };
  if (!Array.isArray(ids) || !ids.length || ids.length > 100) return fail('Sélection invalide');
  const { data: mails } = await db.from('mail_outbox').select('*').in('id', ids).eq('status', 'brouillon');
  let sent = 0;
  const errors: string[] = [];
  for (const m of mails ?? []) {
    try {
      await sendMail(m.to_email, m.subject, m.body);
      await db.from('mail_outbox').update({ status: 'envoye', sent_at: new Date().toISOString(), validated_by: staff.full_name }).eq('id', m.id);
      sent++;
    } catch (e) { errors.push(`${m.to_email} : ${(e as Error).message}`); }
  }
  await audit(db, staff.full_name, 'Mails validés et envoyés', 'mail_outbox', `${sent} envoyé(s)${errors.length ? `, ${errors.length} échec(s)` : ''}`, staff.id);
  return errors.length ? fail(`${sent} mail(s) envoyé(s), ${errors.length} échec(s).`, 502) : json({ sent });
});
