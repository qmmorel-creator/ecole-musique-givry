// Utilitaires HTTP communs aux fonctions Edge.
export const SITE_URL = Deno.env.get('SITE_URL') ?? 'https://ecole-musique-givry.netlify.app';

export const cors = {
  'Access-Control-Allow-Origin': SITE_URL,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  Vary: 'Origin',
};

export const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json; charset=utf-8' } });
export const fail = (message: string, status = 400, fieldErrors?: Record<string, string>) => json({ message, fieldErrors }, status);

/** Adresse IP du client, hachée avec un sel secret : on ne stocke jamais l'adresse en clair. */
export async function ipKey(req: Request, bucket: string): Promise<string> {
  const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || req.headers.get('cf-connecting-ip') || 'inconnue';
  const salt = Deno.env.get('RATE_LIMIT_SALT') ?? '';
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${salt}:${ip}`));
  return `${bucket}:${Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('')}`;
}

/** Date du jour à Paris, au format ISO. */
export const todayParis = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' });
