// ── Category management ────────────────────────────────────────────────────
import Modal from './modal.js';
import * as store from '../data/store.js';
import { openGallery } from '../data/gallery.js';
import { saveAppData } from '../data/saving.js';

let preventClickOnLongPress = null;

export async function deleteCategory(categoryId) {
   const category = store.store.categories.find(c => c.id === categoryId);
   const capCount = store.store.caps.filter(c => c.category === categoryId).length;

   const confirmed = await Modal.confirm({
      question: `Delete "${category?.name || 'Category'}"? ${capCount} cap(s) will be moved to "All".`,
      yesLabel: 'Yes, delete',
      noLabel: 'Cancel',
   });

   if (confirmed) {
      // Move affected caps to 'all'
      store.store.caps.forEach(cap => {
         if (cap.category === categoryId) {
            cap.category = 'all';
         }
      });

      // Remove category from store
      store.store.categories = store.store.categories.filter(c => c.id !== categoryId);

      await saveAppData();

      // Refresh UI
      initCategoryUI();
      //openGallery('all');
      return true;
   }
   return false;
}

export async function handleAddCategoryClick() {
   const result = await Modal.addItem({ type: 'category' });
   if (!result) return false;

   const newCategory = {
      id: result.name.toLowerCase().replace(/\s+/g, '-') + String(Date.now()),
      name: result.name,
      color: result.color,
   };

   store.store.categories.push(newCategory);
   await saveAppData();

   // Refresh UI
   initCategoryUI();

   // Add it to the options if in details view
   if (store.getNavStackTop() === 'details') {
      const detailsCategory = document.getElementById('detailsCategory');
      if (detailsCategory) {
         const opt = document.createElement('option');
         opt.value = newCategory.id;
         opt.textContent = newCategory.name;
         detailsCategory.appendChild(opt);
      }
   }
   return true;
}

export function initCategoryButtons() {
   document.querySelectorAll('.cat-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
         if (!preventClickOnLongPress || e.target !== preventClickOnLongPress) {
            document.querySelectorAll('.cat-btn').forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
            const catId = btn.dataset.cat;
            openGallery(catId);
         } else {
            preventClickOnLongPress = null;
         }
      });
   });
}

export function initCategoryDeleteHandlers() {
   // Add delete button handlers for long-press
   document.querySelectorAll('#categories li').forEach(li => {
      const btn = li.querySelector('.cat-btn');
      const catId = btn?.dataset.cat;

      // Don't add delete handler to 'all' category
      if (catId === 'all') return;

      li.addEventListener('contextmenu', (e) => e.preventDefault());

      // Long-press to show delete
      let timer = null;
      li.addEventListener('pointerdown', (e) => {
         if (e.button !== undefined && e.button !== 0) return;
         timer = setTimeout(() => {
            timer = null;
            preventClickOnLongPress = e.target;
            showDeleteButton(li, catId);
         }, 350);
      });

      li.addEventListener('pointerup', () => {
         if (timer) clearTimeout(timer);
      });

      li.addEventListener('pointerleave', () => {
         if (timer) clearTimeout(timer);
      });
   });
}

export function updateCategoryTitles(category) {
   const buttonToUpdate = document.querySelector(`#categories li button[data-cat=${category.id}]`);
   buttonToUpdate.textContent = category.name;
}

function showDeleteButton(li, catId) {
   // Only add once
   if (li.querySelector('.cat-delete-btn')) return;

   const del = document.createElement('button');
   del.type = 'button';
   del.className = 'cat-delete-btn';
   del.setAttribute('aria-label', 'Delete category');
   del.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24"
     fill="none" stroke="currentColor" stroke-width="2.2"
     stroke-linecap="round" stroke-linejoin="round">
   <polyline points="3 6 5 6 21 6"/>
   <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
   <path d="M10 11v6"/><path d="M14 11v6"/>
   <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
 </svg>`;

   del.addEventListener('click', async (e) => {
      e.stopPropagation();
      await deleteCategory(catId);
   });

   li.style.display = 'flex';
   li.style.alignItems = 'center';
   li.appendChild(del);

   // Auto-dismiss after 4s if unused
   setTimeout(() => {
      if (del.parentElement) del.remove();
   }, 4000);
}

/**
 * Initialize or refresh category UI from store
 */
export function initCategoryUI() {
   const categoriesList = document.querySelector('#categories ul');
   if (!categoriesList) return;

   // Clear and rebuild list
   categoriesList.innerHTML = '';

   // Always add 'all' first
   const allLi = document.createElement('li');
   const allBtn = document.createElement('button');
   allBtn.type = 'button';
   allBtn.className = 'cat-btn selected';
   allBtn.dataset.cat = 'all';
   allBtn.textContent = 'All caps';
   allLi.appendChild(allBtn);
   categoriesList.appendChild(allLi);

   // Add all other categories
   store.store.categories.forEach(cat => {
      if (cat.id !== 'all') {
         const li = document.createElement('li');
         const btn = document.createElement('button');
         btn.type = 'button';
         btn.className = 'cat-btn';
         btn.dataset.cat = cat.id;
         btn.textContent = cat.name;
         btn.style.borderLeftColor = cat.color;
         btn.style.borderLeftWidth = '4px';
         btn.style.paddingLeft = '12px';
         li.appendChild(btn);
         categoriesList.appendChild(li);
      }
   });

   // Re-initialize handlers
   initCategoryButtons();
   initCategoryDeleteHandlers();
}
