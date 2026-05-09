// ── Data saving and synchronization ────────────────────────────────────────
import * as store from './store.js';
import * as crypto from './crypto.js';
import * as indexdb from './indexdb.js';
import Modal from '../ui/modal.js';
import { utf8ToBase64, base64ToUtf8 } from '../helpers/helper.js';

const GITHUB_REPO = '0yy0yy/capgal';
const GITHUB_BRANCH = 'master';

/**
 * Save app data to IndexDB (always) and GitHub (if configured)
 */
export async function saveAppData() {
   try {
      // Always save locally to IndexDB (including encryptionPassphrase)
      const dataToSave = {
         caps: store.store.caps,
         categories: store.store.categories,
         userSettings: store.store.userSettings,
         timestamp: new Date().toISOString(),
      };

      await indexdb.saveToIndexDB('appData', dataToSave);
   } catch (error) {
      console.error('Error saving app data:', error);
   }
}

/**
 * Manually backup data to GitHub
 */
export async function backupToGitHub() {
   if (!store.store.userSettings.githubToken) {
      console.error('No GitHub token configured');
      return false;
   }

   try {
      const dataForGitHub = {
         caps: store.store.caps,
         categories: store.store.categories,
         userSettings: {
            ...store.store.userSettings,
            encryptionPassphrase: null, // Don't save passphrase to GitHub
         },
         timestamp: new Date().toISOString(),
      };

      await saveToGitHub(dataForGitHub);

      // Save updated lastGitHubSync to IndexDB
      try {
         await indexdb.saveToIndexDB('appData', {
            caps: store.store.caps,
            categories: store.store.categories,
            userSettings: store.store.userSettings,
            timestamp: new Date().toISOString(),
         });
      } catch (indexDbError) {
         console.error('Warning: GitHub backup succeeded but IndexDB save failed:', indexDbError);
         // Still return true since GitHub backup was successful
      }
      return true;
   } catch (error) {
      console.error('Error backing up to GitHub:', error);
      return false;
   }
}

/**
 * Save data to GitHub with encryption
 */
async function saveToGitHub(dataToSave) {
   try {
      // Ask for passphrase if not in memory
      if (!store.store.userSettings.encryptionPassphrase && !store.store.userSettings.githubDataHash) {
         try {
            const passphrase = await Modal.getPassphrase(
               'GitHub Sync',
               'Enter your encryption passphrase'
            );

            if (!passphrase) {
               console.warn('No passphrase provided for GitHub sync');
               throw new Error('Passphrase required for GitHub sync');
            }

            store.store.userSettings.encryptionPassphrase = passphrase;
         } catch (passphraseError) {
            console.error('Error getting passphrase:', passphraseError);
            throw passphraseError;
         }
      }

      // Hash passphrase to get filename (SHA-256)
      const dataHash = store.store.userSettings.githubDataHash ? store.store.userSettings.githubDataHash : await crypto.hashPassphrase(store.store.userSettings.encryptionPassphrase);
      const fileName = `data/${dataHash}.json`;

      // Check for collision
      const exists = await checkGitHubFileExists(fileName);
      if (exists && !store.store.userSettings.githubDataHash) {
         console.error('GitHub file collision detected');
         throw new Error('File collision detected on GitHub - hash mismatch');
      }

      // Encrypt data
      const encrypted = await crypto.encrypt(JSON.stringify(dataToSave), store.store.userSettings.encryptionPassphrase);
      const encryptedJson = JSON.stringify(encrypted);

      // Get current file SHA for update
      const fileSha = await getGitHubFileSha(fileName);

      // Upload to GitHub with timeout protection
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout

      try {
         const response = await fetch(
            `https://api.github.com/repos/${GITHUB_REPO}/contents/${fileName}`,
            {
               method: 'PUT',
               headers: {
                  'Authorization': `token ${store.store.userSettings.githubToken}`,
                  'Content-Type': 'application/json',
               },
               body: JSON.stringify({
                  message: `Backup bottle cap gallery data`,
                  content: utf8ToBase64(encryptedJson),
                  branch: GITHUB_BRANCH,
                  ...(fileSha && { sha: fileSha }),
               }),
               signal: controller.signal,
            }
         );

         clearTimeout(timeoutId);

         if (!response.ok) {
            throw new Error(`GitHub API error: ${response.status} - ${response.statusText}`);
         }

         if (!store.store.userSettings.githubDataHash) {
            store.store.userSettings.githubDataHash = dataHash;
         }
         store.store.userSettings.lastGitHubSync = new Date().toISOString();
      } catch (fetchError) {
         clearTimeout(timeoutId);
         throw fetchError;
      }
   } catch (error) {
      console.error('Error saving to GitHub:', error);
      throw error;
   }
}

/**
 * Check if GitHub file exists
 */
async function checkGitHubFileExists(fileName) {
   try {
      const response = await fetch(
         `https://api.github.com/repos/${GITHUB_REPO}/contents/${fileName}`,
         {
            method: 'HEAD',
            headers: {
               'Authorization': `token ${store.store.userSettings.githubToken}`,
            },
         }
      );
      return response.ok;
   } catch {
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

/**
 * Setup encryption for first time
 */
export async function setupEncryption() {
   try {
      const passphrase = await Modal.getPassphrase(
         'Secure Your Data',
         'Create an encryption passphrase'
      );

      if (!passphrase) return false;

      // Store passphrase in userSettings
      store.store.userSettings.encryptionPassphrase = passphrase;

      try {
         // Store only the hashed passphrase for verification
         const hashedPassphrase = await crypto.hashPassphrase(passphrase);
         store.store.userSettings.hashedPassphrase = hashedPassphrase;
      } catch (error) {
         console.error('Error hashing passphrase:', error);
         store.store.userSettings.encryptionPassphrase = null;
         throw error;
      }

      // Get GitHub token if needed
      const useGitHub = await Modal.confirm({
         question: 'Enable GitHub cloud sync? (requires personal access token)',
         yesLabel: 'Yes, set up GitHub',
         noLabel: 'Local only',
      });

      if (useGitHub) {
         const token = await Modal.getPassphrase('GitHub Setup', 'GitHub personal access token');
         if (token) {
            store.store.userSettings.githubToken = token;
            store.store.userSettings.autoSave = false;
         }
      }

      // Save to IndexDB with error handling
      try {
         await indexdb.saveToIndexDB('appData', {
            caps: store.store.caps,
            categories: store.store.categories,
            userSettings: store.store.userSettings,
            timestamp: new Date().toISOString(),
         });
      } catch (error) {
         console.error('Error saving encryption setup to IndexDB:', error);
         throw error;
      }

      return true;
   } catch (error) {
      console.error('Error during encryption setup:', error);
      // Reset settings on failure
      store.store.userSettings.encryptionPassphrase = null;
      store.store.userSettings.hashedPassphrase = null;
      throw error;
   }
}
