// ── UI Controls (Settings, Theme, Sidebar, Back Buttons) ──────────────────
import * as store from '../data/store.js';
import { popTab } from './navigation.js';
import { openGallery, addLastCategoryToFilters, refreshGallery, updateGalleryTitleVisibility } from '../data/gallery.js';
import { handleAddCategoryClick, initCategoryButtons, initCategoryDeleteHandlers, initCategoryUI } from './categories.js';
import { addCapsInBatch } from '../data/caps.js';
import { saveAppData, backupToGitHub } from '../data/saving.js';
import { importFromDevice, importFromGitHub, exportToDevice } from '../data/loading.js';
import { hideLoadingScreen, showLoadingScreen, isAllCategorySelected } from '../helpers/helper.js';
import { initGalleryZoom } from './gallery-zoom.js';
import { getGallerySelectionManager } from './gallery-selection.js';

const settingsPanel = document.getElementById('settings');
const settingsBackdrop = document.getElementById('settings-backdrop');
const fabsEl = document.getElementById('fabs');
const fabsBackdrop = document.getElementById('fabs-backdrop');
const menuToggle = document.getElementById('menuToggle');
const searchInput = document.getElementById('searchInput');
const searchButton = document.getElementById('searchButton');

const fineGrainedTokenRegex = new RegExp("^github_pat_[a-zA-Z0-9]{22}_[a-zA-Z0-9]{59}$");

// ── Settings ───────────────────────────────────────────────────────────────
export function openSettings() {
   settingsPanel.classList.add('open');
   settingsBackdrop.classList.add('visible');
   store.setSettingsOpen(true);
}

export function closeSettings() {
   settingsPanel.classList.remove('open');
   settingsBackdrop.classList.remove('visible');
   store.setSettingsOpen(false);
}

export async function initSettingsHandlers() {
   document.getElementById('settingsButton').addEventListener('click', openSettings);
   document.getElementById('settingsClose').addEventListener('click', closeSettings);
   settingsBackdrop.addEventListener('click', closeSettings);

   // Make details exclusive (when one opens, close the other)
   const settingsDetails = document.querySelectorAll('#settings details');
   settingsDetails.forEach(detail => {
      detail.addEventListener('toggle', (e) => {
         if (e.target.open) {
            // Close all other details
            settingsDetails.forEach(d => {
               if (d !== e.target) d.open = false;
            });
         }
      });
   });

   // Initialize settings controls
   initToggleSwitch('toggleShowCapNames', store.store.userSettings.showCapNames, async (value) => {
      store.store.userSettings.showCapNames = value;
      await saveAppData();
      updateGalleryTitleVisibility(value);
   });

   initToggleSwitch('toggleUseAutoCapFinder', store.store.userSettings.useAutoCapFinder, async (value) => {
      store.store.userSettings.useAutoCapFinder = value;
      await saveAppData();
   });

   initToggleSwitch('toggleUseAutoColorFinder', store.store.userSettings.toggleUseAutoColorFinder, async (value) => {
      store.store.userSettings.toggleUseAutoColorFinder = value;
      await saveAppData();
   });

   // Helper function to update last backup display
   function updateLastBackupDisplay(lastBackupTimeEl) {
      if (lastBackupTimeEl) {
         if (store.store.userSettings.lastGitHubSync) {
            const backupDate = new Date(store.store.userSettings.lastGitHubSync);
            const formattedDate = backupDate.toLocaleString('sl-SI', {
               dateStyle: "medium",
               timeStyle: "short",
            });
            lastBackupTimeEl.textContent = `Last backup: ${formattedDate}`;
         } else {
            lastBackupTimeEl.textContent = 'Last backup: Never';
         }
      }
   }

   // Manual GitHub backup button
   const manualBackupBtn = document.getElementById('manualBackupBtn');
   const lastBackupTime = document.getElementById('lastBackupTime');

   if (manualBackupBtn) {
      let resetTimeout = null;

      const resetButton = () => {
         if (resetTimeout) clearTimeout(resetTimeout);
         manualBackupBtn.className = 'theme-btn';
         manualBackupBtn.textContent = 'Backup now';
         manualBackupBtn.disabled = false;
         resetTimeout = null;
      };

      const goToDefaultAfter5Seconds = () => {
         resetTimeout = setTimeout(resetButton, 5000);
      };

      manualBackupBtn.addEventListener('click', async () => {
         if (manualBackupBtn.disabled) return; // Prevent double-click

         showLoadingScreen('Backing up gallery data to github... This may take a while.');
         manualBackupBtn.disabled = true;

         try {
            const success = await backupToGitHub();
            if (success) {
               updateLastBackupDisplay(lastBackupTime);
               manualBackupBtn.textContent = 'Backup successful!';
               manualBackupBtn.classList.add("success");
               goToDefaultAfter5Seconds();
            } else {
               manualBackupBtn.textContent = 'Backup failed';
               manualBackupBtn.classList.add("error");
               goToDefaultAfter5Seconds();
            }
         } catch (error) {
            console.error('Backup error:', error);
            manualBackupBtn.textContent = 'Backup error';
            manualBackupBtn.classList.add("error");
            goToDefaultAfter5Seconds();
         } finally {
            hideLoadingScreen();
         }
      });

      updateLastBackupDisplay(lastBackupTime);
   }

   // GitHub token with masking
   const githubTokenInput = document.getElementById('githubTokenInput');
   if (githubTokenInput) {
      const token = store.store.userSettings.githubToken || '';
      githubTokenInput.value = token;
      githubTokenInput.dataset.fullToken = token; // Store actual value

      const fitGithubToken = (input, fullToken) => {
         const style = getComputedStyle(input);

         const canvas = document.createElement('canvas');
         const ctx = canvas.getContext('2d');

         ctx.font = `${style.fontSize} ${style.fontFamily}`;

         const lastDetailsInSettings = settings.querySelector('details:last-of-type');
         const maxWidth =
            (
               !lastDetailsInSettings.open
                  ? measureHiddenElement(input, lastDetailsInSettings).width
                  : input.getBoundingClientRect().width
            )
            - parseFloat(style.paddingLeft)
            - parseFloat(style.paddingRight);

         const start = fullToken.slice(0, 13);
         const end = fullToken.slice(-4);

         let dots = '•'.repeat(fullToken.length - 17);

         let value = start + dots + end;

         while (
            ctx.measureText(value).width > maxWidth &&
            dots.length > 0
         ) {
            dots = dots.slice(0, -1);
            value = start + dots + end;
         }

         input.value = value;
      }

      // Show/hide toggle and masking logic
      const updateTokenDisplay = () => {
         if (document.activeElement === githubTokenInput) {
            // Show full token when focused
            githubTokenInput.value = githubTokenInput.dataset.fullToken;
         } else {
            // Mask token when not focused
            const fullToken = githubTokenInput.dataset.fullToken;
            if (fullToken && fullToken.length > 13) { // change number to fit -- todo
               fitGithubToken(githubTokenInput, githubTokenInput.dataset.fullToken);
            }
         }
      };

      const measureHiddenElement = (textInput, settings) => {
         const githubSyncDetails = settings; //settings.querySelector('details:last-of-type');
         githubSyncDetails.open = true;

         const width = textInput.getBoundingClientRect().width;
         const scrollWidth = textInput.scrollWidth;

         githubSyncDetails.open = false;

         return {
            width,
            scrollWidth,
         };
      }

      githubTokenInput.addEventListener('focus', updateTokenDisplay);
      githubTokenInput.addEventListener('blur', async () => {
         if (fineGrainedTokenRegex.test(githubTokenInput.value)) {
            githubTokenInput.dataset.fullToken = githubTokenInput.value;
            store.store.userSettings.githubToken = githubTokenInput.value;

            const backupButtonContainer = manualBackupBtn?.closest('.setting-row');
            if (backupButtonContainer) {
               backupButtonContainer.style.display = githubTokenInput.value ? 'flex' : 'none';
            }

            await saveAppData();
            updateTokenDisplay();
         }
      });

      if (githubTokenInput.dataset.fullToken.length > 13) { // change --- todo
         fitGithubToken(githubTokenInput, githubTokenInput.dataset.fullToken);
      }
   }

   // Show backup button only if GitHub token is set
   const backupButtonContainer = manualBackupBtn?.closest('.setting-row');
   if (backupButtonContainer) {
      backupButtonContainer.style.display = store.store.userSettings.githubToken ? 'flex' : 'none';
   }

   // Open gallery by default toggle
   initToggleSwitch('toggleOpenGalleryByDefault', store.store.userSettings.openGalleryByDefault, async (value) => {
      store.store.userSettings.openGalleryByDefault = value;
      await saveAppData();
   });

   // Gallery background texture selector
   const textureSelect = document.getElementById('galleryTextureSelect');
   if (textureSelect) {
      textureSelect.value = store.store.userSettings.galleryBackgroundTexture || 'none';
      textureSelect.addEventListener('change', async (e) => {
         const texture = e.target.value;
         store.store.userSettings.galleryBackgroundTexture = texture;

         // Update gallery element classes
         const gallery = document.getElementById('gallery');
         if (gallery) {
            // Remove all texture classes
            gallery.classList.remove('cracks-texture', 'dirty-wall-texture', 'fabric-texture', 'grunge-texture', 'sand-texture', 'wood-texture');

            // Add new texture class if not 'none'
            if (texture && texture !== 'none') {
               gallery.classList.add(texture);
            }
         }

         await saveAppData();
      });
   }

   // Import/Export buttons
   document.getElementById('importFromDeviceBtn')?.addEventListener('click', async () => {
      const success = await importFromDevice();
      if (success) {
         showLoadingScreen('Saving imported data...');
         await saveAppData();
         closeSettings();
         location.reload();
         hideLoadingScreen();
      }
   });

   document.getElementById('importFromGitHubBtn')?.addEventListener('click', async () => {
      const success = await importFromGitHub();
      if (success) {
         showLoadingScreen('Saving imported data...');
         await saveAppData();
         closeSettings();
         location.reload();
         hideLoadingScreen();
      }
   });

   document.getElementById('exportPlainBtn')?.addEventListener('click', async () => {
      await exportToDevice(false);
   });

   document.getElementById('exportEncryptedBtn')?.addEventListener('click', async () => {
      await exportToDevice(true);
   });
}

function initToggleSwitch(elementId, initialState, onChange) {
   const toggle = document.getElementById(elementId);
   if (!toggle) return;

   toggle.checked = initialState;
   toggle.addEventListener('change', (e) => {
      onChange(e.target.checked);
   });
}

// ── Theme switcher ──────────────────────────────────────────────────────────
function initThemeSwitcher() {
   document.querySelectorAll('.theme-btn[data-theme-pref]').forEach(btn => {
      btn.addEventListener('click', async () => {
         document.querySelectorAll('.theme-btn[data-theme-pref]').forEach(b => b.classList.remove('selected'));
         btn.classList.add('selected');
         const selectedStyle = document.documentElement.getAttribute('data-theme').split('-')[0];
         const selectedPref = btn.dataset.themePref;
         if (selectedPref === 'dark'
            || (selectedPref === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
            document.documentElement.setAttribute('data-theme', `${selectedStyle}-dark`);
         } else {
            document.documentElement.setAttribute('data-theme', selectedStyle);
         }
         store.store.userSettings.theme = selectedPref;
         await saveAppData();
      });
   });
}

// ── Theme styles switcher ──────────────────────────────────────────────────────────
function initThemeStyleSwitcher() {
   document.querySelectorAll('.theme-btn[data-theme-val]').forEach(btn => {
      btn.addEventListener('click', async () => {
         document.querySelectorAll('.theme-btn[data-theme-val]').forEach(b => b.classList.remove('selected'));
         btn.classList.add('selected');
         const selectedTheme = document.documentElement.getAttribute('data-theme').split('-')[1];
         if (selectedTheme) {
            document.documentElement.setAttribute('data-theme', `${btn.dataset.themeVal}-dark`);
         } else {
            document.documentElement.setAttribute('data-theme', btn.dataset.themeVal);
         }
         store.store.userSettings.appearance = btn.dataset.themeVal;
         await saveAppData();
      });
   });
}

// ── Set up theme and appearance from store/indexdb ────────────────────────────────────────────────────────── 
function setUpThemeFromStore() {
   const selectedStyle = store.store.userSettings.appearance;
   if ((store.store.userSettings.theme === 'dark') || (
      store.store.userSettings.theme === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches
   )) {
      document.documentElement.setAttribute('data-theme', `${selectedStyle}-dark`);
   } else {
      document.documentElement.setAttribute('data-theme', selectedStyle);
   }

   document.querySelectorAll('.theme-btn[data-theme-pref]').forEach(b => b.classList.remove('selected'));
   const selectedTheme = store.store.userSettings.theme;
   const selectedButtonTheme = document.querySelector(`.theme-btn[data-theme-pref=${selectedTheme}]`);
   selectedButtonTheme.classList.add('selected');

   document.querySelectorAll('.theme-btn[data-theme-val]').forEach(b => b.classList.remove('selected'));
   const selectedAppearance = store.store.userSettings.appearance;
   const selectedButtonAppearance = document.querySelector(`.theme-btn[data-theme-val=${selectedAppearance}]`);
   selectedButtonAppearance.classList.add('selected');
}

// ── Filter chips ────────────────────────────────────────────────────────────
function initFilterChips() {
   document.querySelectorAll('.filter-chip').forEach(chip => {
      chip.addEventListener('click', () => {
         const active = [...chip.classList].includes('active');
         document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
         chip.classList.toggle('active', !active);
      });
   });
}

// ── Back buttons ────────────────────────────────────────────────────────────
function initBackButtons() {
   document.getElementById('galleryBack')?.addEventListener('click', popTab);
   document.getElementById('detailsBack')?.addEventListener('click', popTab);
}

// ── Search button (FAB) ──────────────────────────────────────────────────────
function initSearchButton() {
   searchButton.addEventListener('click', () => {
      // Select "all" category first
      document.querySelectorAll('.cat-btn').forEach(b => b.classList.remove('selected'));
      document.querySelector('[data-cat="all"]')?.classList.add('selected');

      if (store.navStack[store.navStack.length - 1] === 'gallery' && store.currentCategory === 'all') {
         // Already there — just focus search input
         searchInput.focus();
      } else {
         store.setNavStack(['categories']);
         openGallery('all', true);
      }
   });
}

// ── Add category button (FAB) ───────────────────────────────────────────────
function initAddCategoryButton() {
   document.getElementById('addCategoryButton').addEventListener('click', async () => {
      await handleAddCategoryClick();

      if (store.navStack.includes('gallery') && store.currentCategory === 'all') {
         addLastCategoryToFilters();

         const allSelected = isAllCategorySelected();
         const selectionManager = getGallerySelectionManager(!allSelected, allSelected);

         // If in selection mode, assign category to selected items
         if (selectionManager && selectionManager.selectedItems.size > 0) {
            selectionManager.selectedItems.forEach(capId => {
               const capToUpdate = store.store.caps.find(c => c.id === capId);
               if (capToUpdate) {
                  capToUpdate.category = cat.id;
               }
            });
            await saveAppData();
            exitGallerySelectionMode();
            openGallery('all');
         }
      }
   });
}

// ── Add cap button (FAB) ────────────────────────────────────────────────────
async function initAddCapButton() {
   document.getElementById('addCapButton').addEventListener('click', async () => {
      await addCapsInBatch(); // !!! TODO: remove save from the addc caps in batch functionaliry and do a single save at the end
      await saveAppData();
   });
}

// ── Sidebar/Menu toggle ─────────────────────────────────────────────────────
function openSidebar() {
   fabsEl.classList.add('open');
   fabsBackdrop.classList.add('visible');
   menuToggle.classList.add('open');
   menuToggle.setAttribute('aria-label', 'Close menu');
}

function closeSidebar() {
   fabsEl.classList.remove('open');
   fabsBackdrop.classList.remove('visible');
   menuToggle.classList.remove('open');
   menuToggle.setAttribute('aria-label', 'Open menu');
}

function initSidebarHandlers() {
   menuToggle.addEventListener('click', () => {
      fabsEl.classList.contains('open') ? closeSidebar() : openSidebar();
   });

   fabsBackdrop.addEventListener('click', closeSidebar);

   // Close sidebar after any FAB action on narrow screens
   document.querySelectorAll('#fabs button:not(#settingsButton)').forEach(btn => {
      btn.addEventListener('click', () => {
         if (window.innerWidth <= 600) closeSidebar();
      });
   });
}

// ── Initialize all UI handlers ──────────────────────────────────────────────
export async function init() {
   initSettingsHandlers();
   initThemeSwitcher();
   initThemeStyleSwitcher();
   initFilterChips();
   initBackButtons();
   initSearchButton();
   initAddCategoryButton();
   await initAddCapButton();
   initSidebarHandlers();
   initCategoryUI();  // Populate categories from store
   initCategoryButtons();
   initCategoryDeleteHandlers();
   initGalleryZoom();  // Initialize gallery zoom controls
   setUpThemeFromStore();
}