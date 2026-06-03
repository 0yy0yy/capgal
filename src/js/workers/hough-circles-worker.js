/**
 * Hough Circles Detection Worker
 * 
 * This worker runs cv.HoughCircles detection off the main thread.
 * It loads OpenCV.js via importScripts (uses browser cache for fast loading).
 * 
 * Initialize with 'init' message to wait for OpenCV to load
 * Then send 'detectCircles' messages with grayscale image data
 */

// Load OpenCV.js - importScripts uses browser cache if available (fast)
importScripts('../cv/opencv.js?v=4.13.0');

let isReady = false;

self.onmessage = async (event) => {
   const { type, taskId, data } = event.data;

   if (type === 'init') {
      // OpenCV is already loaded via importScripts at top of file
      isReady = true;
      self.postMessage({ taskId, type: 'init', status: 'ready' });
      return;
   }

   if (type === 'detectCircles') {
      if (!isReady) {
         self.postMessage({
            taskId,
            type: 'error',
            error: 'OpenCV not ready yet'
         });
         return;
      }

      try {
         const { pixelData, width, height, params } = data;

         // Reconstruct grayscale Mat from Uint8Array
         const gray = cv.matFromArray(height, width, cv.CV_8U, pixelData);

         // Perform circle detection
         let circles = new cv.Mat();
         cv.HoughCircles(
            gray,
            circles,
            cv.HOUGH_GRADIENT,
            params.dp,
            params.minDist,
            params.param1,
            params.param2,
            params.minRadius,
            params.maxRadius
         );

         // Extract circle data if found
         let circlesData = null;
         if (circles.rows > 0) {
            // Convert to array (first circle only for now)
            circlesData = [
               circles.data32F[0],  // x
               circles.data32F[1],  // y
               circles.data32F[2],  // radius
            ];
         }

         // Cleanup
         gray.delete();
         circles.delete();

         self.postMessage({
            taskId,
            type: 'success',
            circlesData,
            detected: circlesData !== null
         });
      } catch (error) {
         self.postMessage({
            taskId,
            type: 'error',
            error: error.message || String(error)
         });
      }
   }
};
