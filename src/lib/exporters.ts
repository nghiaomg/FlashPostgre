// Simple CSV/JSON export. CSV is hand-rolled (no extra deps) and handles
// embedded quotes, newlines and nulls correctly.

export function rowsToCsv(rows: any[], fields: Array<{ name: string }>): string {
  if (rows.length === 0 && fields.length === 0) return '';
  const cols = fields.length > 0 ? fields.map((f) => f.name) : Object.keys(rows[0] ?? {});
  const header = cols.map(csvEscape).join(',');
  const body = rows
    .map((row) => cols.map((c) => csvEscape(row[c])).join(','))
    .join('\r\n');
  return body ? `${header}\r\n${body}` : header;
}

function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return '';
  let s: string;
  if (typeof value === 'object') s = JSON.stringify(value);
  else s = String(value);
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function rowsToJson(rows: any[]): string {
  return JSON.stringify(rows, null, 2);
}

export function downloadText(filename: string, content: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 0);
}
