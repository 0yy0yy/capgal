// ── UI Controls (Settings, Theme, Sidebar, Back Buttons) ──────────────────
import * as store from '../data/store.js';
import { popTab } from './navigation.js';
import { openGallery } from '../data/gallery.js';
import { handleAddCategoryClick, initCategoryButtons, initCategoryDeleteHandlers } from './categories.js';
import { addCapsInBatch } from '../data/caps.js';

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

export function initSettingsHandlers() {
   document.getElementById('settingsButton').addEventListener('click', openSettings);
   document.getElementById('settingsClose').addEventListener('click', closeSettings);
   settingsBackdrop.addEventListener('click', closeSettings);
}

// ── Theme switcher ──────────────────────────────────────────────────────────
export function initThemeSwitcher() {
   document.querySelectorAll('.theme-btn[data-theme-pref]').forEach(btn => {
      btn.addEventListener('click', () => {
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
      });
   });

   /* window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {

   }); */

   const selectedStyle = document.documentElement.getAttribute('data-theme').split('-')[0];
   if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
      document.documentElement.setAttribute('data-theme', `${selectedStyle}-dark`);
   }
}

// ── Theme styles switcher ──────────────────────────────────────────────────────────
export function initThemeStyleSwitcher() {
   document.querySelectorAll('.theme-btn[data-theme-val]').forEach(btn => {
      btn.addEventListener('click', () => {
         document.querySelectorAll('.theme-btn[data-theme-val]').forEach(b => b.classList.remove('selected'));
         btn.classList.add('selected');
         const selectedTheme = document.documentElement.getAttribute('data-theme').split('-')[1];
         if (selectedTheme) {
            document.documentElement.setAttribute('data-theme', `${btn.dataset.themeVal}-dark`);
         } else {
            document.documentElement.setAttribute('data-theme', btn.dataset.themeVal);
         }

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
   document.getElementById('galleryBack').addEventListener('click', popTab);
   document.getElementById('detailsBack').addEventListener('click', popTab);
}

// ── Search button (FAB) ──────────────────────────────────────────────────────
export function initSearchButton() {
   searchButton.addEventListener('click', () => {
      // Select "all" category first
      document.querySelectorAll('.cat-btn').forEach(b => b.classList.remove('selected'));
      document.querySelector('[data-cat="all"]').classList.add('selected');

      if (store.getNavStackTop() === 'gallery' && store.currentCategory === 'all') {
         // Already there — just focus search input
         searchInput.focus();
      } else {
         // Reset stack to categories then push gallery
         store.setNavStack(['categories']);
         openGallery('all', true);
      }
   });
}

// ── Add category button (FAB) ───────────────────────────────────────────────
export function initAddCategoryButton() {
   document.getElementById('addCategoryButton').addEventListener('click', () => {
      handleAddCategoryClick();
   });
}

// ── Add cap button (FAB) ────────────────────────────────────────────────────
export function initAddCapButton() {
   document.getElementById('addCapButton').addEventListener('click', () => {
      addCapsInBatch();
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
   initCategoryButtons();
   initCategoryDeleteHandlers();
}