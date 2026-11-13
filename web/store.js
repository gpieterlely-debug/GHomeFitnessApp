// On-device storage (IndexedDB). Nothing leaves the phone unless you export a backup.
const DB = 'rectus-recovery';
let dbp;

function db() {
  dbp ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore('kv');
      req.result.createObjectStore('docs');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbp;
}

async function tx(store, mode, fn) {
  const d = await db();
  return new Promise((resolve, reject) => {
    const t = d.transaction(store, mode);
    const req = fn(t.objectStore(store));
    t.oncomplete = () => resolve(req?.result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

export const loadRecord = () => tx('kv', 'readonly', (s) => s.get('record'));
export const saveRecord = (r) => tx('kv', 'readwrite', (s) => s.put(r, 'record'));
export const putDoc = (id, blob) => tx('docs', 'readwrite', (s) => s.put(blob, id));
export const getDoc = (id) => tx('docs', 'readonly', (s) => s.get(id));
export const allDocIds = () => tx('docs', 'readonly', (s) => s.getAllKeys());

/** Asks the browser not to evict data under storage pressure. */
export async function persist() {
  try {
    if (navigator.storage?.persisted && (await navigator.storage.persisted())) return true;
    return (await navigator.storage?.persist?.()) ?? false;
  } catch { return false; }
}

const toDataURL = (blob) => new Promise((res, rej) => {
  const fr = new FileReader();
  fr.onload = () => res(fr.result);
  fr.onerror = () => rej(fr.error);
  fr.readAsDataURL(blob);
});

/** Full backup: record + every stored document, as one JSON file. */
export async function exportBackup(record) {
  const docs = {};
  for (const id of await allDocIds()) {
    const b = await getDoc(id);
    if (b) docs[id] = await toDataURL(b);
  }
  return new Blob([JSON.stringify({ app: 'rectus-recovery', version: 1, exportedAt: new Date().toISOString(), record, docs })],
    { type: 'application/json' });
}

export async function importBackup(file) {
  const data = JSON.parse(await file.text());
  if (data.app !== 'rectus-recovery' || !data.record) throw new Error('This is not a Rectus Recovery backup file.');
  for (const [id, url] of Object.entries(data.docs ?? {})) await putDoc(id, await (await fetch(url)).blob());
  return data.record;
}
