/**
 * OpenCV Web Worker
 * Handles circle detection and color extraction without blocking main thread
 */

// Load OpenCV.js
importScripts('../cv/opencv.js');

let cvReady = false;

/**
 * Wait for OpenCV.js to load
 */
function waitForOpenCV(timeout = 5000) {
   return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
         reject(new Error('OpenCV.js failed to load in worker'));
      }, timeout);

      // cv object exists but WASM may still be initializing
      if (typeof cv !== 'undefined' && cv.Mat) {
         // Already ready (rare but possible)
         clearTimeout(timer);
         resolve();
      } else {
         // Wait for WASM runtime to finish — this is the correct hook
         cv.onRuntimeInitialized = () => {
            clearTimeout(timer);
            resolve();
         };
      }
   });
}

// Signal when ready
waitForOpenCV().then(() => {
   self.postMessage({ type: 'ready' });
}).catch((error) => {
   self.postMessage({ type: 'error', error: error.message });
});

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

   const BUCKET_SIZE = 30;
   const TIE_RATIO = 0.01;

   try {
      const roi = mat.roi(new cv.Rect(safeX, safeY, safeW, safeH));
      const roiRgba = new cv.Mat();

      if (colorSpace === 'RGBA') {
         roi.copyTo(roiRgba);
      } else {
         cv.cvtColor(roi, roiRgba, cv.COLOR_BGR2RGBA);
      }

      const data = roiRgba.data;
      const cols = roi.cols;
      const rows = roi.rows;
      const roiCenterX = cols / 2;
      const roiCenterY = rows / 2;
      const radiusSq = radius * radius;

      const buckets = new Map();

      for (let row = 0; row < rows; row++) {
         const dy = row - roiCenterY;
         const dy2 = dy * dy;
         const rowOffset = row * cols * 4;

         for (let col = 0; col < cols; col++) {
            const dx = col - roiCenterX;
            if (dx * dx + dy2 > radiusSq) continue;

            const i = rowOffset + col * 4;
            const pr = data[i];
            const pg = data[i + 1];
            const pb = data[i + 2];

            const qr = Math.round(pr / BUCKET_SIZE);
            const qg = Math.round(pg / BUCKET_SIZE);
            const qb = Math.round(pb / BUCKET_SIZE);
            const key = (qr << 16) | (qg << 8) | qb;

            const bucket = buckets.get(key);
            if (bucket) {
               bucket.count++;
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
      console.error('Color extraction error in worker:', error);
      return '#808080';
   }
}

/**
 * Handle messages from main thread
 */
self.onmessage = async (event) => {
   const { taskId, task, imageData, width, height } = event.data;

   try {
      if (task === 'detectAndExtractColor') {
         if (!cvReady) {
            self.postMessage({
               taskId,
               type: 'error',
               error: 'OpenCV not ready'
            });
            return;
         }

         // Convert array back to Uint8ClampedArray
         const pixels = new Uint8ClampedArray(imageData);

         // Create OffscreenCanvas and draw image data
         const canvas = new OffscreenCanvas(width, height);
         const ctx = canvas.getContext('2d');
         const imgData = new ImageData(pixels, width, height);
         ctx.putImageData(imgData, 0, 0);

         // Convert to OpenCV Mat via canvas
         let src = cv.imread(canvas);
         let gray = new cv.Mat();
         cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);

         // Detect circles
         let circles = new cv.Mat();
         let circleFound = false;

         try {
            cv.HoughCircles(
               gray,
               circles,
               cv.HOUGH_GRADIENT,
               1, 45, 175, 40, 0, 0
            );
            circleFound = circles.rows > 0;
         } catch (error) {
            console.warn('Circle detection error in worker:', error);
         }

         let capColor = '#808080';
         let detected = false;
         let circle = null;

         if (circleFound) {
            detected = true;
            circle = [
               circles.data32F[0],
               circles.data32F[1],
               circles.data32F[2],
            ];
            capColor = extractColorFromCircle(src, circle, 'RGBA');
         }

         // Cleanup
         src.delete();
         gray.delete();
         circles.delete();

         self.postMessage({
            taskId,
            type: 'success',
            detected,
            capColor,
            circle,
         });
      }
   } catch (error) {
      console.error('Worker error:', error);
      self.postMessage({
         taskId,
         type: 'error',
         error: error.message
      });
   }
};
