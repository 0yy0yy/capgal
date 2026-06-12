import { updateLoadingScreen } from '../helpers/helper.js';
import { detectCirclesInWorker, isHoughCirclesWorkerReady } from './hough-circles-worker-manager.js';

/**
 * Check if image is HEIC format and convert to WebP if needed
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

      // Convert HEIC to PNG
      const pngBlob = await heic2any({ blob: imageBlob, toType: 'image/png' });
      return pngBlob;
   } catch (error) {
      console.error('HEIC conversion failed:', error);
      return imageBlob; // Fall back to original
   }
}

/**
 * Process cap image: detect circle, extract color, crop
 * Respects the useAutoCapFinder setting from userSettings
 * @param {Blob} imageBlob - The image to process
 * @param {AbortSignal} signal - Optional abort signal for cancellation
 */
export async function processCapImage(imageBlob, signal = null) {
   // Check if already aborted
   if (signal?.aborted) {
      throw new DOMException('Image processing cancelled', 'AbortError');
   }

   // Check if auto cap finder is enabled
   const useAutoCapFinder = await getSetting('useAutoCapFinder');

   if (useAutoCapFinder) {
      try {
         return await detectAndProcessWithOpenCV(imageBlob, signal);
      } catch (error) {
         // Re-throw abort errors
         if (error.name === 'AbortError' || signal?.aborted) {
            throw error;
         }
         console.warn('OpenCV detection failed, falling back to color extraction:', error);
      }
   }

   // Fallback to simple color extraction
   return await processWithColorExtraction(imageBlob);
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
 * Process with OpenCV Hough circle detection using Web Worker
 * Keeps main thread responsive with countdown animation
 * @param {Blob} imageBlob - The image to process
 * @param {AbortSignal} signal - Optional abort signal for cancellation
 */
async function detectAndProcessWithOpenCV(imageBlob, signal = null) {
   const MAX_CIRCLE_DETECTION_TIME_MS = 12000; // 12 seconds max for circle detection

   // Check if already aborted
   if (signal?.aborted) {
      throw new DOMException('Image processing cancelled', 'AbortError');
   }

   try {
      // Check abort before expensive operation
      if (signal?.aborted) {
         throw new DOMException('Image processing cancelled', 'AbortError');
      }

      let capColor = '#8F8F8F';
      let processedBlob = imageBlob;
      let detected = false;
      let circle = null;

      // Try to use worker if available, otherwise fallback to main thread
      if (isHoughCirclesWorkerReady()) {
         try {
            updateLoadingScreen(`Searching for the cap in the image (${MAX_CIRCLE_DETECTION_TIME_MS / 1000} seconds max, worker)...`);

            // HoughCircles parameters
            const params = {
               dp: 1,
               minDist: 45,
               param1: 175,
               param2: 40,
               minRadius: 0,
               maxRadius: 0
            };

            // Send to worker with 12-second timeout (can kill worker thread)
            try {
               const result = await detectCirclesInWorker({
                  imageBlob,
                  params
               }, MAX_CIRCLE_DETECTION_TIME_MS);

               if (result.detected && result.circlesData) {
                  detected = true;
                  circle = result.circlesData;
               }
            } catch (workerError) {
               if (workerError.message.includes('timed out')) {
                  console.warn('Circle detection timed out, killing worker');
                  updateLoadingScreen('Circle detection timed out. Using original image...');
               } else {
                  console.warn('Worker detection failed, using fallback:', workerError);
               }
               //await initializeHoughCirclesWorker();
            }
         } catch (error) {
            console.warn('Worker-based detection failed, falling back to main thread:', error);
         }
      }

      /* // Fallback: if no circle detected, try main thread detection
      if (!detected) {
         updateLoadingScreen('Searching for the cap in the image...');

         // TODO: SMART PARAMETER ADJUSTMENT
         // Future enhancement: Analyze image properties to adjust HoughCircles parameters
         // Consider: image.rows/cols for relative sizing, histogram to detect bottle cap colors,
         // edge detection intensity to adjust Canny thresholds, etc.

         let circles = new cv.Mat();
         cv.HoughCircles(
            gray,
            circles,
            cv.HOUGH_GRADIENT,
            1,      // dp: resolution ratio
            45,     // minDist: minimum distance between circle centers
            175,    // param1: Canny edge detector upper threshold
            40,     // param2: accumulator threshold
            0,      // minRadius: 0 = no minimum
            0       // maxRadius: 0 = no maximum
         );

         if (circles.rows > 0) {
            detected = true;
            circle = [
               circles.data32F[0],
               circles.data32F[1],
               circles.data32F[2],
            ];
         }
         circles.delete();
      } */

      // Check abort before continuing with processing
      if (signal?.aborted) {
         throw new DOMException('Image processing cancelled', 'AbortError');
      }

      if (detected && circle) {
         // Crop to circle with padding
         updateLoadingScreen('Cropping image to circle...');
         processedBlob = await cropToCircle(canvas, circle);
      }

      return {
         imageBlob: processedBlob,
         capColor,
         detected,
      };
   } catch (error) {
      console.error('OpenCV processing error:', error);
      throw error;
   }
}

/**
 * Extract dominant color from detected circle
 */
function extractColorFromCircle(mat, circle, colorSpace = 'BGR') {
   const [x, y, radius] = circle;
   const r = radius * 0.9
   const roiX = x - r;
   const roiY = y - r;
   const roiSize = r * 2;

   const safeX = Math.max(0, Math.min(roiX, mat.cols - 1));
   const safeY = Math.max(0, Math.min(roiY, mat.rows - 1));
   const safeW = Math.max(1, Math.min(roiSize, mat.cols - safeX));
   const safeH = Math.max(1, Math.min(roiSize, mat.rows - safeY));

   // Snap each channel to a grid of this size for O(1) bucket lookup
   const BUCKET_SIZE = 30;
   // Buckets within this many grid steps of the winner are blended together
   const TIE_RATIO = 0.01;

   try {
      const roi = mat.roi(new cv.Rect(safeX, safeY, safeW, safeH));
      const roiRgba = new cv.Mat();

      if (colorSpace === 'RGBA') {
         roi.copyTo(roiRgba);
      } else {
         cv.cvtColor(roi, roiRgba, cv.COLOR_BGR2RGBA);
      }

      const data = roiRgba.data;          // Uint8ClampedArray
      const cols = roi.cols;
      const rows = roi.rows;
      const roiCenterX = cols / 2;
      const roiCenterY = rows / 2;
      const radiusSq = r * r;   // compare squared — no sqrt needed

      // Map<"qr,qg,qb", { r, g, b, count }>
      const buckets = new Map();

      for (let row = 0; row < rows; row++) {
         const dy = row - roiCenterY;
         const dy2 = dy * dy;
         const rowOffset = row * cols * 4;

         for (let col = 0; col < cols; col++) {
            const dx = col - roiCenterX;
            // Skip pixels outside the circle — squared distance, no sqrt
            if (dx * dx + dy2 > radiusSq) continue;

            const i = rowOffset + col * 4;
            const pr = data[i];
            const pg = data[i + 1];
            const pb = data[i + 2];

            // Quantize to nearest bucket grid point
            const qr = Math.round(pr / BUCKET_SIZE);
            const qg = Math.round(pg / BUCKET_SIZE);
            const qb = Math.round(pb / BUCKET_SIZE);
            const key = (qr << 16) | (qg << 8) | qb; // compact integer key

            const bucket = buckets.get(key);
            if (bucket) {
               bucket.count++;
               // Running average keeps accumulated color accurate
               bucket.r += (pr - bucket.r) / bucket.count;
               bucket.g += (pg - bucket.g) / bucket.count;
               bucket.b += (pb - bucket.b) / bucket.count;
            } else {
               buckets.set(key, { r: pr, g: pg, b: pb, count: 1 });
            }
         }
      }


      // debug
      /* const debugPixels = new Uint8ClampedArray(cols * rows * 4);

      for (let row = 0; row < rows; row++) {
         const dy = row - roiCenterY;
         const dy2 = dy * dy;
         const rowOffset = row * cols * 4;

         for (let col = 0; col < cols; col++) {
            const dx = col - roiCenterX;
            const i = rowOffset + col * 4;

            // Outside circle -> transparent
            if (dx * dx + dy2 > radiusSq) {
               debugPixels[i + 3] = 0;
               continue;
            }

            // Copy processed pixel
            debugPixels[i] = data[i];
            debugPixels[i + 1] = data[i + 1];
            debugPixels[i + 2] = data[i + 2];
            debugPixels[i + 3] = 255;
         }
      }
      const imageData = new ImageData(debugPixels, cols, rows);
      const debugMat = cv.matFromImageData(imageData);
      cv.imshow('circlesOutput', debugMat);
      debugMat.delete(); */
      // --

      roi.delete();
      roiRgba.delete();

      if (buckets.size === 0) return '#8F8F8F';

      const sorted = [...buckets.values()].sort((a, b) => b.count - a.count);
      const topCount = sorted[0].count;
      const threshold = topCount * (1 - TIE_RATIO);

      const dominant = sorted.filter(b => b.count >= threshold);
      const totalCount = dominant.reduce((sum, b) => sum + b.count, 0);
      const blendedR = dominant.reduce((sum, b) => sum + b.r * b.count, 0) / totalCount;
      const blendedG = dominant.reduce((sum, b) => sum + b.g * b.count, 0) / totalCount;
      const blendedB = dominant.reduce((sum, b) => sum + b.b * b.count, 0) / totalCount;

      const toHex = v => Math.round(v).toString(16).padStart(2, '0');
      return `#${toHex(blendedR)}${toHex(blendedG)}${toHex(blendedB)}`;
   } catch (error) {
      console.error('Color extraction error:', error);
      return '#8F8F8F';
   }
}


/**
 * Crop image to circle with padding
 */
async function cropToCircle(imageBlob, circle) {
   const [cx, cy, radius] = circle;
   const size = Math.ceil(radius * 2.4);
   const x = Math.max(0, Math.round(cx - size / 2));
   const y = Math.max(0, Math.round(cy - size / 2));

   const bitmap = await createImageBitmap(imageBlob);
   const cropCanvas = document.createElement('canvas');
   cropCanvas.width = size;
   cropCanvas.height = size;

   const ctx = cropCanvas.getContext('2d');
   ctx.drawImage(
      bitmap,
      x, y, size, size,
      0, 0, size, size
   );

   return new Promise(resolve => {
      cropCanvas.toBlob(resolve, 'image/png');  // Use lossless PNG, compress to WebP at the end
   });
}

/**
 * Fallback: Process with simple color extraction
 */
async function processWithColorExtraction(imageBlob) {
   updateLoadingScreen('Extracting dominant color of the cap...');
   let capColor = '#8F8F8F'; // Default to grey
   // Return original image for full quality, only use small sample for color
   return new Promise(resolve => {
      resolve({
         imageBlob: imageBlob, // Keep original quality
         capColor,
         detected: false,
      });
   });
}

/**
 * Final step: Compress image to WebP format at quality 0.9
 * Call this as the last step before saving to storage
 * @param {Blob} imageBlob - The image blob to compress
 * @returns {Promise<Blob>} - WebP compressed blob at quality 0.9
 */
export async function compressToWebP(imageBlob) {
   try {
      const bitmap = await createImageBitmap(imageBlob);
      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;

      const ctx = canvas.getContext('2d');
      ctx.drawImage(bitmap, 0, 0);

      return new Promise(resolve => {
         canvas.toBlob(resolve, 'image/webp', 0.9);
      });
   } catch (error) {
      console.warn('WebP compression failed, returning original:', error);
      return imageBlob;
   }
}

/**
 * Downsize image to max 500x500px if larger
 * @param {Blob} imageBlob - The image blob to resize
 * @param {number} maxDimension - Maximum width or height (default: 500)
 * @returns {Promise<Blob>} - Resized image blob, or original if already smaller
 */
export async function resizeImageIfNeeded(imageBlob, maxDimension = 500) {
   try {
      const bitmap = await createImageBitmap(imageBlob);

      // If image is already smaller than max dimension, return original
      if (bitmap.width <= maxDimension && bitmap.height <= maxDimension) {
         return imageBlob;
      }

      // Calculate new dimensions maintaining aspect ratio
      let newWidth = bitmap.width;
      let newHeight = bitmap.height;

      if (newWidth > maxDimension || newHeight > maxDimension) {
         const aspectRatio = bitmap.width / bitmap.height;
         if (aspectRatio > 1) {
            // Wider than tall
            newWidth = maxDimension;
            newHeight = Math.round(maxDimension / aspectRatio);
         } else {
            // Taller than wide or square
            newHeight = maxDimension;
            newWidth = Math.round(maxDimension * aspectRatio);
         }
      }

      // Create canvas and draw resized image
      const canvas = document.createElement('canvas');
      canvas.width = newWidth;
      canvas.height = newHeight;

      const ctx = canvas.getContext('2d');
      ctx.drawImage(bitmap, 0, 0, newWidth, newHeight);

      // Convert to blob (use PNG for lossless intermediate, compress to WebP later)
      return new Promise(resolve => {
         canvas.toBlob(resolve, 'image/png');
      });
   } catch (error) {
      console.warn('Image resize failed, returning original:', error);
      return imageBlob;
   }
}

/**
 * Convert a Blob to base64 string
 * Used for exporting images to JSON format
 * @param {Blob} blob - The blob to convert
 * @returns {Promise<string>} - Base64 encoded string (without data URI prefix)
 */
export async function blobToBase64(blob) {
   return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
         // Extract base64 string without 'data:...;base64,' prefix
         const result = reader.result.split(',')[1];
         resolve(result);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
   });
}

/**
 * Convert a base64 string to a Blob
 * Used for importing images from JSON format
 * @param {string} base64String - Base64 encoded string (without data URI prefix)
 * @param {string} mimeType - MIME type of the blob (default: 'image/webp')
 * @returns {Blob} - The decoded blob
 */
export function base64ToBlob(base64String, mimeType = 'image/webp') {
   try {
      // Decode base64 to binary string
      const binaryString = atob(base64String);

      // Convert binary string to Uint8Array
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
         bytes[i] = binaryString.charCodeAt(i);
      }

      // Create and return blob
      return new Blob([bytes], { type: mimeType });
   } catch (error) {
      console.error('Base64 to blob conversion failed:', error);
      throw error;
   }
}