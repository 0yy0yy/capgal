/**
 * Hough Circles Worker Manager
 * 
 * Manages a long-lived Web Worker for circle detection.
 * Initializes early when app starts to load OpenCV in worker context.
 * Reuses the same worker for all operations.
 */
import { updateLoadingScreen, hideLoadingScreen } from '../helpers/helper.js';

let worker = null;
let isInitialized = false;
let pendingTasks = new Map();
let taskIdCounter = -1;

/**
 * Initialize the worker and load OpenCV
 * Call this as early as possible in app.js
 */
export async function initializeHoughCirclesWorker() {
   if (isInitialized) return;
   try {
      const workerUrl = new URL('../workers/hough-circles-worker.js', import.meta.url);
      worker = new Worker(workerUrl);

      // Set up message handler
      worker.onmessage = (event) => {
         const { taskId, type, status } = event.data;

         if (type === 'init' && status === 'ready') {
            isInitialized = true;
            console.log('[HoughCircles Worker] OpenCV loaded and ready');
            // Clean up the init task and resolve its promise
            if (pendingTasks.has(taskId)) {
               const { resolve, timeoutId } = pendingTasks.get(taskId);
               clearTimeout(timeoutId);
               pendingTasks.delete(taskId);
               resolve();
            }
            return;
         }

         // Handle task responses
         if (pendingTasks.has(taskId)) {
            const { resolve, reject, timeoutId } = pendingTasks.get(taskId);
            clearTimeout(timeoutId);
            pendingTasks.delete(taskId);
            if (type === 'success') {
               resolve(event.data);
            } else if (type === 'error') {
               reject(new Error(event.data.error));
            }
         }
      };

      worker.onerror = (error) => {
         console.error('[HoughCircles Worker] Error:', error);
         for (const { reject, timeoutId } of pendingTasks.values()) {
            clearTimeout(timeoutId);
            reject(error);
         }
         pendingTasks.clear();
      };

      updateLoadingScreen('Loading CV library into memory...');

      // Send init message
      return new Promise((resolve) => {
         const taskId = ++taskIdCounter;
         const timeoutId = setTimeout(() => {
            console.warn('[HoughCircles Worker] Init timeout');
            pendingTasks.delete(taskId);
            resolve();
         }, 4200);

         pendingTasks.set(taskId, { resolve, reject: () => { }, timeoutId });

         worker.postMessage({ taskId, type: 'init' });
      });
   } catch (error) {
      console.error('[HoughCircles Worker] Failed to initialize:', error);
      throw error;
   }
}

/**
 * Detect circles in a grayscale image
 * @param {object} data - Object with { pixelData: Uint8Array, width: number, height: number, params: object }
 * @param {number} timeoutMs - Timeout in milliseconds (default 10000)
 * @returns {Promise<{circlesData, detected}>}
 */
export async function detectCirclesInWorker(data, timeoutMs = 12000) {
   if (!isInitialized) {
      throw new Error('HoughCircles worker not initialized');
   }
   return new Promise((resolve, reject) => {
      const taskId = ++taskIdCounter;

      const timeoutId = setTimeout(() => {
         pendingTasks.delete(taskId);
         reject(new Error(`Circle detection timed out after ${timeoutMs / 1000}s`));
      }, timeoutMs);

      pendingTasks.set(taskId, { resolve, reject, timeoutId });

      worker.postMessage({ taskId, type: 'detectCircles', data });
   });
}

/**
 * Check if worker is initialized
 */
export function isHoughCirclesWorkerReady() {
   return isInitialized;
}

/**
 * Terminate the worker
 */
export function terminateHoughCirclesWorker() {
   if (worker) {
      worker.terminate();
      worker = null;
      isInitialized = false;
   }
}