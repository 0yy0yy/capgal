// ── Tab navigation (the core transition engine) ─────────────────────────────
import * as store from '../data/store.js';
import { updateGalleryList } from '../data/gallery.js'
import { pauseMarqueeScroll } from '../helpers/helper.js';

const tabEls = {
   categories: document.getElementById('categories'),
   gallery: document.getElementById('gallery'),
   details: document.getElementById('details'),
};

export function applyTabStates() {
   const top = store.navStack[store.navStack.length - 1] || 'categories';
   const behind = store.navStack[store.navStack.length - 2] || null;

   Object.entries(tabEls).forEach(([name, el]) => {
      el.classList.remove('active', 'behind');
      if (name === top) el.classList.add('active');
      else if (name === behind) el.classList.add('behind');
      // else: off-screen (translateX 100%)
   });
}

export function pushTab(name) {
   if (store.navStack[store.navStack.length - 1] === name) return;
   store.navStack.push(name);

   // Force a layout reflow before applying transforms to ensure DOM dimensions are calculated
   // This prevents misalignment when transitioning to a newly rendered view
   if (name === 'gallery' || name === 'details') {
      const tabEl = tabEls[name];
      if (tabEl) {
         // Accessing offsetHeight forces a layout recalculation
         void tabEl.offsetHeight;
      }
   }

   applyTabStates();

   if (name === 'details') {
      pauseMarqueeScroll();
   }
}

export function popTab() {
   if (store.navStack.length <= 1) return;
   const closingView = store.navStack.pop();
   applyTabStates();

   if (closingView === 'details') {
      updateGalleryList();
   } else if (closingView === 'gallery') {
      pauseMarqueeScroll();
   }
}
