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

      // Try to save to GitHub if configured
      if (store.store.userSettings.autoSave && store.store.userSettings.githubToken) {
         // Create a copy without encryptionPassphrase for GitHub
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
      }
   } catch (error) {
      console.error('Error saving app data:', error);
   }
}

/**
 * Save data to GitHub with encryption
 */
async function saveToGitHub(dataToSave) {
   try {
      // Ask for passphrase if not in memory
      if (!store.store.userSettings.encryptionPassphrase && !store.store.userSettings.githubDataHash) {
         const passphrase = await Modal.getPassphrase(
            'GitHub Sync',
            'Enter your encryption passphrase'
         );

         if (!passphrase) {
            console.warn('No passphrase provided for GitHub sync');
            return;
         }

         store.store.userSettings.encryptionPassphrase = passphrase;
      }

      // Hash passphrase to get filename (SHA-256)
      const dataHash = store.store.userSettings.githubDataHash ? store.store.userSettings.githubDataHash : await crypto.hashPassphrase(store.store.userSettings.encryptionPassphrase);
      const fileName = `data/${dataHash}.json`;

      // Check for collision
      const exists = await checkGitHubFileExists(fileName);
      if (exists && !store.store.userSettings.githubDataHash) {
         console.error('GitHub file collision detected');
         return;
      }

      // Encrypt data
      const encrypted = await crypto.encrypt(JSON.stringify(dataToSave), store.store.userSettings.encryptionPassphrase);
      const encryptedJson = JSON.stringify(encrypted);

      // Get current file SHA for update
      const fileSha = await getGitHubFileSha(fileName);

      // Upload to GitHub
      const response = await fetch(
         `https://api.github.com/repos/${GITHUB_REPO}/contents/${fileName}`,
         {
            method: 'PUT',
            headers: {
               'Authorization': `token ${store.store.userSettings.githubToken}`,
               'Content-Type': 'application/json',
            },
            body: JSON.stringify({
               message: `Auto-save bottle cap gallery data`,
               content: utf8ToBase64(encryptedJson),
               branch: GITHUB_BRANCH,
               ...(fileSha && { sha: fileSha }),
            }),
         }
      );

      if (!response.ok) {
         throw new Error(`GitHub API error: ${response.status}`);
      }

      if (!store.store.userSettings.githubDataHash) {
         store.store.userSettings.githubDataHash = dataHash;
      }
      store.store.userSettings.lastGitHubSync = new Date().toISOString();
      //await saveAppData();
   } catch (error) {
      console.error('Error saving to GitHub:', error);
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
   const passphrase = await Modal.getPassphrase(
      'Secure Your Data',
      'Create an encryption passphrase'
   );

   if (!passphrase) return false;

   // Store passphrase in userSettings
   store.store.userSettings.encryptionPassphrase = passphrase;

   // Store only the hashed passphrase for verification
   const hashedPassphrase = await crypto.hashPassphrase(passphrase);
   store.store.userSettings.hashedPassphrase = hashedPassphrase;

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
         store.store.userSettings.autoSave = true;
      }
   }

   // Save to IndexDB
   await indexdb.saveToIndexDB('appData', {
      caps: store.store.caps,
      categories: store.store.categories,
      userSettings: store.store.userSettings,
      timestamp: new Date().toISOString(),
   });

   return true;
}
