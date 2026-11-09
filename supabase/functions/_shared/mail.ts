// Envoi des mails par l'API de Resend (offre gratuite : 3 000 par mois, 100 par jour).
export async function sendMail(to: string, subject: string, text: string): Promise<void> {
  const key = Deno.env.get('RESEND_API_KEY');
  const from = Deno.env.get('MAIL_FROM');
  if (!key || !from) throw new Error('RESEND_API_KEY ou MAIL_FROM manquant');
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to: [to], subject, text, reply_to: Deno.env.get('MAIL_REPLY_TO') || undefined }),
  });
  if (!res.ok) throw new Error(`Resend ${res.status} : ${await res.text()}`);
}
