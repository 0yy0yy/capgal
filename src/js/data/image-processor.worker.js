// ── Image Processor Worker ───────────────────────────────────────────────────
// Heavy image processing runs here to keep main thread responsive
// Receives: { imageBlob, useAutoCapFinder }
// Returns: { imageBlob, capColor, detected }

let cvReady = false;

async function loadOpenCV() {
   if (cvReady) return;

   return new Promise(async (resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('OpenCV load timeout')), 30000);

      // Must be set BEFORE eval, so the script picks it up on init
      self.Module = {
         onRuntimeInitialized() {
            clearTimeout(timeout);
            cvReady = true;
            resolve();
         }
      };

      try {
         const url = new URL('../cv/opencv.js', import.meta.url);
         const response = await fetch(url);
         const code = await response.text();
         (0, eval)(code); // cv global is set, WASM starts loading
      } catch (err) {
         clearTimeout(timeout);
         reject(err);
      }
   });
}

/**
 * Initialize OpenCV and wait for it to load
 */
async function initializeCV() {
   if (cvReady) return;
   await loadOpenCV();
}

/**
 * Message handler: receive task from main thread
 */
self.onmessage = async (event) => {
   try {
      const { imageBlob, useAutoCapFinder } = event.data;

      let result;

      if (useAutoCapFinder) {
         try {
            // Wait for OpenCV to be available
            await initializeCV();
            result = await detectAndProcessWithOpenCV(imageBlob);
         } catch (error) {
            console.warn('OpenCV detection failed in worker, falling back:', error);
            result = await processWithColorExtraction(imageBlob);
         }
      } else {
         result = await processWithColorExtraction(imageBlob);
      }

      // Send result back with transferable objects
      // Transfer the processed blob to main thread (move, don't copy)
      self.postMessage(
         {
            success: true,
            result,
         }
      );
   } catch (error) {
      self.postMessage({
         success: false,
         error: error.message,
      });
   }
};

/**
 * Process with OpenCV Hough circle detection
 */
async function detectAndProcessWithOpenCV(imageBlob) {
   try {
      // Load image
      const bitmap = await createImageBitmap(imageBlob);
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
      const ctx = canvas.getContext('2d');
      ctx.drawImage(bitmap, 0, 0);
      bitmap.close();

      // Convert to grayscale
      // let src = cv.imread(canvas); --- won't work in workers — manually build Mat from pixel data
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const src = cv.matFromImageData(imageData);
      let gray = new cv.Mat();
      cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);

      // Detect circles using Hough Circle Detection
      let circles = new cv.Mat();

      cv.HoughCircles(
         gray,
         circles,
         cv.HOUGH_GRADIENT,
         1, 45, 175, 40, 0, 0
      );

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

         // Extract color from circle
         capColor = extractColorFromCircle(src, circle, 'RGBA');

         // Crop to circle with padding
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
      console.error('OpenCV processing error in worker:', error);
      throw error;
   }
}

/**
 * Extract dominant color from detected circle
 */
function extractColorFromCircle(mat, circle, colorSpace = 'BGR') {
   const [x, y, radius] = circle;
   const roiSize = radius * 2;
   const roiX = x - radius;
   const roiY = y - radius;
   const safeX = Math.max(0, Math.min(roiX, mat.cols - 1));
   const safeY = Math.max(0, Math.min(roiY, mat.rows - 1));
   const safeW = Math.max(1, Math.min(roiSize, mat.cols - safeX));
   const safeH = Math.max(1, Math.min(roiSize, mat.rows - safeY));

   const BUCKET_THRESHOLD = 30;
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
      const roiCenterX = roi.cols / 2;
      const roiCenterY = roi.rows / 2;

      // Bucket colors for dominant color detection
      const buckets = [];

      for (let row = 0; row < roi.rows; row++) {
         for (let col = 0; col < roi.cols; col++) {
            const dx = col - roiCenterX;
            const dy = row - roiCenterY;
            if (dx * dx + dy * dy > radius * radius) continue;

            const i = (row * roi.cols + col) * 4;
            const pr = data[i];
            const pg = data[i + 1];
            const pb = data[i + 2];

            // Find closest existing bucket
            let bestBucket = null;
            let bestDist = Infinity;

            for (const bucket of buckets) {
               const dr = pr - bucket.r;
               const dg = pg - bucket.g;
               const db = pb - bucket.b;
               const dist = Math.sqrt(dr * dr + dg * dg + db * db);
               if (dist < bestDist) {
                  bestDist = dist;
                  bestBucket = bucket;
               }
            }

            if (bestBucket && bestDist <= BUCKET_THRESHOLD) {
               bestBucket.count++;
               bestBucket.r += (pr - bestBucket.r) / bestBucket.count;
               bestBucket.g += (pg - bestBucket.g) / bestBucket.count;
               bestBucket.b += (pb - bestBucket.b) / bestBucket.count;
            } else {
               buckets.push({ r: pr, g: pg, b: pb, count: 1 });
            }
         }
      }

      roi.delete();
      roiRgba.delete();

      if (buckets.length === 0) return '#808080';

      buckets.sort((a, b) => b.count - a.count);

      const topCount = buckets[0].count;
      const threshold = topCount * (1 - TIE_RATIO);

      const dominant = buckets.filter(b => b.count >= threshold);

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

   const cropCanvas = new OffscreenCanvas(size, size);
   const ctx = cropCanvas.getContext('2d');
   ctx.drawImage(
      canvas,
      x, y, size, size,
      0, 0, size, size
   );

   return new Promise(resolve => {
      cropCanvas.convertToBlob({ type: 'image/jpeg', quality: 1 }).then(resolve);
   });
}

/**
 * Fallback: Process with simple color extraction
 */
async function processWithColorExtraction(imageBlob) {
   const bitmap = await createImageBitmap(imageBlob);

   // Sample the center for dominant color
   const canvas = new OffscreenCanvas(50, 50);
   const ctx = canvas.getContext('2d');
   const scale = Math.min(bitmap.width, bitmap.height) / 50;
   const offsetX = (bitmap.width - 50 * scale) / 2;
   const offsetY = (bitmap.height - 50 * scale) / 2;

   ctx.drawImage(bitmap, offsetX, offsetY, 50 * scale, 50 * scale, 0, 0, 50, 50);
   bitmap.close();

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

   return {
      imageBlob: imageBlob,
      capColor,
      detected: false,
   };
}
