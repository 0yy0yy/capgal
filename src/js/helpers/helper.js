import { convertHeicToJpgIfNeeded } from '../data/image-processor.js'

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
export function showLoadingScreen() {
   const loading = document.getElementById('loadingScreen');
   if (loading) {
      loading.classList.add('active');
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