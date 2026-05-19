// ── Bottle Cap Gallery App ───────────────────────────────────────────────────
// Main orchestrator that initializes all modules

import { init as initUI } from './ui/ui.js';
import { initGallerySearch, openGallery } from './data/gallery.js';
import { applyTabStates } from './ui/navigation.js';
import * as store from './data/store.js';
import { loadAppData, autoSyncFromGitHub } from './data/loading.js';
import { initCategoryUI } from './ui/categories.js';
import { showLoadingScreen, hideLoadingScreen, updateLoadingScreen } from './helpers/helper.js'

/**
 * Initialize app
 */
async function initApp() {
   try {
      showLoadingScreen('Loading data...');
      // Load user data from storage
      const hasData = await loadAppData();

      // Attempt autosync from GitHub if credentials are available
      if (hasData && store.store.userSettings.githubToken && store.store.userSettings.encryptionPassphrase) {
         updateLoadingScreen('Checking GitHub backup for changes...');
         await autoSyncFromGitHub();
      }

      // Initialize UI
      updateLoadingScreen('Initializing app...');
      await initUI();
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
      // Hide loading screen
      hideLoadingScreen();
      console.log('Bottle Cap Gallery initialized');
   }
}

// Start app when DOM is ready
if (document.readyState === 'loading') {
   document.addEventListener('DOMContentLoaded', initApp);
} else {
   await initApp();
}