// ── Data saving and synchronization ────────────────────────────────────────
import * as store from './store.js';
import * as crypto from './crypto.js';
import * as indexdb from './indexdb.js';
import Modal from '../ui/modal.js';

const GITHUB_REPO = 'YOUR-USERNAME/YOUR-REPO'; // Replace with actual repo
const GITHUB_BRANCH = 'main';

/**
 * Save app data to IndexDB (always) and GitHub (if configured)
 */
export async function saveAppData() {
   try {
      // Always save locally to IndexDB
      const dataToSave = {
         caps: store.store.caps,
         categories: store.store.categories,
         userSettings: store.store.userSettings,
         timestamp: new Date().toISOString(),
      };

      await indexdb.saveToIndexDB('appData', dataToSave);

      // Try to save to GitHub if configured
      if (store.store.userSettings.autoSave && store.store.userSettings.githubToken) {
         await saveToGitHub(dataToSave);
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
      if (!window._encryptionPassphrase) {
         const passphrase = await Modal.getPassphrase(
            'GitHub Sync',
            'Enter your encryption passphrase'
         );

         if (!passphrase) {
            console.warn('No passphrase provided for GitHub sync');
            return;
         }

         window._encryptionPassphrase = passphrase;
      }

      // Hash passphrase to get filename (SHA-256)
      const dataHash = await crypto.hashPassphrase(window._encryptionPassphrase);
      const fileName = `_data/${dataHash}.json`;

      // Check for collision
      const exists = await checkGitHubFileExists(fileName);
      if (exists && store.store.userSettings.githubDataHash !== dataHash) {
         console.error('GitHub file collision detected');
         return;
      }

      // Encrypt data
      const encrypted = await crypto.encrypt(JSON.stringify(dataToSave), window._encryptionPassphrase);
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
               content: btoa(encryptedJson),
               branch: GITHUB_BRANCH,
               ...(fileSha && { sha: fileSha }),
            }),
         }
      );

      if (!response.ok) {
         throw new Error(`GitHub API error: ${response.status}`);
      }

      store.store.userSettings.githubDataHash = dataHash;
      store.store.userSettings.lastGitHubSync = new Date().toISOString();
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
               'Authorization': `token ${store.userSettings.githubToken || ''}`,
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
               'Authorization': `token ${store.userSettings.githubToken}`,
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

   // Store passphrase in memory (NOT localStorage or IndexDB for security)
   window._encryptionPassphrase = passphrase;

   // Store only the hashed passphrase in userSettings for verification
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
