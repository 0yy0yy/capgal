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
      /* const response = await fetch(
         `./${fileName}`
      ); */

      if (!response.ok) {
         throw new Error('File not found on GitHub');
      }

      updateLoadingScreen('Decrypting data...');
      const encrypted = await response.json();
      /* const data = await response.json();
      const encryptedContent = base64ToUtf8(data);
      const encrypted = JSON.parse(encryptedContent); */

      // Decrypt
      const decrypted = await crypto.decrypt(encrypted, passphrase);
      const appData = JSON.parse(decrypted);

      hideLoadingScreen();

      const importMode = await Modal.confirm({
         question: 'Would you like to override the data or merge it with the existing?',
         yesLabel: 'Replace',
         noLabel: 'Merge'
      });
      showLoadingScreen('Merging data...');

      if (importMode) { // replace
         // Write directly to store without using setters
         store.store.caps = appData.caps || [];
         store.store.categories = appData.categories || [];
         Object.assign(store.store.userSettings, appData.userSettings || {});
         store.store.userSettings.encryptionPassphrase = passphrase;
         store.store.userSettings.githubDataHash = dataHash;
      } else { // merge otherwise
         //TODO - update same id and add nonexistant ones, do not merge with imported setting/leave the old settings intact
         // store.store.caps = appData.caps || [];
         // store.store.categories = appData.categories || [];
         // Object.assign(store.store.userSettings, appData.userSettings || {});
      }

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
                  updateLoadingScreen('Importing...');
                  // Write directly to store without using setters
                  store.store.caps = appData.caps || [];
                  store.store.categories = appData.categories || [];
                  Object.assign(store.store.userSettings, appData.userSettings || {});
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

            showLoadingScreen('Decrypting...');
            // Store passphrase in store for later use
            store.store.userSettings.encryptionPassphrase = passphrase;

            updateLoadingScreen('Processing data...');
            const encrypted = JSON.parse(text);
            const decrypted = await crypto.decrypt(encrypted, passphrase);
            appData = JSON.parse(decrypted);

            // Write directly to store without using setters
            store.store.caps = appData.caps || [];
            store.store.categories = appData.categories || [];

            const hashedPassphrase = await crypto.hashPassphrase(passphrase);
            Object.assign(store.store.userSettings, {
               ...appData.userSettings,
               encryptionPassphrase: passphrase, // Store passphrase from import
               hashedPassphrase, // Store only the hash, not the passphrase
            });

            await indexdb.saveToIndexDB('appData', {
               caps: store.store.caps,
               categories: store.store.categories,
               userSettings: store.store.userSettings,
               timestamp: new Date().toISOString(),
            });
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
