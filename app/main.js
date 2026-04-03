import { route, start, navigate } from './router.js';
import { getEvents, getEvent, saveEvent, deleteEvent, getContact, getContactsByEvent, saveContacts, clearContactsForEvent } from './db.js';
import { html, esc, tierClass, tierLabel, initials, companyInitials, setNav } from './render.js';
import { parseXLSX, parseCSV, fetchGoogleSheet } from './xlsx-parser.js';
import { initAuth, signIn, signOut, getAccessToken, getUser, isSignedIn } from './auth.js';

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
        <p style="color:var(--text-dim);font-size:13px;margin:8px 0 20px">Create your first event or connect a Google Sheet</p>
        <button class="btn btn-primary" id="create-first">+ Create Event</button>
        <div style="margin-top:12px">
          <button class="btn btn-secondary" id="connect-sheet">Connect Google Sheet</button>
        </div>
      </div>`;
    document.getElementById('create-first').onclick = () => showEventModal();
    document.getElementById('connect-sheet').onclick = () => showGoogleSheetModal();
    return;
  }

  app.innerHTML = `
    <div class="page-header">
      <h1>Events</h1>
      <p>${events.length} event${events.length !== 1 ? 's' : ''}</p>
    </div>
    <div class="card-list fade-in" id="event-list"></div>
    <div style="padding:16px 0;display:flex;flex-direction:column;gap:8px">
      <button class="btn btn-primary" id="create-event" style="width:100%">+ New Event</button>
      <button class="btn btn-secondary" id="connect-sheet" style="width:100%">Connect Google Sheet</button>
    </div>`;

  const list = document.getElementById('event-list');
  for (const ev of events) {
    const contacts = await getContactsByEvent(ev.id);
    const companies = new Set(contacts.map(c => c.company).filter(Boolean));
    const div = document.createElement('div');
    div.className = 'event-card';
    div.innerHTML = `
      <div class="event-name">${esc(ev.name)}</div>
      <div class="event-date">${esc(formatDateRange(ev.date, ev.endDate))}${ev.location ? ' · ' + esc(ev.location) : ''}</div>
      <div class="event-stats">
        <span><span class="event-stat-value">${contacts.length}</span> contacts</span>
        <span><span class="event-stat-value">${companies.size}</span> companies</span>
      </div>`;
    div.onclick = () => navigate(`/event/${ev.id}`);
    list.appendChild(div);
  }

  document.getElementById('create-event').onclick = () => showEventModal();
  document.getElementById('connect-sheet').onclick = () => showGoogleSheetModal();
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

  let viewMode = 'people';
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

    const eventLinks = [];
    if (event.website) eventLinks.push(`<a href="${esc(event.website)}" target="_blank" rel="noopener" style="color:var(--accent);font-size:13px;text-decoration:none">Website</a>`);
    if (event.agendaUrl) eventLinks.push(`<a href="${esc(event.agendaUrl)}" target="_blank" rel="noopener" style="color:var(--accent);font-size:13px;text-decoration:none">Agenda</a>`);

    app.innerHTML = `
      <button class="back-btn" id="back">← Events</button>
      <div class="page-header" style="padding-top:4px">
        <h1>${esc(event.name)}</h1>
        <p>${esc(formatDateRange(event.date, event.endDate))}${event.location ? ' · ' + esc(event.location) : ''}</p>
        ${eventLinks.length ? `<div style="margin-top:4px;display:flex;gap:12px">${eventLinks.join('')}</div>` : ''}
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

    ${section('Talking Points', contact.talkingPoints)}
    ${section('Role Context', contact.roleContext)}
    ${section('Industry Context', contact.industryContext)}
    ${section('Company Overview', contact.companyOverview)}
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

  const overview = companyContacts[0].companyOverview;
  const industry = companyContacts[0].industryContext;
  const talking = companyContacts[0].talkingPoints;

  app.innerHTML = `
    <button class="back-btn" id="back">← ${esc(event?.name || 'Back')}</button>
    <div class="profile-header fade-in">
      <div class="company-avatar">${companyInitials(name)}</div>
      <div class="company-name">${esc(name)}</div>
      <div class="people-count">${companyContacts.length} contact${companyContacts.length !== 1 ? 's' : ''} at this event</div>
    </div>

    ${section('Company Overview', overview)}
    ${section('Talking Points', talking)}
    ${section('Industry Context', industry)}

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
  const signedIn = isSignedIn();
  const user = getUser();
  app.innerHTML = `
    <div class="page-header"><h1>Settings</h1></div>
    <div class="fade-in">
      <div class="info-section">
        <div class="info-section-title">Google Account</div>
        <div class="info-section-body">
          ${signedIn ? `
            <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px">
              <div style="width:36px;height:36px;border-radius:50%;background:var(--accent);display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:700;color:white;flex-shrink:0">${user?.name?.[0] || '?'}</div>
              <div style="flex:1;min-width:0">
                <div style="font-size:14px;font-weight:600">${esc(user?.name || 'Signed in')}</div>
                <div style="font-size:12px;color:var(--text-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(user?.email || '')}</div>
              </div>
            </div>
            <button class="btn btn-secondary" id="settings-signout" style="width:100%">Sign out</button>
          ` : `
            <p style="font-size:13px;color:var(--text-muted);margin-bottom:12px">Sign in with Google to access restricted Google Sheets.</p>
            <button class="btn btn-secondary" id="settings-signin" style="width:100%">Sign in with Google</button>
          `}
        </div>
      </div>
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
        <div class="info-section-title">Getting Started</div>
        <div class="info-section-body" style="font-size:14px;color:var(--text-muted)">
          <p><strong>Option 1: Google Sheets</strong> — <a href="https://docs.google.com/spreadsheets/d/1rl-NP8v0fuUB5AjEAKJvPJTxmukMS57obmrjvNpT--c/edit?usp=sharing" target="_blank" style="color:var(--accent)">Copy the template</a>, fill in your data, and paste the URL.</p>
          <p style="margin-top:8px"><strong>Option 2: Upload a file</strong> — Import a .xlsx or .csv file directly.</p>
        </div>
      </div>
      <div class="info-section">
        <div class="info-section-title">Template Columns</div>
        <div class="info-section-body" style="font-size:14px;color:var(--text-muted)">
          <p>Your spreadsheet needs a <strong>Contacts</strong> sheet with these columns:</p>
          <ul style="margin:8px 0 0 16px;list-style:disc">
            <li><strong>Name</strong> — contact's full name</li>
            <li><strong>Title</strong> — job title</li>
            <li><strong>Company</strong> — organization</li>
            <li><strong>Priority Tier</strong> — Tier 1/2/3</li>
            <li><strong>Company Overview</strong> — about the company</li>
            <li><strong>Industry Context</strong> — sector relevance</li>
            <li><strong>Talking Points</strong> — your pitch or notes</li>
            <li><strong>Role Context</strong> — their background</li>
          </ul>
          <p style="margin-top:8px">Optionally add an <strong>Event Info</strong> sheet with: Event Name, Start Date, End Date, Location, Conference Website, Agenda URL.</p>
          <p style="margin-top:8px;font-size:12px;color:var(--text-dim)">Column names are matched flexibly — the importer handles common variations.</p>
        </div>
      </div>
    </div>`;

  const signinBtn = document.getElementById('settings-signin');
  const signoutBtn = document.getElementById('settings-signout');
  if (signinBtn) {
    signinBtn.onclick = async () => {
      signinBtn.disabled = true;
      signinBtn.textContent = 'Signing in...';
      try {
        await signIn();
        navigate('/settings');
      } catch (e) {
        signinBtn.disabled = false;
        signinBtn.textContent = 'Sign in with Google';
      }
    };
  }
  if (signoutBtn) {
    signoutBtn.onclick = () => { signOut(); navigate('/settings'); };
  }
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

function formatDateRange(start, end) {
  if (!start) return 'No date set';
  if (!end || start === end) return start;
  return `${start} — ${end}`;
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
        <input class="form-input" id="modal-name" placeholder="e.g. SFVegas 2025" value="${esc(existing?.name || '')}">
      </div>
      <div style="display:flex;gap:8px">
        <div class="form-field" style="flex:1">
          <label class="form-label">Start Date</label>
          <input class="form-input" id="modal-date" type="date" value="${existing?.date || ''}">
        </div>
        <div class="form-field" style="flex:1">
          <label class="form-label">End Date</label>
          <input class="form-input" id="modal-end-date" type="date" value="${existing?.endDate || ''}">
        </div>
      </div>
      <div class="form-field">
        <label class="form-label">Location</label>
        <input class="form-input" id="modal-location" placeholder="e.g. Las Vegas, NV" value="${esc(existing?.location || '')}">
      </div>
      <div class="form-field">
        <label class="form-label">Conference Website</label>
        <input class="form-input" id="modal-website" type="url" placeholder="https://..." value="${esc(existing?.website || '')}">
      </div>
      <div class="form-field">
        <label class="form-label">Agenda URL</label>
        <input class="form-input" id="modal-agenda" type="url" placeholder="https://..." value="${esc(existing?.agendaUrl || '')}">
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
    event.endDate = document.getElementById('modal-end-date').value;
    event.location = document.getElementById('modal-location').value.trim();
    event.website = document.getElementById('modal-website').value.trim();
    event.agendaUrl = document.getElementById('modal-agenda').value.trim();
    const saved = await saveEvent(event);
    overlay.remove();
    navigate(`/event/${saved.id}`);
  };
}

// ─── Google Sheet Modal ───
function showGoogleSheetModal() {
  const signedIn = isSignedIn();
  const user = getUser();
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal-content">
      <div class="modal-title">Connect Google Sheet</div>
      <div id="auth-section" style="margin-bottom:16px">
        ${signedIn ? `
          <div style="display:flex;align-items:center;gap:10px;padding:10px 14px;background:rgba(34,197,94,0.1);border-radius:8px;margin-bottom:8px">
            <div style="width:28px;height:28px;border-radius:50%;background:var(--accent);display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;color:white;flex-shrink:0">${user?.name?.[0] || '?'}</div>
            <div style="flex:1;min-width:0">
              <div style="font-size:13px;font-weight:600;color:#22c55e">Signed in</div>
              <div style="font-size:12px;color:var(--text-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(user?.email || '')}</div>
            </div>
          </div>
          <p style="font-size:12px;color:var(--text-dim)">You can access any sheet shared with your Google account.</p>
        ` : `
          <button class="btn btn-secondary" id="google-signin" style="width:100%;margin-bottom:8px">Sign in with Google</button>
          <p style="font-size:12px;color:var(--text-dim)">Sign in to access restricted sheets, or paste a public link below without signing in.</p>
        `}
      </div>
      <p style="font-size:12px;color:var(--text-dim);margin-bottom:12px">Need a template? <a href="https://docs.google.com/spreadsheets/d/1rl-NP8v0fuUB5AjEAKJvPJTxmukMS57obmrjvNpT--c/edit?usp=sharing" target="_blank" style="color:var(--accent)">Copy the Google Sheets template</a></p>
      <div class="form-field">
        <label class="form-label">Google Sheet URL</label>
        <input class="form-input" id="sheet-url" placeholder="Paste your Google Sheets link..." type="url">
      </div>
      <div id="sheet-status" style="font-size:14px;color:var(--text-muted);margin-bottom:12px"></div>
      <div style="display:flex;gap:8px">
        <button class="btn btn-secondary" id="sheet-cancel" style="flex:1">Cancel</button>
        <button class="btn btn-primary" id="sheet-connect" style="flex:1">Connect</button>
      </div>
    </div>`;

  document.body.appendChild(overlay);
  overlay.querySelector('#sheet-url').focus();

  overlay.querySelector('#sheet-cancel').onclick = () => overlay.remove();
  overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };

  const signinBtn = overlay.querySelector('#google-signin');
  if (signinBtn) {
    signinBtn.onclick = async () => {
      signinBtn.disabled = true;
      signinBtn.textContent = 'Signing in...';
      try {
        await signIn();
        overlay.remove();
        showGoogleSheetModal();
      } catch (e) {
        signinBtn.disabled = false;
        signinBtn.textContent = 'Sign in with Google';
        document.getElementById('sheet-status').textContent = `Sign-in failed: ${e.message}`;
      }
    };
  }

  overlay.querySelector('#sheet-connect').onclick = async () => {
    const url = document.getElementById('sheet-url').value.trim();
    if (!url) return;
    const status = document.getElementById('sheet-status');
    const btn = document.getElementById('sheet-connect');
    btn.disabled = true;
    btn.textContent = 'Loading...';
    status.textContent = 'Fetching sheet data...';

    try {
      const { contacts, eventInfo } = await fetchGoogleSheet(url, getAccessToken());

      // Create event from sheet info or defaults
      const event = {
        name: eventInfo?.name || 'Imported Event',
        date: eventInfo?.date || '',
        endDate: eventInfo?.endDate || '',
        location: eventInfo?.location || '',
        website: eventInfo?.website || '',
        agendaUrl: eventInfo?.agendaUrl || '',
        sheetUrl: url,
      };

      const saved = await saveEvent(event);
      await saveContacts(saved.id, contacts);

      status.innerHTML = `<span style="color:#22c55e">✓ Imported ${contacts.length} contacts</span>`;
      setTimeout(() => { overlay.remove(); navigate(`/event/${saved.id}`); }, 800);
    } catch (e) {
      status.textContent = `Error: ${e.message}`;
      btn.disabled = false;
      btn.textContent = 'Connect';
    }
  };
}

// ─── Import Modal ───
function showImportModal(eventId) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal-content">
      <div class="modal-title">Import Contacts</div>
      <div class="tab-row" style="margin-bottom:16px">
        <button class="tab-btn active" data-tab="file">Upload File</button>
        <button class="tab-btn" data-tab="sheet">Google Sheet</button>
      </div>
      <div id="tab-file">
        <div class="import-zone" id="drop-zone">
          <div class="import-icon">📄</div>
          <div class="import-text">Tap to select a file</div>
          <div class="import-hint">.xlsx or .csv</div>
          <input type="file" id="file-input" accept=".xlsx,.csv,.xls" style="display:none">
        </div>
      </div>
      <div id="tab-sheet" style="display:none">
        <div class="form-field">
          <label class="form-label">Google Sheet URL</label>
          <input class="form-input" id="import-sheet-url" placeholder="Paste your Google Sheets link..." type="url">
        </div>
        <p style="font-size:12px;color:var(--text-dim);margin-bottom:12px">
          Sheet must be shared as "Anyone with the link can view".
        </p>
        <button class="btn btn-primary" id="import-sheet-btn" style="width:100%">Import from Sheet</button>
      </div>
      <div id="import-status" style="margin-top:12px;font-size:14px;color:var(--text-muted)"></div>
      <div style="margin-top:16px">
        <button class="btn btn-secondary" id="import-cancel" style="width:100%">Cancel</button>
      </div>
    </div>`;

  document.body.appendChild(overlay);

  // Tab switching
  overlay.querySelectorAll('.tab-btn').forEach(btn => {
    btn.onclick = () => {
      overlay.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('tab-file').style.display = btn.dataset.tab === 'file' ? '' : 'none';
      document.getElementById('tab-sheet').style.display = btn.dataset.tab === 'sheet' ? '' : 'none';
    };
  });

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

  // Google Sheet import within existing event
  overlay.querySelector('#import-sheet-btn').onclick = async () => {
    const url = document.getElementById('import-sheet-url').value.trim();
    if (!url) return;
    status.textContent = 'Fetching sheet data...';
    try {
      const { contacts, eventInfo } = await fetchGoogleSheet(url, getAccessToken());
      if (contacts.length === 0) {
        status.textContent = 'No contacts found. Check column headers.';
        return;
      }
      // Update event metadata if available
      if (eventInfo) {
        const event = await getEvent(eventId);
        if (event) {
          if (eventInfo.name && !event.name) event.name = eventInfo.name;
          if (eventInfo.website) event.website = eventInfo.website;
          if (eventInfo.agendaUrl) event.agendaUrl = eventInfo.agendaUrl;
          event.sheetUrl = url;
          await saveEvent(event);
        }
      }
      await clearContactsForEvent(eventId);
      await saveContacts(eventId, contacts);
      status.innerHTML = `<span style="color:#22c55e">✓ Imported ${contacts.length} contacts</span>`;
      setTimeout(() => { overlay.remove(); navigate(`/event/${eventId}`); }, 800);
    } catch (e) {
      status.textContent = `Error: ${e.message}`;
    }
  };

  async function handleFile(file) {
    status.textContent = 'Parsing...';
    try {
      let result;
      if (file.name.endsWith('.csv')) {
        const text = await file.text();
        result = parseCSV(text);
      } else {
        result = await parseXLSX(file);
      }
      const { contacts, eventInfo } = result;
      if (contacts.length === 0) {
        status.textContent = 'No valid contacts found. Check column headers.';
        return;
      }
      // Update event metadata if available from file
      if (eventInfo) {
        const event = await getEvent(eventId);
        if (event) {
          for (const [key, val] of Object.entries(eventInfo)) {
            if (val) event[key] = val;
          }
          await saveEvent(event);
        }
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

// ─── Boot ───
renderNav();
initAuth();
start();

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
