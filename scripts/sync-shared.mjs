// Copie le domaine métier (TypeScript pur) vers les fonctions Edge, pour que navigateur et serveur appliquent les mêmes règles.
import { cpSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const src = 'src/domain';
const dst = 'supabase/functions/_shared/domain';
rmSync(dst, { recursive: true, force: true });
mkdirSync(dst, { recursive: true });
for (const f of readdirSync(src)) if (f.endsWith('.ts')) cpSync(join(src, f), join(dst, f));
console.log(`Domaine copié vers ${dst}`);
