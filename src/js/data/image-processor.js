import { updateLoadingScreen } from '../helpers/helper.js';
/**
 * Wait for OpenCV.js to load (checks cv global object)
 */
function waitForOpenCV(timeout = 30000) {
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
}

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
      const jpegBlob = await heic2any({ blob: imageBlob, toType: 'image/webp', quality: 1 });
      return jpegBlob;
   } catch (error) {
      console.error('HEIC conversion failed:', error);
      return imageBlob; // Fall back to original
   }
}

/**
 * Process cap image: detect circle, extract color, crop
 * Respects the useAutoCapFinder setting from userSettings
 */
export async function processCapImage(imageBlob) {
   // Check if auto cap finder is enabled
   const useAutoCapFinder = await getSetting('useAutoCapFinder');

   if (useAutoCapFinder) {
      try {
         if (typeof cv !== 'undefined' && cv.Mat) {
            return await detectAndProcessWithOpenCV(imageBlob);
         }
      } catch (error) {
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
 * Process with OpenCV Hough circle detection
 */
async function detectAndProcessWithOpenCV(imageBlob) {
   try {
      // Load image
      const bitmap = await createImageBitmap(imageBlob);
      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(bitmap, 0, 0);

      // Convert to grayscale
      let src = cv.imread(canvas);
      let gray = new cv.Mat();
      cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);

      // Detect circles using Hough Circle Detection
      updateLoadingScreen('Searching for the cap in the image...');
      let circles = new cv.Mat();

      /* Parameters:
            image	      8-bit, single-channel, grayscale input image.
            circles	   output vector of found circles(cv.CV_32FC3 type). Each vector is encoded as a 3-element floating-point vector (x,y,radius) .
            method	   detection method(see cv.HoughModes). Currently, the only implemented method is HOUGH_GRADIENT
            dp	         inverse ratio of the accumulator resolution to the image resolution. For example, if dp = 1 , the accumulator has the same resolution as the input image. If dp = 2 , the accumulator has half as big width and height.
            minDist	   minimum distance between the centers of the detected circles. If the parameter is too small, multiple neighbor circles may be falsely detected in addition to a true one. If it is too large, some circles may be missed.
            param1	   first method-specific parameter. In case of HOUGH_GRADIENT , it is the higher threshold of the two passed to the Canny edge detector (the lower one is twice smaller).
            param2	   second method-specific parameter. In case of HOUGH_GRADIENT , it is the accumulator threshold for the circle centers at the detection stage. The smaller it is, the more false circles may be detected. Circles, corresponding to the larger accumulator values, will be returned first.
            minRadius	minimum circle radius.
            maxRadius	maximum circle radius. 
      */
      cv.HoughCircles(
         gray,
         circles,
         cv.HOUGH_GRADIENT,
         1, 45, 175, 40, 0, 0
      );
      /* -- SHOULD MAKE A BIT SMARTER.. checking distance to know how big will the cap be on the image or something... todo
         1,
         gray.rows / 8, 
         100,
         30,
         20,
         100 */

      let capColor = '#808080';
      let processedBlob = imageBlob;
      let detected = false;

      if (circles.rows > 0) {
         detected = true;
         // Get the best circle (first one detected)
         const circle = [
            circles.data32F[0],
            circles.data32F[1],
            circles.data32F[2],
         ];

         // testing circles lol
         /* const crcdst = cv.Mat.zeros(src.rows, src.cols, cv.CV_8U);
         const colors = [
            new cv.Scalar(0, 0, 255),     // Red
            new cv.Scalar(0, 255, 0),     // Green
            new cv.Scalar(255, 0, 0),     // Blue
            new cv.Scalar(0, 165, 255),   // Orange
            new cv.Scalar(255, 0, 255),   // Purple (Magenta)
            new cv.Scalar(255, 255, 0),   // Cyan
         ];
         // draw circles
         for (let i = 0; i < circles.cols; ++i) {
            let x = circles.data32F[i * 3];
            let y = circles.data32F[i * 3 + 1];
            let radius = circles.data32F[i * 3 + 2];
            let center = new cv.Point(x, y);
            cv.circle(crcdst, center, radius, colors[i % 6]);
         }
         const alpha = 0.5;
         const overlay = new cv.Mat();
         cv.addWeighted(gray, alpha, crcdst, 1 - alpha, 0, overlay);
         cv.imshow('circlesOutput', crcdst); */
         //crcdst.delete();
         //overlay.delete();


         // Extract color from circle
         updateLoadingScreen('Extracting dominant color of the cap...');
         capColor = extractColorFromCircle(src, circle, 'RGBA');

         // Crop to circle with padding
         updateLoadingScreen('Cropping image to circle...');
         processedBlob = await cropToCircle(canvas, circle);
      }

      // Cleanup
      src.delete();
      gray.delete();
      circles.delete();

      return {
         imageBlob: processedBlob,
         capColor,
         detected,
      };
   } catch (error) {
      console.error('OpenCV processing error:', cv.exceptionFromPtr(error).msg);
      throw error;
   }
}

/**
 * Extract dominant color from detected circle
 */
function extractColorFromCircle(mat, circle, colorSpace = 'BGR') {
   const [x, y, radius] = circle;
   const roiX = x - radius;
   const roiY = y - radius;
   const roiSize = radius * 2;

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
      const radiusSq = radius * radius;   // compare squared — no sqrt needed

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

      roi.delete();
      roiRgba.delete();

      if (buckets.size === 0) return '#808080';

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
      return '#808080';
   }
}

/**
 * Crop image to circle with padding
 */
async function cropToCircle(canvas, circle) {
   const [cx, cy, radius] = circle;
   const size = Math.ceil(radius * 2.4);
   const x = Math.max(0, Math.round(cx - size / 2));
   const y = Math.max(0, Math.round(cy - size / 2));

   const cropCanvas = document.createElement('canvas');
   cropCanvas.width = size;
   cropCanvas.height = size;

   const ctx = cropCanvas.getContext('2d');
   ctx.drawImage(
      canvas,
      x, y, size, size,
      0, 0, size, size
   );

   return new Promise(resolve => {
      cropCanvas.toBlob(resolve, 'image/webp', 1);
   });
}

/**
 * Fallback: Process with simple color extraction
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