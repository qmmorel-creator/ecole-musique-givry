// Recherche de fratrie : ne répond que « trouvée » ou « non trouvée ».

export const normalizeName = (s: string): string =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z]/g, '')
    .toLowerCase();

export const normalizeEmail = (s: string): string => s.trim().toLowerCase();

export interface SiblingQuery {
  familyName: string;
  postalCode: string;
  email: string;
}

export interface SiblingCandidate {
  familyName: string;
  postalCode: string;
  guardianEmails: string[];
}

export function siblingMatches(q: SiblingQuery, c: SiblingCandidate): boolean {
  return (
    normalizeName(q.familyName) !== '' &&
    normalizeName(q.familyName) === normalizeName(c.familyName) &&
    q.postalCode.trim() === c.postalCode.trim() &&
    c.guardianEmails.some((e) => normalizeEmail(e) === normalizeEmail(q.email))
  );
}

/** Seule réponse autorisée vers le public. */
export type SiblingLookupResult = { found: boolean };
