// ── Data loading and synchronization ──────────────────────────────────────
import * as store from './store.js';
import * as crypto from './crypto.js';
import * as indexdb from './indexdb.js';
import Modal from '../ui/modal.js';

const GITHUB_REPO = 'YOUR-USERNAME/YOUR-REPO'; // Replace with actual repo

/**
 * Load app data from IndexDB on startup
 */
export async function loadAppData() {
   try {
      const data = await indexdb.loadFromIndexDB('appData');

      if (data) {
         store.setCaps(data.caps || []);
         store.setCategories(data.categories || []);
         store.updateUserSettings({ ...store.store.userSettings, ...data.userSettings });
         return true;
      }
   } catch (error) {
      console.error('Error loading app data:', error);
   }
   return false;
}

/**
 * Import data from GitHub (requires passphrase)
 */
export async function importFromGitHub() {
   const passphrase = await Modal.getPassphrase(
      'Import from GitHub',
      'Enter your encryption passphrase'
   );

   if (!passphrase) return false;

   try {
      // Store passphrase in memory for later GitHub syncs
      window._encryptionPassphrase = passphrase;

      const dataHash = await crypto.hashPassphrase(passphrase);
      const fileName = `_data/${dataHash}.json`;

      const response = await fetch(
         `https://api.github.com/repos/${GITHUB_REPO}/contents/${fileName}`,
         {
            headers: {
               'Authorization': `token ${store.store.userSettings.githubToken || ''}`,
            },
         }
      );

      if (!response.ok) {
         throw new Error('File not found on GitHub');
      }

      const data = await response.json();
      const encryptedContent = atob(data.content);
      const encrypted = JSON.parse(encryptedContent);

      // Decrypt
      const decrypted = await crypto.decrypt(encrypted, passphrase);
      const appData = JSON.parse(decrypted);

      // Merge into store
      store.setCaps(appData.caps || []);
      store.setCategories(appData.categories || []);
      store.updateUserSettings({
         ...store.store.userSettings,
         ...appData.userSettings,
         hashedPassphrase: dataHash, // Store only the hash, not the passphrase
      });

      await indexdb.saveToIndexDB('appData', {
         caps: appData.caps || [],
         categories: appData.categories || [],
         userSettings: store.store.userSettings,
         timestamp: new Date().toISOString(),
      });
      return true;
   } catch (error) {
      console.error('Error importing from GitHub:', error);
      alert('Failed to import: ' + error.message);
      return false;
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
            const text = await file.text();
            let appData;

            try {
               // Try parsing as plain JSON first
               appData = JSON.parse(text);

               // If it has caps/categories, it's our format
               if (appData.caps && Array.isArray(appData.caps)) {
                  store.setCaps(appData.caps);
                  store.setCategories(appData.categories || []);
                  store.updateUserSettings({
                     ...store.store.userSettings,
                     ...appData.userSettings
                  });
                  await indexdb.saveToIndexDB('appData', {
                     caps: appData.caps,
                     categories: appData.categories || [],
                     userSettings: store.store.userSettings,
                     timestamp: new Date().toISOString(),
                  });
                  resolve(true);
                  return;
               }
            } catch {
               // Not JSON, try as encrypted
            }

            // Try decrypting
            const passphrase = await Modal.getPassphrase(
               'Import from Device',
               'Enter passphrase to decrypt'
            );

            if (!passphrase) {
               resolve(false);
               return;
            }

            // Store passphrase in memory
            window._encryptionPassphrase = passphrase;

            const encrypted = JSON.parse(text);
            const decrypted = await crypto.decrypt(encrypted, passphrase);
            appData = JSON.parse(decrypted);

            store.setCaps(appData.caps || []);
            store.setCategories(appData.categories || []);

            const hashedPassphrase = await crypto.hashPassphrase(passphrase);
            store.updateUserSettings({
               ...store.store.userSettings,
               ...appData.userSettings,
               hashedPassphrase, // Store only the hash, not the passphrase
            });

            await indexdb.saveToIndexDB('appData', {
               caps: appData.caps || [],
               categories: appData.categories || [],
               userSettings: store.store.userSettings,
               timestamp: new Date().toISOString(),
            });
            resolve(true);
         } catch (error) {
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
         userSettings: store.store.userSettings,
         timestamp: new Date().toISOString(),
      };

      let content;
      let filename;

      if (encrypted) {
         let passphrase = window._encryptionPassphrase;

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

         // Store passphrase in memory for consistency
         window._encryptionPassphrase = passphrase;

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
