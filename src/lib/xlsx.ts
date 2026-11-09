// Exports tableur (.xlsx) et CSV, générés dans le navigateur.
import { downloadBlob } from './download.ts';

export type Cell = string | number | null;
export interface Sheet { name: string; columns: string[]; rows: Cell[][] }

export async function xlsxBlob(sheets: Sheet[]): Promise<Blob> {
  const { default: writeXlsxFile } = await import('write-excel-file/browser');
  const data = sheets.map((s) => ({
    sheet: s.name.replace(/[\\/?*[\]:]/g, ' ').slice(0, 31),
    data: [s.columns.map((c) => ({ value: c, fontWeight: 'bold' as const })), ...s.rows.map((r) => r.map((v) => (v === '' ? null : v)))],
  }));
  return (writeXlsxFile as unknown as (d: unknown) => { toBlob: () => Promise<Blob> })(data).toBlob();
}

export async function exportXlsx(sheets: Sheet[], filename: string) {
  downloadBlob(await xlsxBlob(sheets), filename);
}

const csvCell = (v: Cell) => {
  if (v === null || v === undefined) return '';
  const s = typeof v === 'number' ? String(v).replace('.', ',') : String(v);
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** CSV au format attendu par les tableurs français : séparateur « ; », BOM UTF-8. */
export const toCsv = (s: Sheet): string => '﻿' + [s.columns, ...s.rows].map((r) => r.map(csvCell).join(';')).join('\r\n');
