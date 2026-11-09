import { describe, expect, it } from 'vitest';
import { buildSeed, DEMO_TODAY } from '../../src/data/demo/seed.ts';
import { installmentState } from '../../src/domain/index.ts';

describe('jeu d’essai fictif', () => {
  const s = buildSeed();
  it('est déterministe', () => {
    expect(JSON.stringify(buildSeed())).toBe(JSON.stringify(s));
  });
  it('contient 94 inscriptions sur la saison en cours, sans dépasser les capacités', () => {
    const cur = s.enrollments.filter((e) => e.seasonId === 's2026');
    expect(cur.length).toBe(94);
    for (const c of s.courses.filter((c) => c.seasonId === 's2026')) {
      const n = cur.filter((e) => e.courseId === c.id || e.fmCourseId === c.id).length;
      expect(n, c.discipline).toBeLessThanOrEqual(c.capacity);
    }
  });
  it('a des échéances en retard, à remettre, prévues et encaissées', () => {
    const st = s.installments.filter((i) => i.seasonId === 's2026').map((i) => installmentState(i, s.payments, DEMO_TODAY).status);
    for (const k of ['en_retard', 'a_remettre', 'encaisse', 'prevu'] as const) expect(st).toContain(k);
  });
  it('n’emploie que des adresses de test réservées', () => {
    expect(s.guardians.every((g) => g.email.endsWith('@example.com'))).toBe(true);
  });
  it('crée une recette automatique par règlement encaissé', () => {
    expect(s.entries.filter((e) => e.source === 'auto').length).toBe(s.payments.filter((p) => p.cashedOn).length);
  });
});
