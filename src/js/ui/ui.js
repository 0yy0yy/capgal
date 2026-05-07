// ── UI Controls (Settings, Theme, Sidebar, Back Buttons) ──────────────────
import * as store from '../data/store.js';
import { popTab } from './navigation.js';
import { openGallery, addLastCategoryToFilters, refreshGallery } from '../data/gallery.js';
import { handleAddCategoryClick, initCategoryButtons, initCategoryDeleteHandlers, initCategoryUI } from './categories.js';
import { addCapsInBatch } from '../data/caps.js';
import { saveAppData } from '../data/saving.js';
import { importFromDevice, importFromGitHub, exportToDevice } from '../data/loading.js';
import { hideLoadingScreen, showLoadingScreen } from '../helpers/helper.js';

const settingsPanel = document.getElementById('settings');
const settingsBackdrop = document.getElementById('settings-backdrop');
const fabsEl = document.getElementById('fabs');
const fabsBackdrop = document.getElementById('fabs-backdrop');
const menuToggle = document.getElementById('menuToggle');
const searchInput = document.getElementById('searchInput');
const searchButton = document.getElementById('searchButton');

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
      // Refresh gallery to show/hide cap names immediately
      refreshGallery();
   });

   initToggleSwitch('toggleUseAutoCapFinder', store.store.userSettings.useAutoCapFinder, async (value) => {
      store.store.userSettings.useAutoCapFinder = value;
      await saveAppData();
   });

   initToggleSwitch('toggleAutoSave', store.store.userSettings.autoSave, async (value) => {
      store.store.userSettings.autoSave = value;
      await saveAppData();
   });

   // GitHub token with masking
   const autoSaveInput = document.getElementById('toggleAutoSave');
   const githubTokenInput = document.getElementById('githubTokenInput');
   if (githubTokenInput) {
      const token = store.store.userSettings.githubToken || '';
      githubTokenInput.value = token;
      githubTokenInput.dataset.fullToken = token; // Store actual value

      // Show/hide toggle and masking logic
      const updateTokenDisplay = () => {
         if (document.activeElement === githubTokenInput) {
            // Show full token when focused
            githubTokenInput.type = 'text';
            githubTokenInput.value = githubTokenInput.dataset.fullToken;
         } else {
            // Mask token when not focused
            const fullToken = githubTokenInput.dataset.fullToken;
            if (fullToken && fullToken.length > 4) {
               githubTokenInput.type = 'password';
               githubTokenInput.value = fullToken.substring(0, 4) + '•'.repeat(Math.max(0, fullToken.length - 8)) + fullToken.substring(fullToken.length - 4);
            }
         }
      };

      githubTokenInput.addEventListener('focus', updateTokenDisplay);
      githubTokenInput.addEventListener('blur', async () => {
         githubTokenInput.dataset.fullToken = githubTokenInput.value;
         store.store.userSettings.githubToken = githubTokenInput.value;
         await saveAppData();
         // Show auto-save toggle if token is now set
         const autoSaveContainer = autoSaveInput?.closest('.setting-row');
         if (autoSaveContainer) {
            autoSaveContainer.style.display = githubTokenInput.value ? 'flex' : 'none';
            if (!store.store.userSettings.githubToken) {
               autoSaveInput.checked = false;
               await store.updateUserSettings({ autoSave: false });
            }
         }
         updateTokenDisplay();
      });

      updateTokenDisplay();
   }

   // Show auto-save toggle only if GitHub token is set
   const autoSaveContainer = autoSaveInput?.closest('.setting-row');
   if (autoSaveContainer) {
      autoSaveContainer.style.display = store.store.userSettings.githubToken ? 'flex' : 'none';
      if (!store.store.userSettings.githubToken) {
         autoSaveInput.checked = false;
         await store.updateUserSettings({ autoSave: false });
      }
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
export function initThemeSwitcher() {
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

   const selectedStyle = document.documentElement.getAttribute('data-theme').split('-')[0];
   if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
      document.documentElement.setAttribute('data-theme', `${selectedStyle}-dark`);
   }
}

// ── Theme styles switcher ──────────────────────────────────────────────────────────
export function initThemeStyleSwitcher() {
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

// ── Filter chips ────────────────────────────────────────────────────────────
export function initFilterChips() {
   document.querySelectorAll('.filter-chip').forEach(chip => {
      chip.addEventListener('click', () => {
         const active = [...chip.classList].includes('active');
         document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
         chip.classList.toggle('active', !active);
      });
   });
}

// ── Back buttons ────────────────────────────────────────────────────────────
export function initBackButtons() {
   document.getElementById('galleryBack')?.addEventListener('click', popTab);
   document.getElementById('detailsBack')?.addEventListener('click', popTab);
}

// ── Search button (FAB) ──────────────────────────────────────────────────────
export function initSearchButton() {
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
export function initAddCategoryButton() {
   document.getElementById('addCategoryButton').addEventListener('click', async () => {
      await handleAddCategoryClick();

      if (store.navStack.includes('gallery') && store.currentCategory === 'all') {
         addLastCategoryToFilters();
      }
   });
}

// ── Add cap button (FAB) ────────────────────────────────────────────────────
export function initAddCapButton() {
   document.getElementById('addCapButton').addEventListener('click', async () => {
      await addCapsInBatch();
   });
}

// ── Sidebar/Menu toggle ─────────────────────────────────────────────────────
export function openSidebar() {
   fabsEl.classList.add('open');
   fabsBackdrop.classList.add('visible');
   menuToggle.classList.add('open');
   menuToggle.setAttribute('aria-label', 'Close menu');
}

export function closeSidebar() {
   fabsEl.classList.remove('open');
   fabsBackdrop.classList.remove('visible');
   menuToggle.classList.remove('open');
   menuToggle.setAttribute('aria-label', 'Open menu');
}

export function initSidebarHandlers() {
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
export function init() {
   initSettingsHandlers();
   initThemeSwitcher();
   initThemeStyleSwitcher();
   initFilterChips();
   initBackButtons();
   initSearchButton();
   initAddCategoryButton();
   initAddCapButton();
   initSidebarHandlers();
   initCategoryUI();  // Populate categories from store
   initCategoryButtons();
   initCategoryDeleteHandlers();
}