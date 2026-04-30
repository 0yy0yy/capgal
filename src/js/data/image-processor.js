// ── Image processing with OpenCV.js ──────────────────────────────────────────

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
 * Process cap image: detect circle, extract color, crop
 */
export async function processCapImage(imageBlob) {
   try {
      // Try OpenCV detection if available
      if (typeof cv !== 'undefined' && cv.Mat) {
         return await detectAndProcessWithOpenCV(imageBlob);
      }
   } catch (error) {
      console.warn('OpenCV detection failed, falling back to color extraction:', error);
   }

   // Fallback to simple color extraction
   return await processWithColorExtraction(imageBlob);
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
      let circles = new cv.Mat();
      cv.HoughCircles(
         gray,
         circles,
         cv.HOUGH_GRADIENT,
         1,
         gray.rows / 8,
         100,
         30,
         20,
         100
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
         capColor = extractColorFromCircle(src, circle);

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
      console.error('OpenCV processing error:', error);
      throw error;
   }
}

/**
 * Extract dominant color from detected circle
 */
function extractColorFromCircle(mat, circle) {
   const [x, y, radius] = circle;
   const roiSize = Math.ceil(radius * 2);

   try {
      const roi = mat.roi(new cv.Rect(
         Math.max(0, Math.round(x - radius)),
         Math.max(0, Math.round(y - radius)),
         roiSize,
         roiSize
      ));

      // Sample pixels and find dominant color
      let r = 0, g = 0, b = 0;
      const data = roi.data32S;

      for (let i = 0; i < Math.min(100, data.length); i += 4) {
         b += data[i];
         g += data[i + 1];
         r += data[i + 2];
      }

      const count = Math.min(100, data.length / 4);
      r = Math.round(r / count);
      g = Math.round(g / count);
      b = Math.round(b / count);

      return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
   } catch {
      return '#808080';
   }
}

/**
 * Crop image to circle with 2.4x padding
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
      cropCanvas.toBlob(resolve, 'image/jpeg', 0.9);
   });
}

/**
 * Fallback: Process with simple color extraction
 */
async function processWithColorExtraction(imageBlob) {
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

/**
 * Extract dominant color from any image blob
 */
export async function extractDominantColor(imageBlob) {
   const bitmap = await createImageBitmap(imageBlob);
   const canvas = document.createElement('canvas');
   canvas.width = 50;
   canvas.height = 50;

   const ctx = canvas.getContext('2d');
   ctx.drawImage(bitmap, 0, 0, 50, 50);

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

   return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}
