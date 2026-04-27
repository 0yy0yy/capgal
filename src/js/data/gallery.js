// ── Gallery operations ────────────────────────────────────────────────────
import * as store from '../data/store.js';
import { pushTab } from '../ui/navigation.js';
import { updateGallerySelection } from '../ui/gallery-selection.js';

const galleryList = document.getElementById('galleryList');
const galleryTitle = document.getElementById('galleryTitle');
const searchBar = document.getElementById('searchBar');
const searchInput = document.getElementById('searchInput');

export function openGallery(category, focusSearch = false) {
   store.setCurrentCategory(category);

   // Delete button
   const deleteBtn = document.getElementById('gallery').querySelector('#deleteButton');
   deleteBtn.hidden = (category === 'all');

   // Title
   galleryTitle.textContent = category === 'all'
      ? 'ALL caps'
      : category.charAt(0).toUpperCase() + category.slice(1);
   galleryTitle.setAttribute('contenteditable', category !== 'all')

   // Search bar visibility
   searchBar.classList.toggle('visible', category === 'all');

   // Render items
   const filtered = category === 'all' ? store.caps : store.caps.filter(c => c.category === category);
   galleryList.innerHTML = filtered.map(cap => `
      <li data-id="${cap.id}" style="background:${cap.color}" title="${cap.tag}">
        <img src="" alt="${cap.tag}" style="display:none" />
      </li>
    `).join('');

   // Click handlers
   galleryList.querySelectorAll('li').forEach(li => {
      li.addEventListener('click', () => openDetails(Number(li.dataset.id)));
   });

   // Initialize selection mode for gallery items
   updateGallerySelection();

   pushTab('gallery');

   if (focusSearch) {
      // Wait for transition to end then focus
      setTimeout(() => searchInput.focus(), 350);
   }
}

export function openDetails(id) {
   const cap = store.caps.find(c => c.id === id);
   if (!cap) return;
   document.getElementById('detailsTitle').textContent = cap.tag;
   document.getElementById('detailsTag').selected = "tag3";
   document.getElementById('detailsDesc').textContent = cap.description;
   document.getElementById('detailsImage').style.background = cap.color;
   document.getElementById('detailsImage').style.minHeight = '180px';
   pushTab('details');
}

export function initGallerySearch() {
   searchInput.addEventListener('input', () => {
      const q = searchInput.value.toLowerCase();
      galleryList.querySelectorAll('li').forEach(li => {
         const id = Number(li.dataset.id);
         const cap = store.caps.find(c => c.id === id);
         const match = !q || cap.tag.toLowerCase().includes(q) || cap.description.toLowerCase().includes(q);
         li.style.display = match ? '' : 'none';
      });
   });
}
