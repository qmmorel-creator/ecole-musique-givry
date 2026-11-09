// Droits par rôle du bureau. Valeurs par défaut, à confirmer par Quentin avec le bureau.
// Les mêmes règles sont appliquées en base par les politiques RLS (supabase/migrations).
import type { Role } from './types.ts';

export type Capability =
  | 'eleves' // base des élèves, dossiers, familles
  | 'places' // inscriptions, places, liste d'attente
  | 'encaissements' // saisie des règlements, relances
  | 'bordereaux' // bordereaux de remise, encaissement en banque
  | 'comptabilite' // recettes, dépenses, bilan, reçus et attestations
  | 'parametres' // saisons, cours, grille tarifaire, catégories
  | 'comptes' // comptes du bureau
  | 'rgpd' // export complet, purge, journal
  | 'journal';

export const ROLE_LABELS: Record<Role, string> = {
  presidence: 'Présidence',
  tresorerie: 'Trésorerie',
  secretariat: 'Secrétariat',
};

const MATRIX: Record<Role, Capability[]> = {
  presidence: ['eleves', 'places', 'encaissements', 'bordereaux', 'comptabilite', 'parametres', 'comptes', 'rgpd', 'journal'],
  tresorerie: ['eleves', 'places', 'encaissements', 'bordereaux', 'comptabilite', 'parametres', 'rgpd', 'journal'],
  secretariat: ['eleves', 'places', 'encaissements'],
};

export const can = (role: Role | null | undefined, cap: Capability): boolean => !!role && MATRIX[role].includes(cap);
