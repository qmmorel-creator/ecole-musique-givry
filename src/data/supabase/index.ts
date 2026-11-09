import type { DataSource } from '../api.ts';
import { ApiError } from '../api.ts';

// Provisoire : remplacé par l'implémentation complète après l'écriture des migrations.
export function createSupabaseSource(): DataSource {
  const fail = () => { throw new ApiError('Source supabase non branchée.'); };
  return new Proxy({}, { get: () => fail }) as DataSource;
}
