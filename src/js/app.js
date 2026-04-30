// ── Bottle Cap Gallery App ───────────────────────────────────────────────────
// Main orchestrator that initializes all modules

import { init as initUI } from './ui/ui.js';
import { initGallerySearch, openGallery } from './data/gallery.js';
import { applyTabStates } from './ui/navigation.js';
import * as store from './data/store.js';
import { loadAppData } from './data/loading.js';
import { initCategoryUI } from './ui/categories.js';

/**
 * Show loading screen
 */
function showLoadingScreen() {
   const loading = document.getElementById('loadingScreen');
   if (loading) {
      loading.classList.add('active');
   }
}

/**
 * Hide loading screen
 */
function hideLoadingScreen() {
   const loading = document.getElementById('loadingScreen');
   if (loading) {
      loading.classList.remove('active');
   }
}

/**
 * Initialize app
 */
async function initApp() {
   showLoadingScreen();

   try {
      // Load user data from storage
      const hasData = await loadAppData();

      // Initialize UI
      initUI();
      initGallerySearch();

      // If no data, create default state
      if (!hasData) {
         // Make sure we have the default "all" category
         if (!store.store.categories.find(c => c.id === 'all')) {
            store.store.categories.push({
               id: 'all',
               name: 'All caps',
               color: '#808080',
            });
         }
      }

      // Populate category UI from store
      initCategoryUI();

      // Apply tab states and show initial tab
      applyTabStates();

      // Show first view based on setting
      if (store.store.userSettings.openGalleryByDefault) {
         openGallery('all');
      } else {
         applyTabStates();
      }
   } catch (error) {
      console.error('Error initializing app:', error);
      alert('Failed to initialize app');
   } finally {
      hideLoadingScreen();
   }
}

// Start app when DOM is ready
if (document.readyState === 'loading') {
   document.addEventListener('DOMContentLoaded', initApp);
} else {
   initApp();
}

console.log('Bottle Cap Gallery initialized');

