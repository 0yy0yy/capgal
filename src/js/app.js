//import { init as initGUI } from "./ui/ui.js"
//initGUI()






import Modal from './ui/modal.js';

async function deleteCap(capId) {
   const confirmed = await Modal.confirm({
      question: 'Remove this cap from your collection? This cannot be undone.',
      yesLabel: 'Yes',
      noLabel: 'No',
   });

   if (!confirmed) return; // user said no or dismissed

   /* await api.delete(`/caps/${capId}`);
   ui.removeCap(capId); */
}


async function deleteCategory(categoryId) {
   const confirmed = await Modal.confirm({
      question: 'Remove this category from your collection? This cannot be undone.',
      yesLabel: 'Yes',
      noLabel: 'No',
   });

   if (!confirmed) return; // user said no or dismissed

   /* await api.delete(`/caps/${capId}`);
   ui.removeCap(capId); */
}


async function handleAddCategoryClick() {
   const result = await Modal.addItem({ type: 'category' });

   if (!result) return; // user cancelled

   // result = { name: 'Snapbacks', color: '#3B82F6' }
   /* const newCategory = await api.post('/categories', result);
   store.categories.push(newCategory);
   ui.renderCategoryList(store.categories); */
}


/* import { openCamera } from './camera.js';    // returns a Blob
import { cropAndEnhance } from './imageProc.js'; // postprocesses a Blob → Blob

async function handleScanAndAdd() {
   // 1. External image acquisition + processing
   const rawBlob = await openCamera();
   const processedBlob = await cropAndEnhance(rawBlob);

   // 2. Hand the image to the modal before opening it
   Modal.setPendingImage(processedBlob);

   // 3. Open the cap modal — image slot is pre-populated
   const result = await Modal.addItem({
      type: 'cap',
      categories: store.categories,
   });

   if (!result) return;

   // result.image is the processedBlob (or a replacement chosen by the user)
   const form = new FormData();
   form.append('file', result.image);
   const { url } = await api.post('/uploads', form);

   await api.post('/caps', {
      categoryId: result.tag,
      description: result.description,
      imageUrl: url,
   });
} */


async function addCapsInBatch() {
   let keepAdding = true;

   while (keepAdding) {
      const result = await Modal.addItem({
         type: 'cap',
         categories: [],
      });

      if (!result) break; // user cancelled → stop the loop

      //await saveCap(result);

      keepAdding = await Modal.confirm({
         question: 'Cap added! Do you want to add another one?',
         yesLabel: 'Add another',
         noLabel: 'Done',
      });
   }
}






// ── Dummy cap data ──────────────────────────────────────────────────────────
const caps = Array.from({ length: 12 }, (_, i) => ({
   id: i,
   tag: `CAP-${String(i).padStart(3, '0')}`,
   description: ['New Era 59FIFTY', 'Vintage Snapback', 'Dad Hat', 'Trucker Cap'][i % 4],
   category: ['all', 'blue', 'red', 'vintage'][i % 4],
   // Using a placeholder color block instead of a real file
   color: ['#4a90d9', '#e25c5c', '#7bc67a', '#c8a96e', '#9b6fd4', '#5bc8ac'][i % 6],
}));

// ── State ──────────────────────────────────────────────────────────────────
let currentCategory = 'all';
let settingsOpen = false;
// navStack drives which tabs are active / behind
// Possible values: 'categories', 'gallery', 'details'
let navStack = ['categories'];

// ── Elements ───────────────────────────────────────────────────────────────
const tabEls = {
   categories: document.getElementById('categories'),
   gallery: document.getElementById('gallery'),
   details: document.getElementById('details'),
};
const galleryList = document.getElementById('galleryList');
const galleryTitle = document.getElementById('galleryTitle');
const searchBar = document.getElementById('searchBar');
const searchInput = document.getElementById('searchInput');
const settingsPanel = document.getElementById('settings');
const settingsBackdrop = document.getElementById('settings-backdrop');

// ── Tab navigation (the core transition engine) ─────────────────────────────
function applyTabStates() {
   const top = navStack[navStack.length - 1];
   const behind = navStack[navStack.length - 2] || null;

   Object.entries(tabEls).forEach(([name, el]) => {
      el.classList.remove('active', 'behind');
      if (name === top) el.classList.add('active');
      else if (name === behind) el.classList.add('behind');
      // else: off-screen (translateX 100%)
   });
}

function pushTab(name) {
   if (navStack[navStack.length - 1] === name) return;
   navStack.push(name);
   applyTabStates();
}

function popTab() {
   if (navStack.length <= 1) return;
   navStack.pop();
   applyTabStates();
}

// ── Gallery population ─────────────────────────────────────────────────────
function openGallery(category, focusSearch = false) {
   currentCategory = category;

   // Delete button
   const deleteBtn = tabEls.gallery.querySelector('#deleteButton');
   deleteBtn.hidden = (category === 'all');

   // Title
   galleryTitle.textContent = category === 'all'
      ? 'ALL caps'
      : category.charAt(0).toUpperCase() + category.slice(1);

   // Search bar visibility
   searchBar.classList.toggle('visible', category === 'all');

   // Render items
   const filtered = category === 'all' ? caps : caps.filter(c => c.category === category);
   galleryList.innerHTML = filtered.map(cap => `
      <li data-id="${cap.id}" style="background:${cap.color}" title="${cap.tag}">
        <img src="" alt="${cap.tag}" style="display:none" />
      </li>
    `).join('');

   // Click handlers
   galleryList.querySelectorAll('li').forEach(li => {
      li.addEventListener('click', () => openDetails(Number(li.dataset.id)));
   });

   pushTab('gallery');

   if (focusSearch) {
      // Wait for transition to end then focus
      setTimeout(() => searchInput.focus(), 350);
   }
}

// ── Details ────────────────────────────────────────────────────────────────
function openDetails(id) {
   const cap = caps.find(c => c.id === id);
   if (!cap) return;
   document.getElementById('detailsTitle').textContent = cap.tag;
   document.getElementById('detailsTag').selected = "tag3";
   document.getElementById('detailsDesc').textContent = cap.description;
   //document.getElementById('detailsCat').textContent = cap.category;
   document.getElementById('detailsImage').style.background = cap.color;
   document.getElementById('detailsImage').style.minHeight = '180px';
   pushTab('details');
}

// ── Category buttons ───────────────────────────────────────────────────────
document.querySelectorAll('.cat-btn').forEach(btn => {
   btn.addEventListener('click', () => {
      document.querySelectorAll('.cat-btn').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      openGallery(btn.dataset.cat);
   });
});

// ── Delete category long press button ───────────────────────────────────────────────────────
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

// Attach to each category <li>
document.querySelectorAll('#categories li').forEach(li => {
   li.addEventListener(`contextmenu`, (e) => e.preventDefault());

   addLongPress(li, (event) => {
      // Don't show delete on ALL
      const btn = li.querySelector('.cat-btn');
      if (btn?.dataset.cat === 'all') return;

      // Idempotent — only add once
      if (li.querySelector('.cat-delete-btn')) return;

      //event.preventDefault();
      //event.stopImmediatePropagation();

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
         // your delete logic here
         li.remove();
      });

      li.style.display = 'flex';
      li.style.alignItems = 'center';
      li.appendChild(del);

      // Auto-dismiss after 3 s if unused
      setTimeout(() => del.remove(), 4500);
   });
});

// ── Back buttons ───────────────────────────────────────────────────────────
document.getElementById('galleryBack').addEventListener('click', popTab);
document.getElementById('detailsBack').addEventListener('click', popTab);

// ── Search button (FAB) ───────────────────────────────────────────────────
document.getElementById('searchButton').addEventListener('click', () => {
   // Select "all" category first
   document.querySelectorAll('.cat-btn').forEach(b => b.classList.remove('selected'));
   document.querySelector('[data-cat="all"]').classList.add('selected');

   if (navStack.at(-1) === 'gallery' && currentCategory === 'all') {
      // Already there — just focus search input
      searchInput.focus();
   } else {
      // Reset stack to categories then push gallery
      navStack = ['categories'];
      openGallery('all', true);
   }
});

// ── Add category button (FAB) ───────────────────────────────────────────────────
document.getElementById('addCategoryButton').addEventListener('click', () => {
   handleAddCategoryClick();
});

// ── Add cap button (FAB) ───────────────────────────────────────────────────
document.getElementById('addCapButton').addEventListener('click', () => {
   addCapsInBatch();
});

// ── Settings ───────────────────────────────────────────────────────────────
function openSettings() {
   settingsPanel.classList.add('open');
   settingsBackdrop.classList.add('visible');
   settingsOpen = true;
}

function closeSettings() {
   settingsPanel.classList.remove('open');
   settingsBackdrop.classList.remove('visible');
   settingsOpen = false;
}

document.getElementById('settingsButton').addEventListener('click', openSettings);
document.getElementById('settingsClose').addEventListener('click', closeSettings);
settingsBackdrop.addEventListener('click', closeSettings);

// ── Theme switcher ─────────────────────────────────────────────────────────
document.querySelectorAll('.theme-btn').forEach(btn => {
   btn.addEventListener('click', () => {
      document.querySelectorAll('.theme-btn').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      document.documentElement.setAttribute('data-theme', btn.dataset.themeVal);
   });
});

// ── Filter chips ───────────────────────────────────────────────────────────
document.querySelectorAll('.filter-chip').forEach(chip => {
   chip.addEventListener('click', () => {
      const active = [...chip.classList].includes('active');
      document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
      chip.classList.toggle('active', !active);
   });
});

// ── Search input live filter ────────────────────────────────────────────────
searchInput.addEventListener('input', () => {
   const q = searchInput.value.toLowerCase();
   galleryList.querySelectorAll('li').forEach(li => {
      const id = Number(li.dataset.id);
      const cap = caps.find(c => c.id === id);
      const match = !q || cap.tag.toLowerCase().includes(q) || cap.description.toLowerCase().includes(q);
      li.style.display = match ? '' : 'none';
   });
});

// ── Narrow sidebar toggle ──────────────────────────────────────────────────
const fabsEl = document.getElementById('fabs');
const fabsBackdrop = document.getElementById('fabs-backdrop');
const menuToggle = document.getElementById('menuToggle');

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

// ── Init ───────────────────────────────────────────────────────────────────
applyTabStates();