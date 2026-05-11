// ── IndexDB wrapper for persistent local storage ───────────────────────────

import * as Modal from '../ui/modal.js';

const DB_NAME = 'BottleCapGallery';
const STORE_NAME = 'appData';
const DB_VERSION = 1;
const STORAGE_WARNING_THRESHOLD = 0.9; // Warn at 90% of quota

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
 * Estimate the size of a JavaScript object in bytes
 */
function estimateObjectSize(obj) {
   const objectList = [];
   const stack = [obj];
   let bytes = 0;

   while (stack.length) {
      let value = stack.pop();

      if (typeof value === 'boolean') {
         bytes += 4;
      } else if (typeof value === 'string') {
         bytes += value.length * 2;
      } else if (typeof value === 'number') {
         bytes += 8;
      } else if (typeof value === 'object' && value !== null) {
         if (objectList.indexOf(value) === -1) {
            objectList.push(value);

            if (Array.isArray(value)) {
               stack.push(...value);
            } else {
               stack.push(...Object.values(value));
            }
         }
      }
   }
   return bytes;
}

/**
 * Get current storage usage and quota
 */
export async function getStorageInfo() {
   if (navigator.storage && navigator.storage.estimate) {
      return await navigator.storage.estimate();
   }
   return null;
}

/**
 * Check if saving data would exceed storage limit
 */
export async function checkStorageLimit(data) {
   try {
      const storageInfo = await getStorageInfo();
      if (!storageInfo) return { canSave: true, reason: null };

      const { usage, quota } = storageInfo;
      const dataSize = estimateObjectSize(data);
      const projectedUsage = usage + dataSize;
      const usagePercent = projectedUsage / quota;

      // If would exceed quota
      if (projectedUsage > quota) {
         return {
            canSave: false,
            reason: 'quota_exceeded',
            usage,
            quota,
            projectedUsage,
            usagePercent: Math.min(100, Math.round(usagePercent * 100))
         };
      }

      // If would exceed threshold
      if (usagePercent >= STORAGE_WARNING_THRESHOLD) {
         return {
            canSave: true,
            reason: 'quota_warning',
            usage,
            quota,
            projectedUsage,
            usagePercent: Math.round(usagePercent * 100)
         };
      }

      return {
         canSave: true,
         reason: null,
         usage,
         quota,
         projectedUsage,
         usagePercent: Math.round(usagePercent * 100)
      };
   } catch (error) {
      console.warn('Could not check storage quota:', error);
      return { canSave: true, reason: null };
   }
}

/**
 * Format bytes to human readable size
 */
function formatBytes(bytes) {
   if (bytes === 0) return '0 Bytes';
   const k = 1024;
   const sizes = ['Bytes', 'KB', 'MB', 'GB'];
   const i = Math.floor(Math.log(bytes) / Math.log(k));
   return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}

/**
 * Save data to IndexDB with storage limit checking
 */
export async function saveToIndexDB(key, data) {
   if (!db) await initIndexDB();

   // Check storage limit before attempting save
   const storageCheck = await checkStorageLimit(data);

   if (!storageCheck.canSave) {
      // Storage quota exceeded - notify user and abort save
      const usedSpace = formatBytes(storageCheck.usage);
      const totalSpace = formatBytes(storageCheck.quota);

      await Modal.confirm({
         question: `Storage Limit Reached. Your data was not saved because the app has reached its storage limit. Used: ${usedSpace} / ${totalSpace}. Please delete some items first.`,
         yesLabel: 'OK',
         headerText: 'Storage almost full'
      });

      const error = new Error('Storage quota exceeded');
      error.code = 'QUOTA_EXCEEDED_ERR';
      throw error;
   }

   // Warn if approaching limit (but still allow save)
   if (storageCheck.reason === 'quota_warning') {
      console.warn(`Storage usage at ${storageCheck.usagePercent}% of quota`);
   }

   return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.put(data, key);

      request.onerror = () => {
         const error = request.error;
         // Check if it's a quota error
         if (error.name === 'QuotaExceededError' || error.code === 22) {
            Modal.confirm({
               question: `Storage Limit Reached\n\nYour data was not saved because the app storage is full.\n\nPlease delete some items to free up space.`,
               yesLabel: 'OK',
               noLabel: null,
               headerText: 'Storage Full'
            }).then(() => {
               reject(error);
            });
         } else {
            reject(error);
         }
      };
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
