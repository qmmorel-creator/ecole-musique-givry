// Recherche de fratrie : répond seulement { found: true | false }. Aucune information sur les élèves.
import { cors, fail, ipKey, json } from '../_shared/http.ts';
import { allow, serviceClient } from '../_shared/db.ts';
import { validateSibling } from '../_shared/domain/index.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return fail('Méthode non autorisée', 405);
  const db = serviceClient();
  if (!(await allow(db, await ipKey(req, 'fratrie'), 12, 600))) return fail('Trop de tentatives. Réessayez dans quelques minutes.', 429);
  const q = await req.json().catch(() => null) as { familyName?: string; postalCode?: string; email?: string } | null;
  if (!q) return fail('Requête invalide');
  const errors = validateSibling({ declared: true, familyName: q.familyName ?? '', postalCode: q.postalCode ?? '', email: q.email ?? '' });
  if (Object.keys(errors).length) return fail('Informations incomplètes', 400, errors);
  const { data, error } = await db.rpc('sibling_lookup', { p_family_name: q.familyName, p_postal_code: q.postalCode, p_email: q.email });
  if (error) return fail('Recherche impossible pour le moment', 500);
  return json({ found: data === true });
});
