export const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

export const sum = (values: number[]): number => round2(values.reduce((a, b) => a + b, 0));

export function formatEuros(n: number, forceCents = false): string {
  const cents = forceCents || Math.round(n * 100) % 100 !== 0;
  return (
    n.toLocaleString('fr-FR', {
      minimumFractionDigits: cents ? 2 : 0,
      maximumFractionDigits: cents ? 2 : 0,
    }) + ' €'
  );
}
