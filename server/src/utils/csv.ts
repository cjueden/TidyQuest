// Small RFC 4180 CSV reader/writer: quoted fields may hold commas, quotes ("") and line breaks.

export interface CsvRecord { line: number; cells: string[] }

/** Parse CSV text into records, each with the line it starts on. A leading byte-order mark is ignored. */
export function parseCsv(text: string): CsvRecord[] {
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const records: CsvRecord[] = [];
  let cells: string[] = [];
  let cell = '';
  let quoted = false;
  let line = 1;
  let recordLine = 1;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') { cell += '"'; i++; } else quoted = false;
      } else {
        if (ch === '\n') line++;
        cell += ch;
      }
      continue;
    }
    if (ch === '"' && cell === '') quoted = true;
    else if (ch === ',') { cells.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      cells.push(cell);
      records.push({ line: recordLine, cells });
      cells = []; cell = '';
      line++;
      recordLine = line;
    } else cell += ch;
  }
  if (cell !== '' || cells.length > 0) {
    cells.push(cell);
    records.push({ line: recordLine, cells });
  }
  // Blank lines carry nothing
  return records.filter((r) => r.cells.some((c) => c.trim() !== ''));
}

function quote(value: unknown): string {
  const s = value == null ? '' : String(value);
  return /[",\r\n]/.test(s) || s !== s.trim() ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Build CSV text (CRLF line ends, with a byte-order mark so spreadsheet apps read emoji correctly). */
export function toCsv(header: string[], rows: unknown[][]): string {
  return '﻿' + [header, ...rows].map((r) => r.map(quote).join(',')).join('\r\n') + '\r\n';
}
