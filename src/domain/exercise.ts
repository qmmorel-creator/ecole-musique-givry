// Exercice comptable paramétrable (par défaut du 1er septembre au 31 août).
import { addDays } from './dates.ts';

export interface Exercise {
  start: string;
  end: string;
  label: string;
}

export function exerciseFor(dateIso: string, startMonth = 9, startDay = 1): Exercise {
  const [y, m, d] = dateIso.split('-').map(Number);
  const startYear = m > startMonth || (m === startMonth && d >= startDay) ? y : y - 1;
  const pad = (n: number) => String(n).padStart(2, '0');
  const start = `${startYear}-${pad(startMonth)}-${pad(startDay)}`;
  const end = addDays(`${startYear + 1}-${pad(startMonth)}-${pad(startDay)}`, -1);
  const label = start.endsWith('-01-01') ? String(startYear) : `${startYear}-${startYear + 1}`;
  return { start, end, label };
}

export const inExercise = (dateIso: string, ex: Exercise): boolean =>
  dateIso >= ex.start && dateIso <= ex.end;
