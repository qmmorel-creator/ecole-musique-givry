import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';

describe('fonctions Edge', () => {
  it('utilisent exactement le même domaine que le navigateur (npm run sync:shared)', () => {
    const src = readdirSync('src/domain').filter((f) => f.endsWith('.ts')).sort();
    expect(readdirSync('supabase/functions/_shared/domain').filter((f) => f.endsWith('.ts')).sort()).toEqual(src);
    for (const f of src) expect(readFileSync(`supabase/functions/_shared/domain/${f}`, 'utf8'), f).toBe(readFileSync(`src/domain/${f}`, 'utf8'));
    expect(readFileSync('supabase/functions/_shared/mapping.ts', 'utf8')).toBe(readFileSync('src/data/supabase/mapping.ts', 'utf8').replaceAll("'../../domain/types.ts'", "'./domain/types.ts'"));
  });
  it('n’exposent jamais la clé service_role au navigateur', () => {
    const scan = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? scan(`${dir}/${d.name}`) : [`${dir}/${d.name}`]));
    for (const f of scan('src')) expect(readFileSync(f, 'utf8'), f).not.toMatch(/SERVICE_ROLE_KEY/i);
  });
});
