import { route, start, navigate } from './router.js';
import { getEvents, getEvent, saveEvent, deleteEvent, getContact, getContactsByEvent, saveContacts, clearContactsForEvent } from './db.js';
import { html, esc, tierClass, tierLabel, initials, companyInitials, setNav } from './render.js';
import { parseXLSX, parseCSV } from './xlsx-parser.js';

let SEED_DATA = null;
async function getSeedData() {
  if (!SEED_DATA) {
    const resp = await fetch('./data/seed.json');
    SEED_DATA = await resp.json();
  }
  return SEED_DATA;
}

// Bottom nav (persistent)
function renderNav() {
  const nav = document.createElement('nav');
  nav.className = 'bottom-nav';
  nav.innerHTML = `
    <a class="nav-item" data-nav="events" href="#/">
      <span class="nav-icon">📅</span>Events
    </a>
    <a class="nav-item" data-nav="search" href="#/search">
      <span class="nav-icon">🔍</span>Search
    </a>
    <a class="nav-item" data-nav="settings" href="#/settings">
      <span class="nav-icon">⚙️</span>Settings
    </a>
  `;
  document.body.appendChild(nav);
}

// ─── Events List ───
route('/', async (params, app) => {
  setNav('events');
  const events = await getEvents();

  if (events.length === 0) {
    app.innerHTML = `
      <div class="page-header"><h1>ConferenceKit</h1><p>Your networking companion</p></div>
      <div class="empty-state fade-in">
        <div class="empty-icon">📋</div>
        <p class="empty-text">No events yet</p>
        <p style="color:var(--text-dim);font-size:13px;margin:8px 0 20px">Create your first event and import attendee data</p>
        <button class="btn btn-primary" id="create-first">+ Create Event</button>
        <div style="margin-top:16px">
          <button class="btn btn-secondary" id="load-demo" style="font-size:13px">Load demo data</button>
        </div>
      </div>`;
    document.getElementById('create-first').onclick = () => showEventModal();
    document.getElementById('load-demo').onclick = loadDemoData;
    return;
  }

  app.innerHTML = `
    <div class="page-header">
      <h1>Events</h1>
      <p>${events.length} event${events.length !== 1 ? 's' : ''}</p>
    </div>
    <div class="card-list fade-in" id="event-list"></div>
    <div style="padding:16px 0">
      <button class="btn btn-primary" id="create-event" style="width:100%">+ New Event</button>
    </div>`;

  const list = document.getElementById('event-list');
  for (const ev of events) {
    const contacts = await getContactsByEvent(ev.id);
    const companies = new Set(contacts.map(c => c.company).filter(Boolean));
    const div = document.createElement('div');
    div.className = 'event-card';
    div.innerHTML = `
      <div class="event-name">${esc(ev.name)}</div>
      <div class="event-date">${esc(ev.date || 'No date set')}</div>
      <div class="event-stats">
        <span><span class="event-stat-value">${contacts.length}</span> contacts</span>
        <span><span class="event-stat-value">${companies.size}</span> companies</span>
      </div>`;
    div.onclick = () => navigate(`/event/${ev.id}`);
    list.appendChild(div);
  }

  document.getElementById('create-event').onclick = () => showEventModal();
});

// ─── Event Detail ───
route('/event/:id', async ({ id }, app) => {
  setNav('events');
  const event = await getEvent(id);
  if (!event) return navigate('/');

  const contacts = await getContactsByEvent(id);
  const companies = {};
  contacts.forEach(c => {
    if (!companies[c.company]) companies[c.company] = [];
    companies[c.company].push(c);
  });
  const companyList = Object.keys(companies).sort();
  const tiers = { 'Tier 1': [], 'Tier 2': [], 'Tier 3': [] };
  contacts.forEach(c => {
    if (c.tier?.includes('1')) tiers['Tier 1'].push(c);
    else if (c.tier?.includes('2')) tiers['Tier 2'].push(c);
    else tiers['Tier 3'].push(c);
  });

  let viewMode = 'people'; // 'people' | 'companies'
  let searchQuery = '';
  let tierFilter = 'all';

  function render() {
    const filtered = contacts.filter(c => {
      const q = searchQuery.toLowerCase();
      const matchesSearch = !q || c.name?.toLowerCase().includes(q) || c.company?.toLowerCase().includes(q) || c.title?.toLowerCase().includes(q);
      const matchesTier = tierFilter === 'all' || c.tier?.includes(tierFilter);
      return matchesSearch && matchesTier;
    });

    const filteredCompanies = companyList.filter(name => {
      const q = searchQuery.toLowerCase();
      return !q || name.toLowerCase().includes(q) || companies[name].some(c => c.name?.toLowerCase().includes(q));
    });

    app.innerHTML = `
      <button class="back-btn" id="back">← Events</button>
      <div class="page-header" style="padding-top:4px">
        <h1>${esc(event.name)}</h1>
        <p>${esc(event.date || '')}${event.location ? ' · ' + esc(event.location) : ''}</p>
      </div>
      <div class="search-container">
        <div class="search-wrapper">
          <span class="search-icon">🔍</span>
          <input class="search-input" id="evt-search" placeholder="Search contacts or companies..." value="${esc(searchQuery)}" type="search">
        </div>
      </div>
      <div class="tab-row">
        <button class="tab-btn ${viewMode === 'people' ? 'active' : ''}" data-mode="people">People (${contacts.length})</button>
        <button class="tab-btn ${viewMode === 'companies' ? 'active' : ''}" data-mode="companies">Companies (${companyList.length})</button>
      </div>
      ${viewMode === 'people' ? `
        <div class="filter-row">
          <button class="filter-pill ${tierFilter === 'all' ? 'active' : ''}" data-tier="all">All</button>
          <button class="filter-pill ${tierFilter === '1' ? 'active' : ''}" data-tier="1">Priority (${tiers['Tier 1'].length})</button>
          <button class="filter-pill ${tierFilter === '2' ? 'active' : ''}" data-tier="2">Strong (${tiers['Tier 2'].length})</button>
          <button class="filter-pill ${tierFilter === '3' ? 'active' : ''}" data-tier="3">Lower (${tiers['Tier 3'].length})</button>
        </div>
        <div class="card-list fade-in" id="people-list">
          ${filtered.length === 0 ? '<div class="empty-state"><p class="empty-text">No matches</p></div>' :
            filtered.map(c => `
              <div class="card" data-id="${c.id}">
                <div class="card-name">${esc(c.name)}</div>
                <div class="card-subtitle">${esc(c.title)}${c.company ? ' · ' + esc(c.company) : ''}</div>
                <div class="card-meta">
                  <span class="tier-badge ${tierClass(c.tier)}">${tierLabel(c.tier)}</span>
                </div>
              </div>`).join('')}
        </div>
      ` : `
        <div class="card-list fade-in" id="company-list">
          ${filteredCompanies.length === 0 ? '<div class="empty-state"><p class="empty-text">No matches</p></div>' :
            filteredCompanies.map(name => `
              <div class="card" data-company="${esc(name)}">
                <div style="display:flex;align-items:center;gap:12px">
                  <div class="company-avatar" style="width:40px;height:40px;font-size:14px;border-radius:8px;flex-shrink:0">${companyInitials(name)}</div>
                  <div>
                    <div class="card-name">${esc(name)}</div>
                    <div class="card-subtitle">${companies[name].length} contact${companies[name].length !== 1 ? 's' : ''}</div>
                  </div>
                </div>
              </div>`).join('')}
        </div>
      `}
      <div style="padding:20px 0;display:flex;gap:8px">
        <button class="btn btn-secondary" id="import-btn" style="flex:1">Import Data</button>
        <button class="btn btn-danger" id="delete-btn">Delete</button>
      </div>`;

    // Bind events
    document.getElementById('back').onclick = () => navigate('/');
    document.getElementById('evt-search').oninput = (e) => { searchQuery = e.target.value; render(); };
    document.getElementById('evt-search').focus();

    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.onclick = () => { viewMode = btn.dataset.mode; render(); };
    });

    document.querySelectorAll('.filter-pill').forEach(btn => {
      btn.onclick = () => { tierFilter = btn.dataset.tier; render(); };
    });

    document.querySelectorAll('#people-list .card').forEach(card => {
      card.onclick = () => navigate(`/event/${id}/person/${card.dataset.id}`);
    });

    document.querySelectorAll('#company-list .card').forEach(card => {
      card.onclick = () => navigate(`/event/${id}/company/${encodeURIComponent(card.dataset.company)}`);
    });

    document.getElementById('import-btn').onclick = () => showImportModal(id);
    document.getElementById('delete-btn').onclick = async () => {
      if (confirm(`Delete "${event.name}" and all its contacts?`)) {
        await deleteEvent(id);
        navigate('/');
      }
    };
  }

  render();
});

// ─── Person Profile ───
route('/event/:eventId/person/:id', async ({ eventId, id }, app) => {
  setNav('events');
  const contact = await getContact(Number(id));
  if (!contact) return navigate(`/event/${eventId}`);
  const event = await getEvent(eventId);

  app.innerHTML = `
    <button class="back-btn" id="back">← ${esc(event?.name || 'Back')}</button>
    <div class="profile-header fade-in">
      <div class="profile-avatar">${initials(contact.name)}</div>
      <div class="profile-name">${esc(contact.name)}</div>
      <div class="profile-title">${esc(contact.title)}</div>
      <div class="profile-company" id="go-company">${esc(contact.company)}</div>
      <div style="margin-top:8px">
        <span class="tier-badge ${tierClass(contact.tier)}">${esc(contact.tier)}</span>
      </div>
    </div>

    ${section('Crib Equity Angle', contact.cribEquityAngle)}
    ${section('Role Context', contact.roleContext)}
    ${section('RE / Structured Finance', contact.reParticipation)}
    ${section('Company Overview', contact.companyDescription)}
  `;

  document.getElementById('back').onclick = () => navigate(`/event/${eventId}`);
  document.getElementById('go-company').onclick = () => navigate(`/event/${eventId}/company/${encodeURIComponent(contact.company)}`);
});

// ─── Company Profile ───
route('/event/:eventId/company/:name', async ({ eventId, name }, app) => {
  setNav('events');
  const event = await getEvent(eventId);
  const allContacts = await getContactsByEvent(eventId);
  const companyContacts = allContacts.filter(c => c.company === name);
  if (companyContacts.length === 0) return navigate(`/event/${eventId}`);

  const desc = companyContacts[0].companyDescription;
  const reParticipation = companyContacts[0].reParticipation;
  const angle = companyContacts[0].cribEquityAngle;

  app.innerHTML = `
    <button class="back-btn" id="back">← ${esc(event?.name || 'Back')}</button>
    <div class="profile-header fade-in">
      <div class="company-avatar">${companyInitials(name)}</div>
      <div class="company-name">${esc(name)}</div>
      <div class="people-count">${companyContacts.length} contact${companyContacts.length !== 1 ? 's' : ''} at this event</div>
    </div>

    ${section('Company Overview', desc)}
    ${section('Crib Equity Angle', angle)}
    ${section('RE / Structured Finance', reParticipation)}

    <div class="info-section">
      <div class="info-section-title">People at ${esc(name)}</div>
      <div class="card-list" id="company-people">
        ${companyContacts.map(c => `
          <div class="card" data-id="${c.id}">
            <div class="card-name">${esc(c.name)}</div>
            <div class="card-subtitle">${esc(c.title)}</div>
            <div class="card-meta">
              <span class="tier-badge ${tierClass(c.tier)}">${tierLabel(c.tier)}</span>
            </div>
          </div>`).join('')}
      </div>
    </div>`;

  document.getElementById('back').onclick = () => navigate(`/event/${eventId}`);
  document.querySelectorAll('#company-people .card').forEach(card => {
    card.onclick = () => navigate(`/event/${eventId}/person/${card.dataset.id}`);
  });
});

// ─── Global Search ───
route('/search', async (params, app) => {
  setNav('search');
  const events = await getEvents();
  let allContacts = [];
  for (const ev of events) {
    const contacts = await getContactsByEvent(ev.id);
    contacts.forEach(c => c._eventId = ev.id);
    allContacts.push(...contacts);
  }

  let query = '';

  function render() {
    const q = query.toLowerCase();
    const matchedPeople = q ? allContacts.filter(c =>
      c.name?.toLowerCase().includes(q) || c.title?.toLowerCase().includes(q) || c.company?.toLowerCase().includes(q)
    ).slice(0, 20) : [];

    const matchedCompanies = q ? [...new Set(allContacts.filter(c =>
      c.company?.toLowerCase().includes(q)
    ).map(c => JSON.stringify({ name: c.company, eventId: c._eventId })))].map(s => JSON.parse(s)).slice(0, 15) : [];

    app.innerHTML = `
      <div class="page-header"><h1>Search</h1><p>Across all events</p></div>
      <div class="search-container">
        <div class="search-wrapper">
          <span class="search-icon">🔍</span>
          <input class="search-input" id="global-search" placeholder="Name, company, or title..." value="${esc(query)}" type="search" autofocus>
        </div>
      </div>
      ${!q ? `
        <div class="empty-state">
          <div class="empty-icon">🔍</div>
          <p class="empty-text">Search across all your events</p>
        </div>
      ` : `
        ${matchedPeople.length > 0 ? `
          <div class="info-section">
            <div class="info-section-title">People</div>
            <div class="card-list" id="search-people">
              ${matchedPeople.map(c => `
                <div class="card" data-event="${c._eventId}" data-id="${c.id}">
                  <div class="card-name">${esc(c.name)}</div>
                  <div class="card-subtitle">${esc(c.title)} · ${esc(c.company)}</div>
                  <div class="card-meta">
                    <span class="tier-badge ${tierClass(c.tier)}">${tierLabel(c.tier)}</span>
                  </div>
                </div>`).join('')}
            </div>
          </div>
        ` : ''}
        ${matchedCompanies.length > 0 ? `
          <div class="info-section">
            <div class="info-section-title">Companies</div>
            <div class="card-list" id="search-companies">
              ${matchedCompanies.map(c => `
                <div class="card" data-event="${c.eventId}" data-company="${esc(c.name)}">
                  <div style="display:flex;align-items:center;gap:12px">
                    <div class="company-avatar" style="width:36px;height:36px;font-size:13px;border-radius:8px;flex-shrink:0">${companyInitials(c.name)}</div>
                    <div class="card-name">${esc(c.name)}</div>
                  </div>
                </div>`).join('')}
            </div>
          </div>
        ` : ''}
        ${matchedPeople.length === 0 && matchedCompanies.length === 0 ? `
          <div class="empty-state"><p class="empty-text">No results for "${esc(query)}"</p></div>
        ` : ''}
      `}`;

    const input = document.getElementById('global-search');
    input.oninput = (e) => { query = e.target.value; render(); };
    // Keep cursor at end
    input.setSelectionRange(query.length, query.length);

    document.querySelectorAll('#search-people .card').forEach(card => {
      card.onclick = () => navigate(`/event/${card.dataset.event}/person/${card.dataset.id}`);
    });
    document.querySelectorAll('#search-companies .card').forEach(card => {
      card.onclick = () => navigate(`/event/${card.dataset.event}/company/${encodeURIComponent(card.dataset.company)}`);
    });
  }

  render();
});

// ─── Settings ───
route('/settings', (params, app) => {
  setNav('settings');
  app.innerHTML = `
    <div class="page-header"><h1>Settings</h1></div>
    <div class="fade-in">
      <div class="info-section">
        <div class="info-section-title">About</div>
        <div class="info-section-body">
          <p><strong>ConferenceKit</strong> — your networking companion.</p>
          <p style="margin-top:8px;color:var(--text-muted);font-size:13px">
            All data is stored locally in your browser. Nothing is sent to any server.
            Works offline after first load.
          </p>
        </div>
      </div>
      <div class="info-section">
        <div class="info-section-title">Data</div>
        <div class="info-section-body" style="font-size:14px;color:var(--text-muted)">
          <p>Your data lives in IndexedDB in this browser. To move data to another device, export your spreadsheet and re-import it.</p>
        </div>
      </div>
      <div class="info-section">
        <div class="info-section-title">Template Format</div>
        <div class="info-section-body" style="font-size:14px;color:var(--text-muted)">
          <p>Import .xlsx or .csv with these columns:</p>
          <ul style="margin:8px 0 0 16px;list-style:disc">
            <li>Name</li>
            <li>Title</li>
            <li>Company</li>
            <li>Outreach Tier</li>
            <li>Company Description</li>
            <li>Crib Equity Angle (or "Pitch")</li>
            <li>Role Context</li>
          </ul>
          <p style="margin-top:8px">Column names are matched flexibly — the importer will try to map common variations.</p>
        </div>
      </div>
    </div>`;
});

// ─── Helpers ───
function section(title, content) {
  if (!content) return '';
  return `
    <div class="info-section">
      <div class="info-section-title">${esc(title)}</div>
      <div class="info-section-body">${esc(content)}</div>
    </div>`;
}

// ─── Event Modal ───
function showEventModal(existing = null) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal-content">
      <div class="modal-title">${existing ? 'Edit Event' : 'New Event'}</div>
      <div class="form-field">
        <label class="form-label">Event Name</label>
        <input class="form-input" id="modal-name" placeholder="e.g. IMN Conference 2025" value="${esc(existing?.name || '')}">
      </div>
      <div class="form-field">
        <label class="form-label">Date</label>
        <input class="form-input" id="modal-date" type="date" value="${existing?.date || ''}">
      </div>
      <div class="form-field">
        <label class="form-label">Location</label>
        <input class="form-input" id="modal-location" placeholder="e.g. Miami, FL" value="${esc(existing?.location || '')}">
      </div>
      <div style="display:flex;gap:8px;margin-top:20px">
        <button class="btn btn-secondary" id="modal-cancel" style="flex:1">Cancel</button>
        <button class="btn btn-primary" id="modal-save" style="flex:1">${existing ? 'Save' : 'Create'}</button>
      </div>
    </div>`;

  document.body.appendChild(overlay);
  overlay.querySelector('#modal-name').focus();

  overlay.querySelector('#modal-cancel').onclick = () => overlay.remove();
  overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };

  overlay.querySelector('#modal-save').onclick = async () => {
    const name = document.getElementById('modal-name').value.trim();
    if (!name) return;
    const event = existing || {};
    event.name = name;
    event.date = document.getElementById('modal-date').value;
    event.location = document.getElementById('modal-location').value.trim();
    const saved = await saveEvent(event);
    overlay.remove();
    navigate(`/event/${saved.id}`);
  };
}

// ─── Import Modal ───
function showImportModal(eventId) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal-content">
      <div class="modal-title">Import Contacts</div>
      <div class="import-zone" id="drop-zone">
        <div class="import-icon">📄</div>
        <div class="import-text">Tap to select a file</div>
        <div class="import-hint">.xlsx or .csv</div>
        <input type="file" id="file-input" accept=".xlsx,.csv,.xls" style="display:none">
      </div>
      <div id="import-status" style="margin-top:12px;font-size:14px;color:var(--text-muted)"></div>
      <div style="margin-top:16px">
        <button class="btn btn-secondary" id="import-cancel" style="width:100%">Cancel</button>
      </div>
    </div>`;

  document.body.appendChild(overlay);

  const dropZone = overlay.querySelector('#drop-zone');
  const fileInput = overlay.querySelector('#file-input');
  const status = overlay.querySelector('#import-status');

  dropZone.onclick = () => fileInput.click();
  overlay.querySelector('#import-cancel').onclick = () => overlay.remove();
  overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };

  dropZone.ondragover = (e) => { e.preventDefault(); dropZone.classList.add('dragover'); };
  dropZone.ondragleave = () => dropZone.classList.remove('dragover');
  dropZone.ondrop = (e) => { e.preventDefault(); dropZone.classList.remove('dragover'); handleFile(e.dataTransfer.files[0]); };

  fileInput.onchange = () => { if (fileInput.files[0]) handleFile(fileInput.files[0]); };

  async function handleFile(file) {
    status.textContent = 'Parsing...';
    try {
      let contacts;
      if (file.name.endsWith('.csv')) {
        const text = await file.text();
        contacts = parseCSV(text);
      } else {
        contacts = await parseXLSX(file);
      }
      if (contacts.length === 0) {
        status.textContent = 'No valid contacts found. Check column headers.';
        return;
      }
      status.textContent = `Found ${contacts.length} contacts. Saving...`;
      await clearContactsForEvent(eventId);
      await saveContacts(eventId, contacts);
      status.innerHTML = `<span style="color:#22c55e">✓ Imported ${contacts.length} contacts</span>`;
      setTimeout(() => { overlay.remove(); navigate(`/event/${eventId}`); }, 800);
    } catch (e) {
      status.textContent = `Error: ${e.message}`;
      console.error(e);
    }
  }
}

// ─── Demo Data Loader ───
async function loadDemoData() {
  const event = await saveEvent({
    name: 'IMN Conference 2025',
    date: '2025-04-10',
    location: 'Miami, FL',
  });
  const seed = await getSeedData();
  await saveContacts(event.id, seed.map(c => ({ ...c })));
  navigate(`/event/${event.id}`);
}

// ─── Boot ───
renderNav();
start();

// Register service worker
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
