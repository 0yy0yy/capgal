// ── IndexDB wrapper for persistent local storage ───────────────────────────

const DB_NAME = 'BottleCapGallery';
const STORE_NAME = 'appData';
const DB_VERSION = 1;

let db = null;

/**
 * Initialize IndexDB
 */
export async function initIndexDB() {
   return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
         db = request.result;
         resolve(db);
      };

      request.onupgradeneeded = (event) => {
         const upgradeDb = event.target.result;
         if (!upgradeDb.objectStoreNames.contains(STORE_NAME)) {
            upgradeDb.createObjectStore(STORE_NAME);
         }
      };
   });
}

/**
 * Save data to IndexDB
 */
export async function saveToIndexDB(key, data) {
   if (!db) await initIndexDB();

   return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.put(data, key);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(data);
   });
}

/**
 * Load data from IndexDB
 */
export async function loadFromIndexDB(key) {
   if (!db) await initIndexDB();

   return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(key);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
   });
}

/**
 * Delete data from IndexDB
 */
export async function deleteFromIndexDB(key) {
   if (!db) await initIndexDB();

   return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.delete(key);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
   });
}

/**
 * Clear all data from IndexDB
 */
export async function clearIndexDB() {
   if (!db) await initIndexDB();

   return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.clear();

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
   });
}
