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

// Google Sheets: fetch via Sheets API (authenticated) or public CSV export (fallback)
export async function fetchGoogleSheet(sheetUrl, accessToken = null) {
  const id = extractSheetId(sheetUrl);
  if (!id) throw new Error('Could not parse Google Sheets URL. Make sure it\'s a valid sharing link.');

  // If authenticated, use the Sheets API for reliable access to restricted sheets
  if (accessToken) {
    return fetchSheetAuthenticated(id, accessToken);
  }

  // Fallback: public CSV export (sheet must be "Anyone with the link")
  let contacts = [];
  let eventInfo = null;

  const csvUrl = `https://docs.google.com/spreadsheets/d/${id}/gviz/tq?tqx=out:csv`;
  const eventCsvUrl = `https://docs.google.com/spreadsheets/d/${id}/gviz/tq?tqx=out:csv&sheet=Event%20Info`;
  const contactsCsvUrl = `https://docs.google.com/spreadsheets/d/${id}/gviz/tq?tqx=out:csv&sheet=Contacts`;

  try {
    const eventResp = await fetch(eventCsvUrl);
    if (eventResp.ok) {
      const eventText = await eventResp.text();
      eventInfo = parseEventInfoCSV(eventText);
    }
  } catch (_) {}

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
    if (!resp.ok) throw new Error('Could not fetch sheet. Sign in with Google to access restricted sheets, or set sharing to "Anyone with the link".');
    const text = await resp.text();
    contacts = parseCSVRaw(text);
  }

  if (contacts.length === 0) {
    throw new Error('No contacts found. Check that the sheet has the right column headers.');
  }

  return { contacts, eventInfo };
}

// Authenticated fetch via Google Sheets API
async function fetchSheetAuthenticated(sheetId, token) {
  const headers = { Authorization: `Bearer ${token}` };
  const metaUrl = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}?fields=sheets.properties.title`;

  const metaResp = await fetch(metaUrl, { headers });
  if (!metaResp.ok) {
    if (metaResp.status === 403 || metaResp.status === 404) {
      throw new Error('Cannot access this sheet. Make sure you have view access and the URL is correct.');
    }
    throw new Error(`Google Sheets API error: ${metaResp.status}`);
  }

  const meta = await metaResp.json();
  const sheetNames = meta.sheets.map(s => s.properties.title);

  let contacts = [];
  let eventInfo = null;

  // Try Event Info sheet
  if (sheetNames.includes('Event Info')) {
    const eventUrl = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/Event%20Info?majorDimension=ROWS`;
    const eventResp = await fetch(eventUrl, { headers });
    if (eventResp.ok) {
      const eventData = await eventResp.json();
      eventInfo = parseEventInfoRows(eventData.values || []);
    }
  }

  // Try Contacts sheet, then first sheet
  const contactSheet = sheetNames.includes('Contacts') ? 'Contacts' : sheetNames[0];
  const dataUrl = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(contactSheet)}?majorDimension=ROWS`;
  const dataResp = await fetch(dataUrl, { headers });
  if (dataResp.ok) {
    const data = await dataResp.json();
    const rows = data.values || [];
    if (rows.length >= 2) {
      const hdrs = rows[0];
      const records = rows.slice(1).map(row => {
        const obj = {};
        hdrs.forEach((h, i) => obj[h] = row[i] || '');
        return obj;
      });
      contacts = normalizeRows(records);
    }
  }

  if (contacts.length === 0) {
    throw new Error('No contacts found. Check that the sheet has the right column headers.');
  }

  return { contacts, eventInfo };
}

function parseEventInfoRows(rows) {
  const info = {};
  const labelMap = {
    'event name': 'name',
    'start date': 'date',
    'end date': 'endDate',
    'location': 'location',
    'conference website': 'website',
    'agenda url': 'agendaUrl',
  };
  for (const row of rows) {
    if (row.length >= 2) {
      const label = row[0].toLowerCase().trim();
      const value = row[1].trim();
      if (labelMap[label] && value && !value.startsWith('e.g.')) {
        info[labelMap[label]] = value;
      }
    }
  }
  return Object.keys(info).length > 0 ? info : null;
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

// Search user's Google Drive for spreadsheets
export async function searchGoogleSheets(query, accessToken) {
  let q = "mimeType='application/vnd.google-apps.spreadsheet'";
  if (query) {
    q += ` and name contains '${query.replace(/'/g, "\\'")}'`;
  }
  const params = new URLSearchParams({
    q,
    orderBy: 'modifiedTime desc',
    pageSize: '20',
    fields: 'files(id,name,modifiedTime,owners)',
  });
  const resp = await fetch(`https://www.googleapis.com/drive/v3/files?${params}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!resp.ok) throw new Error(`Drive API error: ${resp.status}`);
  const data = await resp.json();
  return data.files || [];
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
