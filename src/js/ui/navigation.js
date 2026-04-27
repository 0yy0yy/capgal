// ── Tab navigation (the core transition engine) ─────────────────────────────
import * as store from '../data/store.js';

const tabEls = {
   categories: document.getElementById('categories'),
   gallery: document.getElementById('gallery'),
   details: document.getElementById('details'),
};

export function applyTabStates() {
   const top = store.getNavStackTop();
   const behind = store.getNavStackBehind();

   Object.entries(tabEls).forEach(([name, el]) => {
      el.classList.remove('active', 'behind');
      if (name === top) el.classList.add('active');
      else if (name === behind) el.classList.add('behind');
      // else: off-screen (translateX 100%)
   });
}

export function pushTab(name) {
   const currentStack = store.navStack;
   if (currentStack[currentStack.length - 1] === name) return;
   currentStack.push(name);
   applyTabStates();
}

export function popTab() {
   const currentStack = store.navStack;
   if (currentStack.length <= 1) return;
   currentStack.pop();
   applyTabStates();
}
