// IndexedDB 래퍼: ISS 좌표를 타임스탬프(ms)를 키로 저장한다.
const DB_NAME = 'iss-tracker';
const DB_VERSION = 1;
const STORE = 'positions';

let dbPromise;

function openDb() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE, { keyPath: 'ts' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

// 트랜잭션이 완료(commit)된 뒤에 결과를 돌려준다.
async function run(mode, fn) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    let result;
    fn(tx.objectStore(STORE), (value) => { result = value; });
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export function savePosition(pos) {
  return run('readwrite', (store) => store.put(pos));
}

export function deleteOlderThan(cutoffTs) {
  return run('readwrite', (store) => store.delete(IDBKeyRange.upperBound(cutoffTs, true)));
}

export function getPositionsSince(sinceTs) {
  return run('readonly', (store, set) => {
    const req = store.getAll(IDBKeyRange.lowerBound(sinceTs));
    req.onsuccess = () => set(req.result);
  });
}
