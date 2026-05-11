import { updateLoadingScreen } from '../helpers/helper.js';

// Worker for offloading image processing to prevent UI blocking
let processingWorker = null;

/**
 * Initialize the worker thread for image processing
 */
function getOrCreateWorker() {
   if (!processingWorker) {
      // Import the worker script
      processingWorker = new Worker(
         new URL('./image-processor.worker.js', import.meta.url),
         { type: 'module' }
      );
   }
   return processingWorker;
}

/**
 * Wait for OpenCV.js to load (checks cv global object)
 */
/* function waitForOpenCV(timeout = 30000) {
   return new Promise((resolve, reject) => {
      const startTime = Date.now();

      const check = () => {
         if (typeof cv !== 'undefined' && cv.Mat) {
            resolve();
         } else if (Date.now() - startTime > timeout) {
            reject(new Error('OpenCV.js failed to load'));
         } else {
            setTimeout(check, 100);
         }
      };

      check();
   });
} */

/**
 * Check if image is HEIC format and convert to JPG if needed
 */
export async function convertHeicToJpgIfNeeded(imageBlob) {
   // Check if file is HEIC
   const type = imageBlob.type?.toLowerCase() || '';
   const name = imageBlob.name?.toLowerCase() || '';

   const isHeicType = type.includes('heic') || type.includes('heif');
   const isHeicName = name.endsWith('.heic') || name.endsWith('.heif');

   if (!isHeicType && !isHeicName) {
      return imageBlob;
   }

   try {
      if (typeof heic2any === 'undefined') {
         console.warn('heic2any not available, using HEIC as-is');
         return imageBlob;
      }

      // Convert HEIC to JPEG
      const jpegBlob = await heic2any({ blob: imageBlob, toType: 'image/jpeg', quality: 1.0 });
      return jpegBlob;
   } catch (error) {
      console.error('HEIC conversion failed:', error);
      return imageBlob; // Fall back to original
   }
}

/**
 * Process cap image: detect circle, extract color, crop
 * Offloaded to worker to keep main thread responsive
 * Respects the useAutoCapFinder setting from userSettings
 */
export async function processCapImage(imageBlob) {
   // Check if auto cap finder is enabled
   const useAutoCapFinder = await getSetting('useAutoCapFinder');

   // Show the user that processing started
   updateLoadingScreen('Processing cap image...');

   try {
      // Wait for OpenCV to load in main thread (needed by worker)
      //await waitForOpenCV();

      // Send to worker for processing
      const result = await processInWorker(imageBlob, useAutoCapFinder);

      return result;
   } catch (error) {
      console.warn('Worker processing failed:', error);
      // Fallback to simple extraction if worker fails
      return await processWithColorExtraction(imageBlob);
   }
}

/**
 * Process image in worker thread
 * Uses transferable objects for zero-copy blob transfer
 */
function processInWorker(imageBlob, useAutoCapFinder) {
   return new Promise((resolve, reject) => {
      try {
         const worker = getOrCreateWorker();

         // One-time message handler for this task
         const handleMessage = (event) => {
            worker.removeEventListener('message', handleMessage);
            worker.removeEventListener('error', handleError);

            if (event.data.success) {
               resolve(event.data.result);
            } else {
               reject(new Error(event.data.error || 'Worker processing failed'));
            }
         };

         const handleError = (error) => {
            worker.removeEventListener('message', handleMessage);
            worker.removeEventListener('error', handleError);
            reject(error);
         };

         worker.addEventListener('message', handleMessage);
         worker.addEventListener('error', handleError);

         // Send image to worker
         // Note: Blobs are not transferable, so they are cloned instead
         // This is fine since they are already compressed (JPG/PNG)
         worker.postMessage({
            imageBlob,
            useAutoCapFinder,
         });
      } catch (error) {
         reject(error);
      }
   });
}

/**
 * Helper function to get user settings
 */
async function getSetting(settingKey) {
   try {
      // Import dynamically to avoid circular imports
      const storeModule = await import('./store.js');
      return storeModule.store.userSettings[settingKey];
   } catch (error) {
      console.warn('Failed to get setting:', error);
      return true; // Default to enabled
   }
}

/**
 * Fallback: Process with simple color extraction (when worker unavailable)
 */
async function processWithColorExtraction(imageBlob) {
   updateLoadingScreen('Extracting dominant color of the cap...');
   const bitmap = await createImageBitmap(imageBlob);

   // Sample the center for dominant color
   const canvas = document.createElement('canvas');
   canvas.width = 50;
   canvas.height = 50;

   const ctx = canvas.getContext('2d');
   const scale = Math.min(bitmap.width, bitmap.height) / 50;
   const offsetX = (bitmap.width - 50 * scale) / 2;
   const offsetY = (bitmap.height - 50 * scale) / 2;

   ctx.drawImage(bitmap, offsetX, offsetY, 50 * scale, 50 * scale, 0, 0, 50, 50);

   const imageData = ctx.getImageData(0, 0, 50, 50);
   const data = imageData.data;

   let r = 0, g = 0, b = 0;
   for (let i = 0; i < data.length; i += 4) {
      r += data[i];
      g += data[i + 1];
      b += data[i + 2];
   }

   const count = data.length / 4;
   r = Math.round(r / count);
   g = Math.round(g / count);
   b = Math.round(b / count);

   const capColor = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;

   // Return original image for full quality, only use small sample for color
   return new Promise(resolve => {
      resolve({
         imageBlob: imageBlob, // Keep original quality
         capColor,
         detected: false,
      });
   });
}