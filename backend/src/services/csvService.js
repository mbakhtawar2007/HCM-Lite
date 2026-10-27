// Minimal CSV parser (quoted fields, commas inside quotes, CRLF).
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  const pushField = () => {
    row.push(field);
    field = '';
  };
  const pushRow = () => {
    rows.push(row);
    row = [];
  };
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ',') pushField();
    else if (ch === '\n') {
      pushField();
      pushRow();
    } else if (ch !== '\r') field += ch;
  }
  if (field !== '' || row.length) {
    pushField();
    pushRow();
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

export function csvEscape(value) {
  const s = String(value ?? '');
  // CSV formula injection: a cell starting with =, +, - or @ (even after
  // leading whitespace, which spreadsheets trim) runs as a formula when
  // the export is opened in Excel/Sheets. Prefixing with a single quote
  // forces it to plain text. Only formula-like cells change; normal
  // values export exactly as before.
  const escaped = /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  return /^[ \t\r]*[=+\-@]/.test(s) ? `'${escaped}` : escaped;
}
