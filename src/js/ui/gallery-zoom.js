/**
 * Gallery Zoom Controller
 * Handles zoom/pinch gestures and keyboard zoom controls (Ctrl+scroll, +/-)
 * Smart zoom: exponential steps and max zoom based on viewport width
 */

import * as store from '../data/store.js';
import { saveAppData } from '../data/saving.js';

export function initGalleryZoom() {
   const gallery = document.getElementById('gallery');
   const galleryList = document.getElementById('galleryList');

   if (!gallery || !galleryList) return;

   // Get initial zoom from store
   let zoomLevel = store.store.userSettings.galleryZoom || 1;
   const minZoom = 0.4;
   let maxZoom = 2.2;

   const BASE_ITEM_SIZE = 100; // Base size in pixels

   /**
    * Calculate maximum zoom based on viewport width
    * Max zoom = viewport width / base item size (so 1 item per line max)
    */
   const calculateMaxZoom = () => {
      const containerWidth = galleryList.parentElement?.clientWidth || window.innerWidth;
      // Account for padding and gap
      const gap = 14; // gap in CSS
      const padding = 16; // padding in CSS
      const availableWidth = containerWidth - padding * 2;

      // Max zoom should make the item fill available width minus gap
      const calculatedMaxZoom = availableWidth / BASE_ITEM_SIZE;
      return Math.max(2, calculatedMaxZoom); // At least 2x
   };

   /**
    * Calculate adaptive zoom step based on current zoom level
    * Lower zoom = smaller steps, higher zoom = larger steps (exponential feel)
    */
   const getAdaptiveZoomStep = (direction = 'up') => {
      if (zoomLevel < 0.79) {
         return direction === 'up' ? 0.1 : -0.1;
      } else if (zoomLevel < 1.05) {
         return direction === 'up' ? 0.25 : -0.25;
      } else if (zoomLevel < 1.2) {
         return direction === 'up' ? 0.3 : -0.3;
      } else {
         return direction === 'up' ? 0.4 : -0.4;
      }
   };

   /**
    * Calculate how many columns fit at the current zoom level
    */
   const getColumnCount = () => {
      const containerWidth = galleryList.parentElement?.clientWidth || window.innerWidth;
      const gap = 14;
      const padding = 16;
      const availableWidth = containerWidth - padding * 2;
      const itemSize = BASE_ITEM_SIZE * zoomLevel;
      // Same formula the browser uses for auto-fill
      return Math.floor((availableWidth + gap) / (itemSize + gap));
   };

   /**
    * Update gallery zoom and save to store
    */
   const setZoom = async (newZoom) => {
      // Gate: if already at one item per line, ignore further zoom-in requests
      if (newZoom > zoomLevel && getColumnCount() <= 1) return;

      maxZoom = calculateMaxZoom();
      zoomLevel = Math.max(minZoom, Math.min(maxZoom, newZoom));
      document.documentElement.style.setProperty('--gallery-zoom', zoomLevel);

      // Update grid based on zoom level
      const newSize = BASE_ITEM_SIZE * zoomLevel;
      const css = `#gallery ul { grid-template-columns: repeat(auto-fill, minmax(${newSize}px, 1fr)); }`;

      if (!galleryList._styleElement) {
         galleryList._styleElement = document.createElement('style');
         document.head.appendChild(galleryList._styleElement);
      }
      galleryList._styleElement.textContent = css;

      // Save to store
      store.store.userSettings.galleryZoom = zoomLevel;
      document.body.classList.toggle('zoom-small', zoomLevel < 0.702);
      document.body.classList.toggle('zoom-big', zoomLevel > 2.7);
      try {
         await saveAppData();
      } catch (error) {
         console.warn('Failed to save zoom state:', error);
      }
   };

   /**
    * Initialize zoom level
    */
   setZoom(zoomLevel);

   /**
    * Keyboard zoom: Ctrl+Scroll, Ctrl++, Ctrl+-
    */
   const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === '+' || e.key === '=' || e.key === '-' || e.key === '_')) {
         e.preventDefault();
         const direction = (e.key === '+' || e.key === '=') ? 'up' : 'down';
         const step = getAdaptiveZoomStep(direction);
         setZoom(zoomLevel + step);
      }
   };

   /**
    * Ctrl+Mouse wheel zoom
    */
   const handleWheel = (e) => {
      // Only handle in gallery view
      if (!gallery.classList.contains('active')) return;

      if (e.ctrlKey || e.metaKey) {
         e.preventDefault();
         const direction = e.deltaY < 0 ? 'up' : 'down';
         const step = getAdaptiveZoomStep(direction);
         setZoom(zoomLevel + step);
      }
   };

   /**
    * Pinch zoom gesture
    */
   let touchDistance = 0;
   const handleTouchStart = (e) => {
      if (e.touches.length === 2) {
         const dx = e.touches[0].clientX - e.touches[1].clientX;
         const dy = e.touches[0].clientY - e.touches[1].clientY;
         touchDistance = Math.sqrt(dx * dx + dy * dy);
      }
   };

   const handleTouchMove = (e) => {
      if (e.touches.length === 2) {
         const dx = e.touches[0].clientX - e.touches[1].clientX;
         const dy = e.touches[0].clientY - e.touches[1].clientY;
         const newDistance = Math.sqrt(dx * dx + dy * dy);

         if (touchDistance > 0) {
            const ratio = newDistance / touchDistance;
            if (ratio > 1.0) {
               const step = getAdaptiveZoomStep('up');
               setZoom(zoomLevel + step);
               touchDistance = newDistance;
            } else if (ratio < 0.98) {
               const step = getAdaptiveZoomStep('down');
               setZoom(zoomLevel + step);
               touchDistance = newDistance;
            }
         }
      }
   };

   /**
    * Handle window resize to recalculate max zoom
    */
   const handleResize = () => {
      const oldMaxZoom = maxZoom;
      maxZoom = calculateMaxZoom();

      // Adjust current zoom if it exceeds new max
      if (zoomLevel > maxZoom) {
         setZoom(maxZoom);
      } else if (oldMaxZoom !== maxZoom) {
         // Re-apply current zoom with new max
         setZoom(zoomLevel);
      }
   };

   // Add event listeners
   document.addEventListener('keydown', handleKeyDown);
   gallery.addEventListener('wheel', handleWheel, { passive: false });
   gallery.addEventListener('touchstart', handleTouchStart, { passive: true });
   gallery.addEventListener('touchmove', handleTouchMove, { passive: true });
   window.addEventListener('resize', handleResize);

   // Cleanup function
   return () => {
      document.removeEventListener('keydown', handleKeyDown);
      gallery.removeEventListener('wheel', handleWheel);
      gallery.removeEventListener('touchstart', handleTouchStart);
      gallery.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('resize', handleResize);
   };
}
