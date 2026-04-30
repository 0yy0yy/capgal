import { saveAppData } from './saving.js';

// ── Central state management for app data ──────────────────────────────────
export const store = {
   caps: [],
   categories: [
      {
         id: 'all',
         name: 'All caps',
         color: '#808080',
      },
   ],
   userSettings: {
      theme: 'auto',
      appearance: 'android',
      showCapNames: true,
      autoSave: false,
      openGalleryByDefault: false,
      galleryBackgroundTexture: 'none',
      githubToken: null,
      githubDataHash: null,
      lastGitHubSync: null,
   },
};

export function setCaps(newCaps) {
   store.caps = newCaps;
   saveAppData();
}

export function setCategories(newCategories) {
   store.categories = newCategories;
   saveAppData();
}

export function updateUserSettings(newSettings) {
   Object.assign(store.userSettings, newSettings);
   saveAppData();
}

// UI state
export let currentCategory = 'all';
export let navStack = ['categories'];
export let settingsOpen = false;

/**
 * Add a new cap to collection
 */
export function addCap(capData) {
   const newCap = {
      id: Date.now(),
      title: capData.title || '',
      description: capData.description || '',
      category: capData.category || 'all',
      imageBase64: capData.imageBase64 || null,
      color: capData.color || '#808080',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
   };

   store.caps.push(newCap);
   saveAppData();
   return newCap;
}

/**
 * Update cap data
 */
export function updateCap(capId, updates) {
   const cap = store.caps.find(c => c.id === capId);
   if (cap) {
      Object.assign(cap, updates, { updatedAt: new Date().toISOString() });
      saveAppData();
   }
   return cap;
}

/**
 * Delete cap from collection
 */
export function deleteCap(capId) {
   store.caps = store.caps.filter(c => c.id !== capId);
   saveAppData();
}

/**
 * Add a new category
 */
export function addCategory(categoryData) {
   const newCategory = {
      id: categoryData.id || categoryData.name?.toLowerCase().replace(/\s+/g, '-') || `cat-${Date.now()}`,
      name: categoryData.name || 'Untitled',
      color: categoryData.color || '#808080',
   };

   store.categories.push(newCategory);
   saveAppData();
   return newCategory;
}

/**
 * Delete category and reassign caps to 'all' --//TODO - all caps have category all by default. caps can have multiple categories!
 */
export function deleteCategory(categoryId) {
   store.categories = store.categories.filter(c => c.id !== categoryId);
   // Reassign caps in this category to 'all'
   store.caps.forEach(cap => {
      if (cap.category === categoryId) {
         cap.category = 'all';
      }
   });
   saveAppData();
}

/**
 * Update settings
 */
/* export function updateSettings(updates) {
   userSettings = { ...userSettings, ...updates };
} */

/**
 * Get category by ID
 */
export function getCategory(categoryId) {
   return store.categories.find(c => c.id === categoryId);
}

/**
 * Get caps in category
 */
export function getCapsByCategory(categoryId) {
   if (categoryId === 'all') return store.caps;
   return store.caps.filter(c => c.category === categoryId);
}

/**
 * Set current category
 */
export function setCurrentCategory(catId) {
   currentCategory = catId;
}

/**
 * Set navigation stack
 */
export function setNavStack(stack) {
   navStack = stack;
}

/**
 * Get top of nav stack
 */
export function getNavStackTop() {
   return navStack[navStack.length - 1] || 'categories';
}

/**
 * Get item behind top of nav stack
 */
export function getNavStackBehind() {
   return navStack[navStack.length - 2] || null;
}

/**
 * Set settings panel open state
 */
export function setSettingsOpen(isOpen) {
   settingsOpen = isOpen;
}
