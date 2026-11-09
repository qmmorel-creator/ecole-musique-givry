// Invitation d'un membre du bureau (présidence uniquement) : compte créé par Supabase Auth, connexion par lien magique.
import { cors, fail, json, SITE_URL } from '../_shared/http.ts';
import { audit, serviceClient, staffFromRequest } from '../_shared/db.ts';
import { can, EMAIL_RE, type Role } from '../_shared/domain/index.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return fail('Méthode non autorisée', 405);
  const db = serviceClient();
  const staff = await staffFromRequest(db, req);
  if (!staff || !can(staff.role as Role, 'comptes')) return fail('Accès réservé à la présidence', 403);
  const p = await req.json().catch(() => null) as { fullName: string; email: string; role: Role } | null;
  if (!p || !p.fullName?.trim() || !EMAIL_RE.test(p.email ?? '') || !['presidence', 'tresorerie', 'secretariat'].includes(p.role)) return fail('Nom, adresse mail et rôle requis');
  const { data, error } = await db.auth.admin.inviteUserByEmail(p.email.trim(), { redirectTo: `${SITE_URL}/bureau` });
  if (error || !data.user) return fail(`Invitation impossible : ${error?.message ?? 'erreur inconnue'}`, 502);
  const { error: e2 } = await db.from('staff_profiles').upsert({ id: data.user.id, full_name: p.fullName.trim(), email: p.email.trim(), role: p.role, active: true });
  if (e2) return fail('Profil non enregistré', 500);
  await audit(db, staff.full_name, 'Compte invité', 'staff_profiles', `${p.fullName} · ${p.role}`, staff.id);
  return json({ ok: true });
});
