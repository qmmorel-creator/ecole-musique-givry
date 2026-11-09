// Client Supabase côté serveur (clé service_role fournie par la plateforme, jamais envoyée au navigateur).
import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2';

export function serviceClient(): SupabaseClient {
  return createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
}

export async function allow(db: SupabaseClient, key: string, max: number, windowSeconds: number): Promise<boolean> {
  const { data, error } = await db.rpc('hit_rate_limit', { p_key: key, p_max: max, p_window_seconds: windowSeconds });
  if (error) throw error;
  return data === true;
}

/** Membre du bureau à l'origine de la requête, d'après son jeton de connexion. */
export async function staffFromRequest(db: SupabaseClient, req: Request): Promise<{ id: string; full_name: string; role: string } | null> {
  const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!token) return null;
  const { data } = await db.auth.getUser(token);
  if (!data.user) return null;
  const { data: staff } = await db.from('staff_profiles').select('id, full_name, role').eq('id', data.user.id).eq('active', true).maybeSingle();
  return staff;
}

export async function audit(db: SupabaseClient, actor: string, action: string, entity: string, details: string, actorId: string | null = null) {
  await db.from('audit_log').insert({ actor, actor_id: actorId, action, entity, details });
}
