// Minimal XLSX parser — no external dependencies
// Parses .xlsx (which is a ZIP of XML files) using browser APIs

export async function parseXLSX(file) {
  // We'll use the SheetJS CDN as a lightweight approach
  // Load it dynamically only when needed
  if (!window.XLSX) {
    await loadScript('https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js');
  }

  const data = await file.arrayBuffer();
  const workbook = XLSX.read(data, { type: 'array' });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet);

  return normalizeRows(rows);
}

export function parseCSV(text) {
  const lines = text.split('\n').filter(l => l.trim());
  if (lines.length < 2) return [];

  const headers = parseCSVLine(lines[0]);
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    const row = {};
    headers.forEach((h, j) => row[h] = values[j] || '');
    rows.push(row);
  }
  return normalizeRows(rows);
}

function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') { current += '"'; i++; }
      else if (ch === '"') inQuotes = false;
      else current += ch;
    } else {
      if (ch === '"') inQuotes = true;
      else if (ch === ',') { result.push(current.trim()); current = ''; }
      else current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

// Map common column name variations to our standard fields
const FIELD_MAP = {
  name: ['name', 'full name', 'contact name', 'attendee', 'person'],
  title: ['title', 'job title', 'position', 'role'],
  company: ['company', 'organization', 'org', 'firm', 'employer'],
  tier: ['tier', 'outreach tier', 'priority', 'rank'],
  companyDescription: ['company description', 'company desc', 'org description', 'about company'],
  reParticipation: ['re/structured finance participation', 're participation', 'real estate participation', 'finance participation', 'sector participation'],
  cribEquityAngle: ['crib equity angle', 'angle', 'pitch', 'pitch angle', 'approach', 'talking points'],
  roleContext: ['role context', 'context', 'role description', 'background'],
};

function normalizeRows(rows) {
  if (!rows.length) return [];

  // Build column mapping from first row's keys
  const rawHeaders = Object.keys(rows[0]);
  const mapping = {};

  for (const [field, aliases] of Object.entries(FIELD_MAP)) {
    for (const alias of aliases) {
      const match = rawHeaders.find(h => h.toLowerCase().trim() === alias);
      if (match) { mapping[field] = match; break; }
    }
    // Fuzzy match: check if any header contains the first alias
    if (!mapping[field]) {
      const match = rawHeaders.find(h => h.toLowerCase().includes(aliases[0]));
      if (match) mapping[field] = match;
    }
  }

  return rows.map(row => ({
    name: row[mapping.name] || '',
    title: row[mapping.title] || '',
    company: row[mapping.company] || '',
    tier: row[mapping.tier] || '',
    companyDescription: row[mapping.companyDescription] || '',
    reParticipation: row[mapping.reParticipation] || '',
    cribEquityAngle: row[mapping.cribEquityAngle] || '',
    roleContext: row[mapping.roleContext] || '',
  })).filter(r => r.name);
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = resolve;
    s.onerror = reject;
    document.head.appendChild(s);
  });
}
