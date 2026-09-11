const DB_NAME = 'frescoop_offline';
const DB_VERSION = 2;
const STORES = ['dossiers', 'evidence', 'cashflow', 'agricultural_project', 'debts', 'attachments', 'sync_queue'];

let db = null;

function openDb() {
  return new Promise((resolve, reject) => {
    if (db) return resolve(db);
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const idb = e.target.result;
      for (const store of STORES) {
        if (!idb.objectStoreNames.contains(store)) {
          idb.createObjectStore(store, { keyPath: 'id' });
        }
      }
    };
    req.onsuccess = (e) => { db = e.target.result; resolve(db); };
    req.onerror = () => reject(req.error);
  });
}

async function getStore(storeName, mode = 'readonly') {
  const idb = await openDb();
  return idb.transaction(storeName, mode).objectStore(storeName);
}

export async function saveDossierOffline(dossier) {
  const store = await getStore('dossiers', 'readwrite');
  return new Promise((resolve, reject) => {
    const req = store.put({ ...dossier, _offline: true, _timestamp: Date.now() });
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function getDossiersOffline() {
  const store = await getStore('dossiers');
  return new Promise((resolve, reject) => {
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function getDossierOffline(id) {
  const store = await getStore('dossiers');
  return new Promise((resolve, reject) => {
    const req = store.get(id);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function updateDossierOffline(id, changes) {
  const current = await getDossierOffline(id);
  if (!current) throw new Error('Dossier hors connexion introuvable');
  const updated = {
    ...current,
    ...changes,
    id,
    _offline: true,
    _timestamp: Date.now(),
    updated_at: new Date().toISOString(),
  };
  await saveDossierOffline(updated);
  return updated;
}

export async function saveEvidenceOffline(evidence) {
  const store = await getStore('evidence', 'readwrite');
  return new Promise((resolve, reject) => {
    const req = store.put({ ...evidence, _offline: true, _timestamp: Date.now() });
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function deleteEvidenceOffline(id) {
  const idb = await openDb();
  const tx = idb.transaction(['evidence', 'attachments'], 'readwrite');
  tx.objectStore('evidence').delete(id);
  tx.objectStore('attachments').delete(id);
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export async function getEvidenceOffline(dossierId) {
  const store = await getStore('evidence');
  return new Promise((resolve, reject) => {
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result.filter(e => e.dossier_id === dossierId));
    req.onerror = () => reject(req.error);
  });
}

export async function addToSyncQueue(operation) {
  const store = await getStore('sync_queue', 'readwrite');
  const entry = {
    id: crypto.randomUUID(),
    ...operation,
    local_timestamp: new Date().toISOString(),
    status: 'pending',
    retry_count: 0,
  };
  return new Promise((resolve, reject) => {
    const req = store.put(entry);
    req.onsuccess = () => resolve(entry);
    req.onerror = () => reject(req.error);
  });
}

export async function getSyncQueue() {
  const store = await getStore('sync_queue');
  return new Promise((resolve, reject) => {
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result.filter(e => e.status === 'pending'));
    req.onerror = () => reject(req.error);
  });
}

export async function markSynced(id) {
  const store = await getStore('sync_queue', 'readwrite');
  return new Promise((resolve, reject) => {
    const getReq = store.get(id);
    getReq.onsuccess = () => {
      const entry = getReq.result;
      if (entry) {
        entry.status = 'synced';
        const putReq = store.put(entry);
        putReq.onsuccess = () => resolve();
        putReq.onerror = () => reject(putReq.error);
      } else resolve();
    };
    getReq.onerror = () => reject(getReq.error);
  });
}

export async function clearSyncedItems() {
  const store = await getStore('sync_queue', 'readwrite');
  return new Promise((resolve, reject) => {
    const req = store.getAll();
    req.onsuccess = () => {
      const synced = req.result.filter(e => e.status === 'synced');
      const tx = store.transaction || db.transaction('sync_queue', 'readwrite');
      const writeStore = tx.objectStore ? tx.objectStore('sync_queue') : store;
      for (const item of synced) {
        writeStore.delete(item.id);
      }
      resolve(synced.length);
    };
    req.onerror = () => reject(req.error);
  });
}

export function isOnline() {
  return navigator.onLine;
}

export function onConnectivityChange(callback) {
  const handleOnline = () => callback(true);
  const handleOffline = () => callback(false);
  window.addEventListener('online', handleOnline);
  window.addEventListener('offline', handleOffline);
  return () => {
    window.removeEventListener('online', handleOnline);
    window.removeEventListener('offline', handleOffline);
  };
}
