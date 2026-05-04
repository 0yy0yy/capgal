import { convertHeicToJpgIfNeeded } from '../data/image-processor.js'

const COLOR_WHEEL_24 = [
   "#FF0000", // 0°   red
   "#FF4000", // 15°
   "#FF8000", // 30°  orange
   "#FFBF00", // 45°
   "#FFFF00", // 60°  yellow
   "#BFFF00", // 75°
   "#80FF00", // 90°  lime
   "#40FF00", // 105°
   "#00FF00", // 120° green
   "#00FF40", // 135°
   "#00FF80", // 150°
   "#00FFBF", // 165°
   "#00FFFF", // 180° cyan
   "#00BFFF", // 195°
   "#0080FF", // 210°
   "#0040FF", // 225°
   "#0000FF", // 240° blue
   "#4000FF", // 255°
   "#8000FF", // 270° violet
   "#BF00FF", // 285°
   "#FF00FF", // 300° magenta
   "#FF00BF", // 315°
   "#FF0080", // 330°
   "#FF0040", // 345°
];

/* const GRAYSCALE_8 = [
   "#000000", // black
   "#2B2B2B",
   "#555555",
   "#808080", // mid gray
   "#AAAAAA",
   "#CCCCCC",
   "#E5E5E5",
   "#FFFFFF"  // white
]; */

const GRAYSCALE_UI = [
   "#111111",
   "#2A2A2A",
   "#444444",
   "#6B6B6B",
   "#8F8F8F",
   "#B5B5B5",
   "#D9D9D9",
   "#F5F5F5"
];

const hexToRgb = (hex) => {
   const v = hex.replace('#', '');
   return {
      r: parseInt(v.substring(0, 2), 16),
      g: parseInt(v.substring(2, 4), 16),
      b: parseInt(v.substring(4, 6), 16),
   };
};

const colorDistance = (a, b) => {
   return (
      (a.r - b.r) ** 2 +
      (a.g - b.g) ** 2 +
      (a.b - b.b) ** 2
   );
};

export function clampToPalette(inputHex) {
   const input = hexToRgb(inputHex);

   let closest = COLOR_WHEEL_24[0];
   let minDist = Infinity;

   for (const hex of [...COLOR_WHEEL_24, ...GRAYSCALE_UI]) {
      const dist = colorDistance(input, hexToRgb(hex));
      if (dist < minDist) {
         minDist = dist;
         closest = hex;
      }
   }

   return closest;
}

export function getWordForCount(numberOfItems, word) {
   return numberOfItems === 1 ? word : `${word}s`;
}

export async function tryHeicConversion(imageBlob) {
   try {
      const convertedJpegImage = await convertHeicToJpgIfNeeded(imageBlob);
      return convertedJpegImage;
   } catch (err) {
      console.error('[HEIC] Image pre-processing failed:', err);
      return imageBlob
   }
}

/**
 * Show loading screen
 */
export function showLoadingScreen(message = 'Loading') {
   const loading = document.getElementById('loadingScreen');
   if (loading) {
      loading.classList.add('active');
      const logsEl = document.getElementById('loadingScreenLogs');
      if (logsEl) {
         logsEl.textContent = message;
      }
   }
}

/**
 * Update loading screen message
 */
export function updateLoadingScreen(message) {
   const logsEl = document.getElementById('loadingScreenLogs');
   if (logsEl) {
      logsEl.textContent = message;
   }
}

/**
 * Hide loading screen
 */
export function hideLoadingScreen() {
   const loading = document.getElementById('loadingScreen');
   if (loading) {
      loading.classList.remove('active');
   }
}