// Copie le domaine métier (TypeScript pur) et les conversions de lignes vers les fonctions Edge,
// pour que navigateur et serveur appliquent exactement les mêmes règles. Vérifié par un test.
import { cpSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const dst = 'supabase/functions/_shared/domain';
rmSync(dst, { recursive: true, force: true });
mkdirSync(dst, { recursive: true });
for (const f of readdirSync('src/domain')) if (f.endsWith('.ts')) cpSync(join('src/domain', f), join(dst, f));
writeFileSync('supabase/functions/_shared/mapping.ts', readFileSync('src/data/supabase/mapping.ts', 'utf8').replaceAll("'../../domain/types.ts'", "'./domain/types.ts'"));
console.log('Domaine et conversions copiés vers supabase/functions/_shared');
