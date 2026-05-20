// ── Data loading and synchronization ──────────────────────────────────────
import * as store from './store.js';
import * as crypto from './crypto.js';
import * as indexdb from './indexdb.js';
import Modal from '../ui/modal.js';
import { base64ToUtf8 } from '../helpers/helper.js';
import { showLoadingScreen, updateLoadingScreen, hideLoadingScreen } from '../helpers/helper.js';

const GITHUB_REPO = '0yy0yy/capgal';

/**
 * Load app data from IndexDB on startup
 */
export async function loadAppData() {
   try {
      showLoadingScreen('Loading data from storage...');
      const data = await indexdb.loadFromIndexDB('appData');

      if (data) {
         updateLoadingScreen('Preparing data...');
         // Write directly to store without using setters
         store.store.caps = data.caps || [];
         store.store.categories = data.categories || [];
         Object.assign(store.store.userSettings, data.userSettings || {});
         hideLoadingScreen();
         return true;
      }
      hideLoadingScreen();
   } catch (error) {
      console.error('Error loading app data:', error);
      hideLoadingScreen();
   }
   return false;
}

/**
 * Import data, ask user for mode: MERGE or REPLACE
 */
async function importData(appData) {
   hideLoadingScreen();
   const importMode = await Modal.confirm({
      question: 'Would you like to override the data or merge it with the existing?',
      yesLabel: 'Replace',
      noLabel: 'Merge'
   });

   if (importMode) { // replace
      showLoadingScreen('Replacing data...');
      // Write directly to store without using setters
      store.store.caps = appData.caps || [];
      store.store.categories = appData.categories || [];
      Object.assign(store.store.userSettings, appData.userSettings || {});
   } else { // merge otherwise
      showLoadingScreen('Merging data...');
      // Merge caps: keep existing, add new ones, update same ID with backup data
      const backupCaps = appData.caps || [];
      const mergedCaps = [...store.store.caps];

      backupCaps.forEach(backupCap => {
         const existingCapIndex = [...store.store.caps].findIndex(c => c.id === backupCap.id);
         if (existingCapIndex >= 0) {
            // Cap exists in both - use backup data
            mergedCaps[existingCapIndex] = backupCap;
         } else {
            // New cap - add it
            mergedCaps.push(backupCap);
         }
      });
      store.store.caps = mergedCaps;

      // Merge categories: keep existing, add new ones, update same ID with backup data
      const backupCategories = appData.categories || [];
      const mergedCategories = [...store.store.categories];

      backupCategories.forEach(backupCategory => {
         // Skip the 'all' category as it's always the default
         if (backupCategory.id === 'all') return;

         const existingCategoryIndex = [...store.store.categories].findIndex(c => c.id === backupCategory.id);
         if (existingCategoryIndex >= 0) {
            // Category exists in both - use backup data
            mergedCategories[existingCategoryIndex] = backupCategory;
         } else {
            // New category - add it
            mergedCategories.push(backupCategory);
         }
      });
      store.store.categories = mergedCategories;

      // Ask user if they want to sync preferences/settings
      hideLoadingScreen();
      const syncPrefs = await Modal.confirm({
         question: 'Would you like to sync the user settings from the backup, including the encryption passphrase?',
         yesLabel: 'Yes, sync',
         noLabel: 'No, keep current'
      });

      if (syncPrefs) {
         showLoadingScreen('Synchronizing user settings...');
         Object.assign(store.store.userSettings, appData.userSettings);
      }
   }
}

/**
 * Import data from GitHub (requires passphrase)
 */
export async function importFromGitHub() {
   const passphrase = await Modal.getPassphrase(
      'Import from GitHub',
      'Enter the encryption passphrase'
   );

   if (!passphrase) {
      console.warn('No passphrase provided for GitHub sync');
      return false;
   }

   showLoadingScreen('Connecting to GitHub...');

   try {
      updateLoadingScreen('Computing data hash...');
      const dataHash = await crypto.hashPassphrase(passphrase);
      const fileName = `data/${dataHash}.json`;

      updateLoadingScreen('Downloading from GitHub...');
      const response = await fetch(
         `https://raw.githubusercontent.com/${GITHUB_REPO}/master/${fileName}`
      );

      if (!response.ok) {
         throw new Error('File not found on GitHub');
      }

      updateLoadingScreen('Decrypting data...');
      const encrypted = await response.json();

      // Decrypt
      const decrypted = await crypto.decrypt(encrypted, passphrase);
      const appData = JSON.parse(decrypted);
      appData.userSettings.encryptionPassphrase = passphrase;
      appData.userSettings.githubDataHash = dataHash;
      await importData(appData);
      return true;
   } catch (error) {
      console.error('Error importing from GitHub:', error);
      alert('Failed to import: ' + error.message);
      return false;
   } finally {
      hideLoadingScreen();
   }
}

/**
 * Import data from device file (encrypted or plain JSON)
 */
export async function importFromDevice() {
   return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json';

      input.addEventListener('change', async (e) => {
         const file = e.target.files?.[0];
         if (!file) {
            resolve(false);
            return;
         }

         try {
            showLoadingScreen('Reading file...');
            const text = await file.text();
            let appData;

            try {
               // Try parsing as plain JSON first
               updateLoadingScreen('Parsing data...');
               appData = JSON.parse(text);

               // If it has caps/categories, it's our format
               if (appData.caps && Array.isArray(appData.caps)) {
                  updateLoadingScreen('Processing...');
                  hideLoadingScreen();

                  //TODO: modal: do you want to add a passphrase also?

                  await importData(appData);
                  hideLoadingScreen();
                  resolve(true);
                  return;
               }
            } catch {
               // Not JSON, try as encrypted
            }

            // Try decrypting
            hideLoadingScreen();
            const passphrase = await Modal.getPassphrase(
               'Import from Device',
               'Enter passphrase to decrypt'
            );

            if (!passphrase) {
               resolve(false);
               return;
            }

            showLoadingScreen('Decrypting & processing data...');
            const encrypted = JSON.parse(text);
            const decrypted = await crypto.decrypt(encrypted, passphrase);
            appData = JSON.parse(decrypted);
            appData.userSettings.encryptionPassphrase = passphrase;
            appData.userSettings.githubDataHash = await crypto.hashPassphrase(passphrase);

            // Ask user for import mode (replace or merge)
            hideLoadingScreen();
            await importData(appData);
            hideLoadingScreen();
            resolve(true);
         } catch (error) {
            hideLoadingScreen();
            console.error('Error importing from device:', error);
            alert('Failed to import: ' + error.message);
            resolve(false);
         }
      });

      input.click();
   });
}

/**
 * Export data to device (encrypted or plain)
 */
export async function exportToDevice(encrypted = true) {
   try {
      const appData = {
         caps: store.store.caps,
         categories: store.store.categories,
         userSettings: {
            ...store.store.userSettings,
            encryptionPassphrase: null, // Don't export passphrase
         },
         timestamp: new Date().toISOString(),
      };

      let content;
      let filename;

      if (encrypted) {
         let passphrase = store.store.userSettings.encryptionPassphrase;

         if (!passphrase) {
            passphrase = await Modal.getPassphrase(
               'Export Encrypted Backup',
               'Enter your encryption passphrase'
            );
         }

         if (!passphrase) {
            alert('No encryption passphrase provided');
            return false;
         }

         // Store passphrase in store for consistency
         store.store.userSettings.encryptionPassphrase = passphrase;

         const encrypted_data = await crypto.encrypt(JSON.stringify(appData), passphrase);
         content = JSON.stringify(encrypted_data, null, 2);
         filename = `bottle-caps-backup-${new Date().toISOString().split('T')[0]}-encrypted.json`;
      } else {
         content = JSON.stringify(appData, null, 2);
         filename = `bottle-caps-backup-${new Date().toISOString().split('T')[0]}.json`;
      }

      const blob = new Blob([content], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);

      return true;
   } catch (error) {
      console.error('Error exporting to device:', error);
      alert('Failed to export: ' + error.message);
      return false;
   }
}

/**
 * Automatically sync from GitHub on app init with merge option
 * Only runs if both githubToken and encryptionPassphrase are set
 */
export async function autoSyncFromGitHub() {
   // Check prerequisites
   if (!store.store.userSettings.githubToken || !store.store.userSettings.encryptionPassphrase) {
      return false;
   }

   try {
      // Get the data hash to construct the filename
      let dataHash = store.store.userSettings.githubDataHash;
      if (!dataHash) {
         dataHash = await crypto.hashPassphrase(store.store.userSettings.encryptionPassphrase);
         store.store.userSettings.githubDataHash = dataHash;
      }
      const fileName = `data/${dataHash}.json`;

      // Get current file SHA from GitHub
      updateLoadingScreen('Comparing json sha value...');
      const currentSha = await getGitHubFileSha(fileName);

      // If no file exists on GitHub, skip sync
      if (!currentSha) {
         console.log('No backup found on GitHub, skipping autosync');
         return false;
      }

      // Compare with stored SHA - if identical, data is already up to date
      if (store.store.userSettings.githubFileSha === currentSha) {
         console.log('GitHub data is up to date');
         updateLoadingScreen('App is up to date...');
         store.store.userSettings.lastGitHubAutoSync = new Date().toISOString();
         return true;
      }

      // SHA differs - fetch and merge from GitHub
      updateLoadingScreen('Downloading newer json from GitHub...');
      const response = await fetch(
         `https://raw.githubusercontent.com/${GITHUB_REPO}/master/${fileName}`
      );

      if (!response.ok) {
         throw new Error('Failed to download from GitHub');
      }

      updateLoadingScreen('Decrypting GitHub data...');
      const encrypted = await response.json();
      const decrypted = await crypto.decrypt(encrypted, store.store.userSettings.encryptionPassphrase);
      const appData = JSON.parse(decrypted);

      // Perform merge with existing data
      updateLoadingScreen('Merging data...');

      // Merge caps: keep existing, add new ones, update same ID with backup data
      const backupCaps = appData.caps || [];
      const mergedCaps = [...store.store.caps];

      backupCaps.forEach(backupCap => {
         const existingCapIndex = [...store.store.caps].findIndex(c => c.id === backupCap.id);
         if (existingCapIndex >= 0) {
            // Cap exists in both - use backup data (from GitHub)
            mergedCaps[existingCapIndex] = backupCap;
         } else {
            // New cap - add it
            mergedCaps.push(backupCap);
         }
      });
      store.store.caps = mergedCaps;

      // Merge categories: keep existing, add new ones, update same ID with backup data
      const backupCategories = appData.categories || [];
      const mergedCategories = [...store.store.categories];

      backupCategories.forEach(backupCategory => {
         // Skip the 'all' category as it's always the default
         if (backupCategory.id === 'all') return;

         const existingCategoryIndex = [...store.store.categories].findIndex(c => c.id === backupCategory.id);
         if (existingCategoryIndex >= 0) {
            // Category exists in both - use backup data (from GitHub)
            mergedCategories[existingCategoryIndex] = backupCategory;
         } else {
            // New category - add it
            mergedCategories.push(backupCategory);
         }
      });
      store.store.categories = mergedCategories;

      // Update the stored SHA to mark sync as complete
      store.store.userSettings.githubFileSha = currentSha;
      store.store.userSettings.lastGitHubAutoSync = new Date().toISOString();

      // Save merged data to IndexDB
      updateLoadingScreen('Saving merged data...');
      await indexdb.saveToIndexDB('appData', {
         caps: store.store.caps,
         categories: store.store.categories,
         userSettings: store.store.userSettings,
         timestamp: new Date().toISOString(),
      });

      console.log('Autosync completed successfully');
      return true;
   } catch (error) {
      console.error('Error during autosync:', error);
      // Don't throw or show error to user - autosync is non-critical
      return false;
   }
}

/**
 * Get GitHub file SHA (needed for updates)
 */
async function getGitHubFileSha(fileName) {
   try {
      const response = await fetch(
         `https://api.github.com/repos/${GITHUB_REPO}/contents/${fileName}`,
         {
            headers: {
               'Authorization': `token ${store.store.userSettings.githubToken}`,
            },
         }
      );

      if (!response.ok) return null;

      const data = await response.json();
      return data.sha;
   } catch {
      return null;
   }
}
