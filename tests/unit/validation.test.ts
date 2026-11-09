import { describe, expect, it } from 'vitest';
import { isBot, siblingMatches, validateInscription, type InscriptionInput } from '../../src/domain/index.ts';

const valid: InscriptionInput = {
  guardian: { firstName: 'Camille', lastName: 'Roux', email: 'camille.roux@example.com', phone: '06 12 34 56 41', relation: 'Mère', address: '3 rue du Moulin', postalCode: '71640', commune: 'Mellecey' },
  sibling: { declared: false, familyName: '', postalCode: '', email: '' },
  student: { firstName: 'Tom', lastName: 'Roux', birthDate: '2018-03-14' },
  courseId: 'c', level: '1re année', slot: 'Mer. 14 h', plan: 3, intendedMethod: 'cheque', imageRights: true, rulesAccepted: true, privacyAck: true, website: '',
};

describe('validation côté serveur', () => {
  it('accepte un dossier complet', () => {
    expect(validateInscription(valid, '2026-11-09')).toEqual({});
  });
  it('refuse les champs invalides', () => {
    const e = validateInscription({ ...valid, guardian: { ...valid.guardian, email: 'x', postalCode: '716', phone: '12' }, rulesAccepted: false, imageRights: null }, '2026-11-09');
    expect(Object.keys(e).sort()).toEqual(['guardian.email', 'guardian.phone', 'guardian.postalCode', 'imageRights', 'rulesAccepted']);
  });
  it('exige les informations de recherche quand une fratrie est déclarée', () => {
    expect(Object.keys(validateInscription({ ...valid, sibling: { declared: true, familyName: '', postalCode: '1', email: '' } }, '2026-11-09'))).toEqual(['sibling.familyName', 'sibling.postalCode', 'sibling.email']);
  });
  it('repère le champ piège', () => {
    expect(isBot({ website: '' })).toBe(false);
    expect(isBot({ website: 'http://spam' })).toBe(true);
  });
});

describe('recherche de fratrie', () => {
  const fam = { familyName: 'Lefèvre', postalCode: '71640', guardianEmails: ['Anne.Lefevre@example.com'] };
  it('trouve la famille sur le nom, le code postal et le mail, sans tenir compte de la casse ni des accents', () => {
    expect(siblingMatches({ familyName: 'lefevre', postalCode: '71640', email: 'anne.lefevre@EXAMPLE.com ' }, fam)).toBe(true);
  });
  it('exige les trois critères', () => {
    expect(siblingMatches({ familyName: 'Lefèvre', postalCode: '71100', email: 'anne.lefevre@example.com' }, fam)).toBe(false);
    expect(siblingMatches({ familyName: 'Lefèvre', postalCode: '71640', email: 'autre@example.com' }, fam)).toBe(false);
    expect(siblingMatches({ familyName: '', postalCode: '71640', email: 'anne.lefevre@example.com' }, { ...fam, familyName: '' })).toBe(false);
  });
});
