// ── Category management ────────────────────────────────────────────────────
import Modal from '../ui/modal.js';
import { openGallery } from '../data/gallery.js';

// ── Add long press event handler ───────────────────────────────────────────
function addLongPress(el, onLongPress, delay = 350) {
   let timer = null;

   function start(e) {
      // only main button / first touch
      if (e.button !== undefined && e.button !== 0) return;
      timer = setTimeout(() => { timer = null; onLongPress(e); }, delay);
   }

   function cancel() {
      if (timer) { clearTimeout(timer); timer = null; }
   }

   el.addEventListener('pointerdown', start);
   el.addEventListener('pointerup', cancel);
   el.addEventListener('pointerleave', cancel);
   el.addEventListener('pointermove', cancel); // cancel if dragging
}

export async function deleteCategory(categoryId) {
   const confirmed = await Modal.confirm({
      question: 'Remove this category from your collection? This cannot be undone.',
      yesLabel: 'Yes',
      noLabel: 'No',
   });

   if (!confirmed) return; // user said no or dismissed
   // TODO: Implement API call and UI update
}

export async function handleAddCategoryClick() {
   const result = await Modal.addItem({ type: 'category' });

   if (!result) return; // user cancelled

   // result = { name: 'Snapbacks', color: '#3B82F6' }
   // TODO: Implement API call and store update
}

export function initCategoryButtons() {
   document.querySelectorAll('.cat-btn').forEach(btn => {
      btn.addEventListener('click', () => {
         document.querySelectorAll('.cat-btn').forEach(b => b.classList.remove('selected'));
         btn.classList.add('selected');
         openGallery(btn.dataset.cat);
      });
   });
}

export function initCategoryDeleteHandlers() {
   document.querySelectorAll('#categories li').forEach(li => {
      li.addEventListener(`contextmenu`, (e) => e.preventDefault());

      addLongPress(li, (event) => {
         // Don't show delete on ALL
         const btn = li.querySelector('.cat-btn');
         if (btn?.dataset.cat === 'all') return;

         // Idempotent — only add once
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

         del.addEventListener('click', (e) => {
            e.stopPropagation(); // don't trigger the category button
            // TODO: Call deleteCategory
            li.remove();
         });

         li.style.display = 'flex';
         li.style.alignItems = 'center';
         li.appendChild(del);

         // Auto-dismiss after 3 s if unused
         setTimeout(() => del.remove(), 4500);
      });
   });
}
