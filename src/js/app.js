// ── Bottle Cap Gallery App ───────────────────────────────────────────────────
// Main orchestrator that initializes all modules

import { init as initUI } from './ui/ui.js';
import { initGallerySearch } from './data/gallery.js';
import { applyTabStates } from './ui/navigation.js';

// Initialize all modules
initUI();
initGallerySearch();
applyTabStates();

console.log('Bottle Cap Gallery initialized');

