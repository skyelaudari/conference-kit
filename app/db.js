// IndexedDB wrapper — all data stays in the browser
const DB_NAME = 'conferencekit';
const DB_VERSION = 1;

let dbPromise = null;

function open() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('events')) {
        const events = db.createObjectStore('events', { keyPath: 'id' });
        events.createIndex('name', 'name');
      }
      if (!db.objectStoreNames.contains('contacts')) {
        const contacts = db.createObjectStore('contacts', { keyPath: 'id', autoIncrement: true });
        contacts.createIndex('eventId', 'eventId');
        contacts.createIndex('company', 'company');
        contacts.createIndex('name', 'name');
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function tx(store, mode = 'readonly') {
  const db = await open();
  return db.transaction(store, mode).objectStore(store);
}

function req(idbReq) {
  return new Promise((resolve, reject) => {
    idbReq.onsuccess = () => resolve(idbReq.result);
    idbReq.onerror = () => reject(idbReq.error);
  });
}

// Events
export async function getEvents() {
  const store = await tx('events');
  return req(store.getAll());
}

export async function getEvent(id) {
  const store = await tx('events');
  return req(store.get(id));
}

export async function saveEvent(event) {
  if (!event.id) event.id = crypto.randomUUID();
  const store = await tx('events', 'readwrite');
  await req(store.put(event));
  return event;
}

export async function deleteEvent(id) {
  // Delete event and its contacts
  const store = await tx('events', 'readwrite');
  await req(store.delete(id));
  const contacts = await getContactsByEvent(id);
  const cStore = await tx('contacts', 'readwrite');
  for (const c of contacts) {
    cStore.delete(c.id);
  }
}

// Contacts
export async function getContactsByEvent(eventId) {
  const store = await tx('contacts');
  const idx = store.index('eventId');
  return req(idx.getAll(eventId));
}

export async function getContact(id) {
  const store = await tx('contacts');
  return req(store.get(id));
}

export async function saveContacts(eventId, contacts) {
  const db = await open();
  const transaction = db.transaction('contacts', 'readwrite');
  const store = transaction.objectStore('contacts');
  for (const c of contacts) {
    c.eventId = eventId;
    store.put(c);
  }
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

export async function clearContactsForEvent(eventId) {
  const contacts = await getContactsByEvent(eventId);
  const store = await tx('contacts', 'readwrite');
  for (const c of contacts) {
    store.delete(c.id);
  }
}
