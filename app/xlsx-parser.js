// Spreadsheet and Google Sheets parser

export async function parseXLSX(file) {
  if (!window.XLSX) {
    await loadScript('https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js');
  }

  const data = await file.arrayBuffer();
  const workbook = XLSX.read(data, { type: 'array' });

  // Try to extract event info from "Event Info" sheet
  let eventInfo = null;
  const eventSheet = workbook.Sheets['Event Info'];
  if (eventSheet) {
    eventInfo = parseEventInfoSheet(eventSheet);
  }

  // Parse contacts from first sheet or "Contacts" sheet
  const contactSheetName = workbook.SheetNames.includes('Contacts') ? 'Contacts' : workbook.SheetNames[0];
  const sheet = workbook.Sheets[contactSheetName];
  const rows = XLSX.utils.sheet_to_json(sheet);

  return { contacts: normalizeRows(rows), eventInfo };
}

function parseEventInfoSheet(sheet) {
  const info = {};
  const labelMap = {
    'event name': 'name',
    'start date': 'date',
    'end date': 'endDate',
    'location': 'location',
    'conference website': 'website',
    'agenda url': 'agendaUrl',
  };
  // Scan column A for labels, column B for values
  for (let r = 1; r <= 20; r++) {
    const labelCell = sheet[XLSX.utils.encode_cell({ r: r - 1, c: 0 })];
    const valueCell = sheet[XLSX.utils.encode_cell({ r: r - 1, c: 1 })];
    if (labelCell && valueCell) {
      const label = String(labelCell.v).toLowerCase().trim();
      const value = String(valueCell.v).trim();
      if (labelMap[label] && value && !value.startsWith('e.g.')) {
        info[labelMap[label]] = value;
      }
    }
  }
  return Object.keys(info).length > 0 ? info : null;
}

export function parseCSV(text) {
  const lines = text.split('\n').filter(l => l.trim());
  if (lines.length < 2) return { contacts: [], eventInfo: null };

  const headers = parseCSVLine(lines[0]);
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    const row = {};
    headers.forEach((h, j) => row[h] = values[j] || '');
    rows.push(row);
  }
  return { contacts: normalizeRows(rows), eventInfo: null };
}

// Google Sheets: fetch as CSV via public export URL
export async function fetchGoogleSheet(sheetUrl) {
  const id = extractSheetId(sheetUrl);
  if (!id) throw new Error('Could not parse Google Sheets URL. Make sure it\'s a valid sharing link.');

  // Try fetching the Contacts sheet first, fall back to first sheet
  let contacts = [];
  let eventInfo = null;

  // Fetch all sheets via the spreadsheet export
  const csvUrl = `https://docs.google.com/spreadsheets/d/${id}/gviz/tq?tqx=out:csv`;
  const eventCsvUrl = `https://docs.google.com/spreadsheets/d/${id}/gviz/tq?tqx=out:csv&sheet=Event%20Info`;
  const contactsCsvUrl = `https://docs.google.com/spreadsheets/d/${id}/gviz/tq?tqx=out:csv&sheet=Contacts`;

  // Try to get event info
  try {
    const eventResp = await fetch(eventCsvUrl);
    if (eventResp.ok) {
      const eventText = await eventResp.text();
      eventInfo = parseEventInfoCSV(eventText);
    }
  } catch (_) {}

  // Try Contacts sheet, then fall back to default
  try {
    const contactsResp = await fetch(contactsCsvUrl);
    if (contactsResp.ok) {
      const text = await contactsResp.text();
      const parsed = parseCSVRaw(text);
      if (parsed.length > 0) contacts = parsed;
    }
  } catch (_) {}

  if (contacts.length === 0) {
    const resp = await fetch(csvUrl);
    if (!resp.ok) throw new Error('Could not fetch sheet. Make sure it\'s set to "Anyone with the link can view".');
    const text = await resp.text();
    contacts = parseCSVRaw(text);
  }

  if (contacts.length === 0) {
    throw new Error('No contacts found. Check that the sheet has the right column headers.');
  }

  return { contacts, eventInfo };
}

function parseEventInfoCSV(text) {
  const lines = text.split('\n').filter(l => l.trim());
  const info = {};
  const labelMap = {
    'event name': 'name',
    'start date': 'date',
    'end date': 'endDate',
    'location': 'location',
    'conference website': 'website',
    'agenda url': 'agendaUrl',
  };
  for (const line of lines) {
    const cells = parseCSVLine(line);
    if (cells.length >= 2) {
      const label = cells[0].toLowerCase().replace(/^"|"$/g, '').trim();
      const value = cells[1].replace(/^"|"$/g, '').trim();
      if (labelMap[label] && value && !value.startsWith('e.g.')) {
        info[labelMap[label]] = value;
      }
    }
  }
  return Object.keys(info).length > 0 ? info : null;
}

function parseCSVRaw(text) {
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

function extractSheetId(url) {
  // Handle full URLs
  const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  if (match) return match[1];
  // Handle bare IDs
  if (/^[a-zA-Z0-9_-]{20,}$/.test(url.trim())) return url.trim();
  return null;
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

// Map common column name variations to standard fields
const FIELD_MAP = {
  name: ['name', 'full name', 'contact name', 'attendee', 'person'],
  title: ['title', 'job title', 'position', 'role'],
  company: ['company', 'organization', 'org', 'firm', 'employer'],
  tier: ['priority tier', 'tier', 'outreach tier', 'priority', 'rank'],
  companyOverview: ['company overview', 'company description', 'company desc', 'org description', 'about company'],
  industryContext: ['industry context', 'sector context', 're/structured finance participation', 're participation', 'real estate participation', 'finance participation', 'sector participation'],
  talkingPoints: ['talking points', 'crib equity angle', 'angle', 'pitch', 'pitch angle', 'approach', 'notes'],
  roleContext: ['role context', 'context', 'role description', 'background'],
};

function normalizeRows(rows) {
  if (!rows.length) return [];

  const rawHeaders = Object.keys(rows[0]);
  const mapping = {};

  for (const [field, aliases] of Object.entries(FIELD_MAP)) {
    for (const alias of aliases) {
      const match = rawHeaders.find(h => h.toLowerCase().trim() === alias);
      if (match) { mapping[field] = match; break; }
    }
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
    companyOverview: row[mapping.companyOverview] || '',
    industryContext: row[mapping.industryContext] || '',
    talkingPoints: row[mapping.talkingPoints] || '',
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
